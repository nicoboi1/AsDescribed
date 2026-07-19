import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";

const projectRoot = path.resolve(import.meta.dirname, "..");
const envPath = path.join(projectRoot, ".env");
const deploymentPath = path.join(
  projectRoot,
  "deployments",
  "bradbury.json",
);
const reportPath = path.join(
  projectRoot,
  "artifacts",
  "bradbury-contract-tests.json",
);
const successfulListingTransaction =
  "0x4e745c6a31baa7941e83f0adb7ae205a41e6e29a18e3ef1a884dedfbb355a3d7";
const leaderTimeoutTransaction =
  "0x871c23d87cf19d2ccdb9092009ab746ac5424b26c2225990c50642ca7763140a";

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
const contractAddress = env.get("VITE_CONTRACT_ADDRESS") ?? "";
assert(
  /^0x[0-9a-fA-F]{40}$/.test(contractAddress),
  "VITE_CONTRACT_ADDRESS is invalid or missing.",
);

const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
const client = createClient({ chain: testnetBradbury });
const results = [];
let marketState;
let paginatedListings;
let knownListing;

async function test(number, name, operation) {
  const startedAt = Date.now();

  try {
    const details = await operation();
    results.push({
      number,
      name,
      passed: true,
      durationMs: Date.now() - startedAt,
      details: jsonSafe(details),
    });
    console.log(`PASS ${number}/5 - ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      number,
      name,
      passed: false,
      durationMs: Date.now() - startedAt,
      error: message.slice(0, 500),
    });
    console.log(`FAIL ${number}/5 - ${name}: ${message.slice(0, 220)}`);
  }
}

console.log(`Network: Bradbury (${testnetBradbury.id})`);
console.log(`Contract: ${contractAddress}`);
console.log("Mode: read-only verification");

await test(1, "Deployed schema exposes the expected 11 methods", async () => {
  const schema = await client.getContractSchema(contractAddress);
  const methods = Object.keys(schema.methods ?? {}).sort();
  const requiredMethods = [
    "add_evidence",
    "adjudicate",
    "confirm_receipt",
    "create_listing",
    "get_listing",
    "get_listings",
    "get_market_state",
    "get_order",
    "mark_delivered",
    "open_dispute",
    "purchase",
  ];

  assert(methods.length === 11, `Expected 11 methods, received ${methods.length}.`);
  for (const method of requiredMethods) {
    assert(methods.includes(method), `Missing method ${method}.`);
  }

  return { methodCount: methods.length, methods };
});

await test(2, "Market state is readable and internally consistent", async () => {
  marketState = await client.readContract({
    address: contractAddress,
    functionName: "get_market_state",
    args: [],
    stateStatus: "accepted",
    jsonSafeReturn: true,
  });

  assert(Number(marketState.listing_count) >= 1, "Expected at least one listing.");
  assert(Number(marketState.order_count) >= 0, "order_count is invalid.");
  assert(Number(marketState.disputed_count) >= 0, "disputed_count is invalid.");
  assert(Number(marketState.resolved_count) >= 0, "resolved_count is invalid.");
  assert(
    Number(marketState.resolved_count) <= Number(marketState.order_count),
    "resolved_count cannot exceed order_count.",
  );

  return marketState;
});

await test(3, "Listing pagination returns the stored catalog", async () => {
  paginatedListings = await client.readContract({
    address: contractAddress,
    functionName: "get_listings",
    args: [0, 20],
    stateStatus: "accepted",
    jsonSafeReturn: true,
  });

  assert(Array.isArray(paginatedListings.items), "items is not an array.");
  assert(paginatedListings.items.length >= 1, "No listings were returned.");
  assert(
    Number(paginatedListings.total) === Number(marketState.listing_count),
    "Pagination total does not match market listing_count.",
  );

  knownListing = paginatedListings.items[0];
  return {
    returned: paginatedListings.items.length,
    total: paginatedListings.total,
    firstListingId: knownListing.listing_id,
  };
});

await test(4, "Stored listing can be read and matches its seller/state", async () => {
  assert(knownListing?.listing_id, "Pagination did not provide a listing ID.");

  const listing = await client.readContract({
    address: contractAddress,
    functionName: "get_listing",
    args: [knownListing.listing_id],
    stateStatus: "accepted",
    jsonSafeReturn: true,
  });

  assert(listing.listing_id === knownListing.listing_id, "Listing ID changed.");
  assert(listing.title === "Bradbury Contract Test", "Unexpected listing title.");
  assert(listing.status === "AVAILABLE", "Test listing is not AVAILABLE.");
  assert(Number(listing.price_wei) > 0, "Listing price is not positive.");
  assert(
    String(listing.seller).toLowerCase() ===
      String(deployment.sender).toLowerCase(),
    "Listing seller does not match the deployment test account.",
  );

  return {
    listingId: listing.listing_id,
    title: listing.title,
    seller: listing.seller,
    status: listing.status,
    priceWei: listing.price_wei,
  };
});

await test(5, "Successful write receipt has consensus and persisted state", async () => {
  const receipt = await client.getTransaction({
    hash: successfulListingTransaction,
  });

  const acceptedOrFinalized =
    receipt.statusName === TransactionStatus.ACCEPTED ||
    receipt.statusName === TransactionStatus.FINALIZED;
  assert(acceptedOrFinalized, `Unexpected receipt status ${receipt.statusName}.`);
  assert(receipt.resultName === "AGREE", `Consensus result was ${receipt.resultName}.`);
  assert(
    receipt.txExecutionResultName === "FINISHED_WITH_RETURN",
    `Execution result was ${receipt.txExecutionResultName}.`,
  );
  assert(
    knownListing?.listing_id === "bradbury-test-mrrwqawn",
    "The successful transaction's listing is not present in accepted state.",
  );

  return {
    transactionHash: successfulListingTransaction,
    status: receipt.statusName,
    consensus: receipt.resultName,
    execution: receipt.txExecutionResultName,
    persistedListingId: knownListing.listing_id,
  };
});

const passed = results.filter((result) => result.passed).length;
const report = {
  network: "testnet-bradbury",
  chainId: testnetBradbury.id,
  contractAddress,
  mode: "read-only verification of deployed schema, state, and prior write",
  runAt: new Date().toISOString(),
  passed,
  failed: results.length - passed,
  results,
  networkObservations: [
    {
      transactionHash: leaderTimeoutTransaction,
      status: "LEADER_TIMEOUT",
      execution: "NOT_VOTED",
      votes: "0/5",
      stateChanged: false,
      interpretation:
        "Bradbury leader timeout before contract execution; not a contract assertion failure.",
    },
  ],
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Result: ${passed}/5 passed`);
console.log(`Report: ${path.relative(projectRoot, reportPath)}`);

if (passed !== 5) process.exitCode = 1;
