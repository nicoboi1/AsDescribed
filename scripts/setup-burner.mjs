import fs from "node:fs";
import path from "node:path";
import {
  createAccount,
  createClient,
  generatePrivateKey,
} from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(projectRoot, ".env");
const reportPath = path.join(projectRoot, "artifacts", "burner-setup.json");
const targetBalance = 5n * 10n ** 18n;

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

function normalizeKey(value, label) {
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`${label} is not a valid 32-byte private key.`);
  }
  return privateKey;
}

function setEnvValue(contents, key, value) {
  const line = `${key}=${value}`;
  const expression = new RegExp(`^${key}=.*$`, "m");
  return expression.test(contents)
    ? contents.replace(expression, line)
    : `${contents.replace(/\s*$/, "")}\n${line}\n`;
}

function formatGen(wei) {
  const whole = wei / 10n ** 18n;
  const fraction = (wei % 10n ** 18n)
    .toString()
    .padStart(18, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`;
}

async function waitForBalance(client, address, minimum) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const balance = await client.getBalance({ address });
    if (balance >= minimum) return balance;
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  throw new Error("Timed out waiting for the burner funding transfer.");
}

const envContents = fs.readFileSync(envPath, "utf8");
const env = parseEnv(envContents);
const sellerKey = normalizeKey(
  env.get("ACCOUNT_PRIVATE_KEY") ?? "",
  "ACCOUNT_PRIVATE_KEY",
);
let buyerKey = env.get("TEST_BUYER_PRIVATE_KEY") ?? "";
let generated = false;

if (!buyerKey) {
  buyerKey = generatePrivateKey();
  fs.writeFileSync(
    envPath,
    setEnvValue(envContents, "TEST_BUYER_PRIVATE_KEY", buyerKey),
    "utf8",
  );
  generated = true;
}
buyerKey = normalizeKey(buyerKey, "TEST_BUYER_PRIVATE_KEY");

const seller = createAccount(sellerKey);
const buyer = createAccount(buyerKey);
const client = createClient({
  account: seller,
  chain: testnetBradbury,
});
const sellerBalanceBefore = await client.getBalance({ address: seller.address });
const buyerBalanceBefore = await client.getBalance({ address: buyer.address });
let fundingHash = null;
let buyerBalanceAfter = buyerBalanceBefore;

console.log(`Seller test account: ${seller.address}`);
console.log(`Buyer burner: ${buyer.address}`);
console.log(
  `Burner key: ${generated ? "generated and stored in ignored .env" : "reused from ignored .env"}`,
);
console.log(`Buyer balance: ${formatGen(buyerBalanceBefore)}`);

if (buyerBalanceBefore < targetBalance) {
  const amount = targetBalance - buyerBalanceBefore;
  if (sellerBalanceBefore <= amount) {
    throw new Error("The seller test account cannot fund the burner target.");
  }
  fundingHash = await client.sendTransaction({
    account: seller,
    to: buyer.address,
    value: amount,
  });
  console.log(`Funding transaction: ${fundingHash}`);
  buyerBalanceAfter = await waitForBalance(client, buyer.address, targetBalance);
}

const report = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  sellerAddress: seller.address,
  buyerBurnerAddress: buyer.address,
  generated,
  targetBalanceWei: targetBalance.toString(),
  sellerBalanceBeforeWei: sellerBalanceBefore.toString(),
  buyerBalanceBeforeWei: buyerBalanceBefore.toString(),
  buyerBalanceAfterWei: buyerBalanceAfter.toString(),
  fundingTransactionHash: fundingHash,
  completedAt: new Date().toISOString(),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Funded buyer balance: ${formatGen(buyerBalanceAfter)}`);
console.log(`Report: ${path.relative(projectRoot, reportPath)}`);
