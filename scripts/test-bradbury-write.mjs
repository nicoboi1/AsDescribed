import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(projectRoot, ".env");
const reportPath = path.join(
  projectRoot,
  "artifacts",
  "bradbury-write-retry.json",
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

function requireValue(values, key) {
  const value = values.get(key) ?? "";
  if (!value) throw new Error(`${key} is missing from .env.`);
  return value;
}

function privateKeyFrom(value) {
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error("ACCOUNT_PRIVATE_KEY is invalid.");
  }
  return privateKey;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function jsonSafe(value) {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  );
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const contractAddress = requireValue(env, "VITE_CONTRACT_ADDRESS");
assert(/^0x[0-9a-fA-F]{40}$/.test(contractAddress), "Contract address is invalid.");

const account = createAccount(
  privateKeyFrom(requireValue(env, "ACCOUNT_PRIVATE_KEY")),
);
const client = createClient({
  account,
  chain: testnetBradbury,
});
const listingId = `recovery-test-${Date.now().toString(36)}`;
const startedAt = new Date().toISOString();
let transactionHash = null;
let receipt = null;
let storedListing = null;
let marketBefore = null;
let marketAfter = null;
let passed = false;
let errorMessage = null;

console.log(`Network: Bradbury (${testnetBradbury.id})`);
console.log(`Contract: ${contractAddress}`);
console.log(`Test listing: ${listingId}`);

try {
  marketBefore = await client.readContract({
    address: contractAddress,
    functionName: "get_market_state",
    args: [],
    stateStatus: "accepted",
    jsonSafeReturn: true,
  });

  transactionHash = await client.writeContract({
    account,
    address: contractAddress,
    functionName: "create_listing",
    args: [
      listingId,
      "Bradbury Recovery Test",
      "A testnet listing used to verify that validator writes recovered after a leader timeout.",
      "https://example.com/asdescribed-recovery-test",
      1_000_000_000_000_000n,
      "Integration-test artifact only; no physical fulfillment is promised.",
      new Date().toISOString(),
    ],
    value: 0n,
  });
  console.log(`Transaction: ${transactionHash}`);
  console.log("Waiting for consensus...");

  await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries: 120,
    fullTransaction: false,
  });
  // The simplified wait receipt can omit statusName on Bradbury. Re-read the
  // canonical transaction before deciding whether execution succeeded.
  receipt = await client.getTransaction({ hash: transactionHash });

  console.log(`Status: ${receipt.statusName}`);
  console.log(`Consensus: ${receipt.resultName}`);
  console.log(`Execution: ${receipt.txExecutionResultName}`);

  const acceptedOrFinalized =
    receipt.statusName === TransactionStatus.ACCEPTED ||
    receipt.statusName === TransactionStatus.FINALIZED;
  assert(acceptedOrFinalized, `Network ended in ${receipt.statusName}.`);
  assert(receipt.resultName === "AGREE", `Consensus ended in ${receipt.resultName}.`);
  assert(
    receipt.txExecutionResultName === "FINISHED_WITH_RETURN",
    `Execution ended in ${receipt.txExecutionResultName}.`,
  );

  [storedListing, marketAfter] = await Promise.all([
    client.readContract({
      address: contractAddress,
      functionName: "get_listing",
      args: [listingId],
      stateStatus: "accepted",
      jsonSafeReturn: true,
    }),
    client.readContract({
      address: contractAddress,
      functionName: "get_market_state",
      args: [],
      stateStatus: "accepted",
      jsonSafeReturn: true,
    }),
  ]);

  assert(storedListing.listing_id === listingId, "Stored listing ID does not match.");
  assert(storedListing.status === "AVAILABLE", "Stored listing is not AVAILABLE.");
  assert(
    String(storedListing.seller).toLowerCase() === account.address.toLowerCase(),
    "Stored seller does not match the signer.",
  );
  assert(
    Number(marketAfter.listing_count) === Number(marketBefore.listing_count) + 1,
    "listing_count did not increase exactly once.",
  );

  passed = true;
  console.log("PASS - write consensus and state persistence verified");
} catch (error) {
  errorMessage = error instanceof Error ? error.message : String(error);
  console.log(`FAIL - ${errorMessage.slice(0, 300)}`);
}

const report = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  contractAddress,
  testAccount: account.address,
  listingId,
  startedAt,
  completedAt: new Date().toISOString(),
  transactionHash,
  passed,
  receipt: receipt
    ? {
        status: receipt.statusName,
        statusCode: receipt.status,
        result: receipt.resultName,
        execution: receipt.txExecutionResultName,
        votesCommitted: receipt.lastRound?.votesCommitted,
        votesRevealed: receipt.lastRound?.votesRevealed,
      }
    : null,
  marketBefore: jsonSafe(marketBefore),
  marketAfter: jsonSafe(marketAfter),
  storedListing: jsonSafe(storedListing),
  error: errorMessage,
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Report: ${path.relative(projectRoot, reportPath)}`);

if (!passed) process.exitCode = 1;
