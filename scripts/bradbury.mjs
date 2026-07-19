import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(projectRoot, ".env");
const contractPath = path.join(projectRoot, "contracts", "as_described.py");
const deploymentPath = path.join(
  projectRoot,
  "deployments",
  "bradbury.json",
);

function parseEnv(contents) {
  const values = new Map();

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) value = value.slice(1, -1);
    values.set(key, value);
  }

  return values;
}

function loadPrivateKey() {
  if (!fs.existsSync(envPath)) {
    throw new Error("Missing .env file.");
  }

  const values = parseEnv(fs.readFileSync(envPath, "utf8"));
  let privateKey = values.get("ACCOUNT_PRIVATE_KEY") ?? "";
  if (!privateKey.startsWith("0x")) privateKey = `0x${privateKey}`;

  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(
      "ACCOUNT_PRIVATE_KEY must contain exactly 32 bytes of hexadecimal data.",
    );
  }

  return privateKey;
}

function formatGen(wei) {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .slice(0, 6)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`;
}

function setPublicContractAddress(contractAddress) {
  const contents = fs.readFileSync(envPath, "utf8");
  const nextLine = `VITE_CONTRACT_ADDRESS=${contractAddress}`;
  const expression = /^VITE_CONTRACT_ADDRESS=.*$/m;
  const updated = expression.test(contents)
    ? contents.replace(expression, nextLine)
    : `${contents.replace(/\s*$/, "")}\n${nextLine}\n`;
  fs.writeFileSync(envPath, updated, "utf8");
}

async function createBradburyContext() {
  const account = createAccount(loadPrivateKey());
  const client = createClient({
    account,
    chain: testnetBradbury,
  });
  const balance = await client.getBalance({ address: account.address });

  console.log(`Network: Bradbury (${testnetBradbury.id})`);
  console.log(`Dedicated address: ${account.address}`);
  console.log(`Balance: ${formatGen(balance)}`);

  return { account, balance, client };
}

async function recordDeployment(client, transactionHash) {
  const receipt = await client.getTransaction({ hash: transactionHash });
  const successfulStatus =
    receipt.statusName === TransactionStatus.ACCEPTED ||
    receipt.statusName === TransactionStatus.FINALIZED;

  if (
    !successfulStatus ||
    receipt.txExecutionResultName !== "FINISHED_WITH_RETURN"
  ) {
    throw new Error(
      `Deployment is not ready: status=${receipt.statusName ?? receipt.status ?? "UNKNOWN"}, execution=${receipt.txExecutionResultName ?? "UNKNOWN"}.`,
    );
  }

  const contractAddress = receipt.txDataDecoded?.contractAddress;
  if (!contractAddress) {
    throw new Error(
      `Deployment succeeded but no contract address was decoded. Inspect transaction ${transactionHash}.`,
    );
  }

  const schema = await client.getContractSchema(contractAddress);
  const methodCount = Object.keys(schema.methods ?? {}).length;

  setPublicContractAddress(contractAddress);
  fs.mkdirSync(path.dirname(deploymentPath), { recursive: true });
  fs.writeFileSync(
    deploymentPath,
    `${JSON.stringify(
      {
        network: "testnet-bradbury",
        chainId: testnetBradbury.id,
        sender: receipt.sender ?? receipt.from_address,
        contractAddress,
        transactionHash,
        status: receipt.statusName,
        executionResult: receipt.txExecutionResultName,
        schemaMethodCount: methodCount,
        deployedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`Contract: ${contractAddress}`);
  console.log(`Schema methods: ${methodCount}`);
  console.log(`Network status: ${receipt.statusName}`);
  console.log("Updated VITE_CONTRACT_ADDRESS in .env.");
}

async function deploy() {
  const { account, balance, client } = await createBradburyContext();
  if (balance === 0n) {
    throw new Error(
      "The dedicated Bradbury address has no test GEN. Fund it at https://testnet-faucet.genlayer.foundation/ and run this command again.",
    );
  }

  const code = fs.readFileSync(contractPath, "utf8");
  const transactionHash = await client.deployContract({
    account,
    code,
    args: [],
  });
  console.log(`Transaction: ${transactionHash}`);
  console.log("Waiting for validator consensus...");

  const receipt = await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries: 120,
    fullTransaction: false,
  });

  await recordDeployment(client, receipt.hash ?? transactionHash);
}

const command = process.argv[2] ?? "status";

try {
  if (command === "status") {
    await createBradburyContext();
  } else if (command === "deploy") {
    await deploy();
  } else if (command === "record") {
    const transactionHash = process.argv[3];
    if (!/^0x[0-9a-fA-F]{64}$/.test(transactionHash ?? "")) {
      throw new Error("record requires a valid transaction hash.");
    }
    const client = createClient({ chain: testnetBradbury });
    await recordDeployment(client, transactionHash);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
