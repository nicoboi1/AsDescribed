import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(projectRoot, ".env");
const reportPath = path.join(projectRoot, "artifacts", "bradbury-e2e.json");
const resume = process.argv.includes("--resume");
const priorReport =
  resume && fs.existsSync(reportPath)
    ? JSON.parse(fs.readFileSync(reportPath, "utf8"))
    : null;
const price = 10_000_000_000_000_000n;
const runId = Date.now().toString(36);
const listingId = priorReport?.listingId ?? `e2e-listing-${runId}`;
const orderId = priorReport?.orderId ?? `e2e-order-${runId}`;

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

function normalizePrivateKey(value, label) {
  const privateKey = value.startsWith("0x") ? value : `0x${value}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error(`${label} is invalid.`);
  }
  return privateKey;
}

function normalizeStatus(statusName, statusCode) {
  if (statusName) return statusName;
  return {
    5: "ACCEPTED",
    7: "FINALIZED",
    12: "VALIDATORS_TIMEOUT",
    13: "LEADER_TIMEOUT",
  }[Number(statusCode)] ?? `STATUS_${statusCode}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const env = parseEnv(fs.readFileSync(envPath, "utf8"));
const contractAddress = requireValue(env, "VITE_CONTRACT_ADDRESS");
const seller = createAccount(
  normalizePrivateKey(requireValue(env, "ACCOUNT_PRIVATE_KEY"), "ACCOUNT_PRIVATE_KEY"),
);
const buyer = createAccount(
  normalizePrivateKey(
    requireValue(env, "TEST_BUYER_PRIVATE_KEY"),
    "TEST_BUYER_PRIVATE_KEY",
  ),
);
const sellerClient = createClient({ account: seller, chain: testnetBradbury });
const buyerClient = createClient({ account: buyer, chain: testnetBradbury });
const reader = createClient({ chain: testnetBradbury });
const transactions = priorReport?.transactions ?? [];

if (
  priorReport?.error &&
  transactions.some((transaction) => transaction.name === "create_listing") &&
  !transactions.some((transaction) => transaction.name === "purchase")
) {
  const interruptedHash = priorReport.error.match(/0x[0-9a-fA-F]{64}/)?.[0];
  if (interruptedHash) {
    transactions.push({
      name: "purchase",
      attempt: 1,
      hash: interruptedHash,
      status: "UNKNOWN",
      result: null,
      execution: null,
      votesCommitted: null,
      votesRevealed: null,
    });
  }
}

const report = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  contractAddress,
  sellerAddress: seller.address,
  buyerBurnerAddress: buyer.address,
  listingId,
  orderId,
  priceWei: price.toString(),
  startedAt: priorReport?.startedAt ?? new Date().toISOString(),
  resumedAt: resume ? new Date().toISOString() : null,
  passed: false,
  transactions,
  finalListing: priorReport?.finalListing ?? null,
  finalOrder: priorReport?.finalOrder ?? null,
  marketBefore: priorReport?.marketBefore ?? null,
  marketAfter: priorReport?.marketAfter ?? null,
  error: null,
};

function saveReport() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    reportPath,
    `${JSON.stringify(
      report,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    )}\n`,
    "utf8",
  );
}

async function inspectTransaction(record, client) {
  try {
    await client.waitForTransactionReceipt({
      hash: record.hash,
      status: TransactionStatus.ACCEPTED,
      interval: 5_000,
      retries: 120,
      fullTransaction: false,
    });
  } catch (waitError) {
    const receipt = await client.getTransaction({ hash: record.hash });
    record.status = normalizeStatus(receipt.statusName, receipt.status);
    record.result = receipt.resultName;
    record.execution = receipt.txExecutionResultName;
    record.votesCommitted = receipt.lastRound?.votesCommitted;
    record.votesRevealed = receipt.lastRound?.votesRevealed;
    saveReport();

    const terminalTimeout =
      record.status === "LEADER_TIMEOUT" ||
      record.status === "VALIDATORS_TIMEOUT";
    if (!terminalTimeout) {
      throw new Error(
        `${record.name} is still ${record.status} at ${record.hash}; resume later with npm run test:bradbury-e2e -- --resume. ${waitError instanceof Error ? waitError.message : String(waitError)}`,
      );
    }
  }

  const receipt = await client.getTransaction({ hash: record.hash });
  record.status = normalizeStatus(receipt.statusName, receipt.status);
  record.result = receipt.resultName;
  record.execution = receipt.txExecutionResultName;
  record.votesCommitted = receipt.lastRound?.votesCommitted;
  record.votesRevealed = receipt.lastRound?.votesRevealed;
  saveReport();
  console.log(
    `${record.name}: ${record.status} / ${record.result} / ${record.execution}`,
  );

  return (
    (record.status === "ACCEPTED" || record.status === "FINALIZED") &&
    record.result === "AGREE" &&
    record.execution === "FINISHED_WITH_RETURN"
  );
}

async function execute(name, client, request) {
  const existing = transactions.filter((transaction) => transaction.name === name);

  for (const record of existing) {
    if (await inspectTransaction(record, client)) return record;
    const safeNetworkRetry =
      record.status === "LEADER_TIMEOUT" ||
      record.status === "VALIDATORS_TIMEOUT";
    if (!safeNetworkRetry) {
      throw new Error(
        `${name} failed with ${record.status} / ${record.result} / ${record.execution}.`,
      );
    }
  }

  for (let attempt = existing.length + 1; attempt <= 2; attempt += 1) {
    const hash = await client.writeContract({
      address: contractAddress,
      functionName: request.functionName,
      args: request.args,
      value: request.value ?? 0n,
    });
    console.log(`${name} transaction${attempt > 1 ? ` retry ${attempt}` : ""}: ${hash}`);
    const record = {
      name,
      attempt,
      hash,
      status: "SUBMITTED",
      result: null,
      execution: null,
      votesCommitted: null,
      votesRevealed: null,
    };
    transactions.push(record);
    saveReport();
    if (await inspectTransaction(record, client)) return record;

    const safeNetworkRetry =
      record.status === "LEADER_TIMEOUT" ||
      record.status === "VALIDATORS_TIMEOUT";
    if (safeNetworkRetry && attempt === 1) {
      console.log(`${name}: network timeout before execution; retrying once.`);
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      continue;
    }
    throw new Error(
      `${name} failed with ${record.status} / ${record.result} / ${record.execution}.`,
    );
  }
  throw new Error(`${name} exhausted its retry policy.`);
}

console.log(`Contract: ${contractAddress}`);
console.log(`Seller: ${seller.address}`);
console.log(`Buyer burner: ${buyer.address}`);
console.log(`Listing: ${listingId}`);

try {
  report.marketBefore ??= await reader.readContract({
      address: contractAddress,
      functionName: "get_market_state",
      args: [],
    });

  await execute("create_listing", sellerClient, {
    functionName: "create_listing",
    args: [
      listingId,
      "MVP Pro End-to-End Test",
      "A Bradbury testnet listing that verifies the complete happy-path marketplace lifecycle.",
      "https://example.com/asdescribed-e2e",
      price,
      "Automated burner-wallet integration test. No physical fulfillment.",
      new Date().toISOString(),
    ],
  });

  await execute("purchase", buyerClient, {
    functionName: "purchase",
    args: [listingId, orderId, new Date().toISOString()],
    value: price,
  });

  await execute("mark_delivered", sellerClient, {
    functionName: "mark_delivered",
    args: [
      orderId,
      "https://example.com/asdescribed-e2e-delivery",
      "Automated delivery record for the Bradbury MVP Pro integration test.",
      new Date().toISOString(),
    ],
  });

  await execute("confirm_receipt", buyerClient, {
    functionName: "confirm_receipt",
    args: [orderId, new Date().toISOString()],
  });

  const [finalListing, finalOrder, marketAfter] = await Promise.all([
    reader.readContract({
      address: contractAddress,
      functionName: "get_listing",
      args: [listingId],
    }),
    reader.readContract({
      address: contractAddress,
      functionName: "get_order",
      args: [orderId],
    }),
    reader.readContract({
      address: contractAddress,
      functionName: "get_market_state",
      args: [],
    }),
  ]);

  assert(finalListing.status === "CLOSED", "Final listing is not CLOSED.");
  assert(finalOrder.status === "RESOLVED", "Final order is not RESOLVED.");
  assert(finalOrder.winner === "seller", "Happy-path winner is not seller.");
  assert(
    finalOrder.settlement === "SELLER_CLAIMABLE",
    "Settlement is not SELLER_CLAIMABLE.",
  );
  assert(
    Number(marketAfter.listing_count) ===
      Number(report.marketBefore.listing_count) + 1,
    "listing_count did not increase once.",
  );
  assert(
    Number(marketAfter.order_count) === Number(report.marketBefore.order_count) + 1,
    "order_count did not increase once.",
  );
  assert(
    Number(marketAfter.resolved_count) ===
      Number(report.marketBefore.resolved_count) + 1,
    "resolved_count did not increase once.",
  );

  report.finalListing = finalListing;
  report.finalOrder = finalOrder;
  report.marketAfter = marketAfter;
  report.passed = true;
  console.log("PASS - full seller/buyer happy path persisted on Bradbury.");
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  console.log(`FAIL - ${report.error}`);
} finally {
  report.completedAt = new Date().toISOString();
  saveReport();
  console.log(`Report: ${path.relative(projectRoot, reportPath)}`);
}

if (!report.passed) process.exitCode = 1;
