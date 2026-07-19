import { createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type {
  Listing,
  MarketState,
  Order,
  TransactionOutcome,
  WalletAdapter,
} from "../types";

export const BRADBURY_CHAIN_ID = 4221;
export const BRADBURY_RPC = "https://rpc-bradbury.genlayer.com";
export const BRADBURY_EXPLORER = "https://explorer-bradbury.genlayer.com";
export const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() ?? "";

type GenLayerClientConfig = NonNullable<Parameters<typeof createClient>[0]>;
type SubmittedCallback = (hash: `0x${string}`) => void;

const reader = createClient({ chain: testnetBradbury });

export class TransactionFailure extends Error {
  outcome: TransactionOutcome;

  constructor(outcome: TransactionOutcome) {
    const label =
      outcome.status === "LEADER_TIMEOUT"
        ? "The selected Bradbury leader timed out before execution."
        : outcome.status === "VALIDATORS_TIMEOUT"
          ? "Bradbury validators timed out before reaching consensus."
          : `Transaction ended with ${outcome.status} / ${outcome.execution}.`;
    super(label);
    this.name = "TransactionFailure";
    this.outcome = outcome;
  }
}

function requireContract(): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) {
    throw new Error("VITE_CONTRACT_ADDRESS is not configured.");
  }
  return contractAddress as `0x${string}`;
}

function normalizeStatus(statusName: unknown, statusCode: unknown) {
  if (typeof statusName === "string" && statusName) return statusName;
  const names: Record<number, string> = {
    0: "UNINITIALIZED",
    1: "PENDING",
    2: "PROPOSING",
    3: "COMMITTING",
    4: "REVEALING",
    5: "ACCEPTED",
    6: "UNDETERMINED",
    7: "FINALIZED",
    8: "CANCELED",
    9: "APPEAL_REVEALING",
    10: "APPEAL_COMMITTING",
    11: "READY_TO_FINALIZE",
    12: "VALIDATORS_TIMEOUT",
    13: "LEADER_TIMEOUT",
  };
  return names[Number(statusCode)] ?? "UNKNOWN";
}

async function signer(wallet: WalletAdapter) {
  await wallet.switchChain(BRADBURY_CHAIN_ID);
  const provider = await wallet.getEthereumProvider();
  return createClient({
    chain: testnetBradbury,
    account: wallet.address as `0x${string}`,
    provider: provider as GenLayerClientConfig["provider"],
  });
}

async function waitForExecution(
  client: ReturnType<typeof createClient>,
  hash: `0x${string}`,
): Promise<TransactionOutcome> {
  const transactionHash =
    hash as Parameters<typeof client.getTransaction>[0]["hash"];
  await client.waitForTransactionReceipt({
    hash: transactionHash,
    status: TransactionStatus.ACCEPTED,
    interval: 5_000,
    retries: 120,
  });

  // Bradbury's simplified wait receipt can omit statusName. Always re-read the
  // canonical transaction before deciding whether execution succeeded.
  const receipt = await client.getTransaction({ hash: transactionHash });
  const outcome: TransactionOutcome = {
    hash,
    status: normalizeStatus(receipt.statusName, receipt.status),
    statusCode:
      typeof receipt.status === "number" ? receipt.status : Number(receipt.status),
    result: receipt.resultName ?? "UNKNOWN",
    execution: receipt.txExecutionResultName ?? "UNKNOWN",
  };
  const accepted =
    outcome.status === TransactionStatus.ACCEPTED ||
    outcome.status === TransactionStatus.FINALIZED;

  if (
    !accepted ||
    outcome.result !== "AGREE" ||
    outcome.execution !== "FINISHED_WITH_RETURN"
  ) {
    throw new TransactionFailure(outcome);
  }

  return outcome;
}

async function submit(
  wallet: WalletAdapter,
  request: {
    functionName: string;
    args: unknown[];
    value?: bigint;
  },
  onSubmitted?: SubmittedCallback,
) {
  const client = await signer(wallet);
  const hash = (await client.writeContract({
    address: requireContract(),
    functionName: request.functionName,
    args: request.args as Parameters<typeof client.writeContract>[0]["args"],
    value: request.value ?? 0n,
  })) as `0x${string}`;
  onSubmitted?.(hash);
  return waitForExecution(client, hash);
}

export async function readMarketState(): Promise<MarketState> {
  return (await reader.readContract({
    address: requireContract(),
    functionName: "get_market_state",
    args: [],
  })) as unknown as MarketState;
}

export async function readListings(): Promise<Listing[]> {
  const result = (await reader.readContract({
    address: requireContract(),
    functionName: "get_listings",
    args: [0, 20],
  })) as unknown as { items: Listing[] };
  return result.items;
}

export async function readOrder(orderId: string): Promise<Order> {
  return (await reader.readContract({
    address: requireContract(),
    functionName: "get_order",
    args: [orderId],
  })) as unknown as Order;
}

export async function readOrders(listings: Listing[]): Promise<Order[]> {
  const orderIds = Array.from(
    new Set(listings.map((listing) => listing.order_id).filter(Boolean)),
  );
  const settled = await Promise.allSettled(orderIds.map((orderId) => readOrder(orderId)));
  return settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
}

export function createListing(
  wallet: WalletAdapter,
  input: {
    listingId: string;
    title: string;
    description: string;
    imageUrl: string;
    priceWei: bigint;
    fulfillmentNotes: string;
  },
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "create_listing",
      args: [
        input.listingId,
        input.title,
        input.description,
        input.imageUrl,
        input.priceWei,
        input.fulfillmentNotes,
        new Date().toISOString(),
      ],
    },
    onSubmitted,
  );
}

export function purchaseListing(
  wallet: WalletAdapter,
  listing: Listing,
  orderId: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "purchase",
      args: [listing.listing_id, orderId, new Date().toISOString()],
      value: BigInt(listing.price_wei),
    },
    onSubmitted,
  );
}

export function markOrderDelivered(
  wallet: WalletAdapter,
  orderId: string,
  trackingUrl: string,
  deliveryNote: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "mark_delivered",
      args: [orderId, trackingUrl, deliveryNote, new Date().toISOString()],
    },
    onSubmitted,
  );
}

export function confirmOrderReceipt(
  wallet: WalletAdapter,
  orderId: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "confirm_receipt",
      args: [orderId, new Date().toISOString()],
    },
    onSubmitted,
  );
}

export function openOrderDispute(
  wallet: WalletAdapter,
  orderId: string,
  reason: string,
  evidenceUrl: string,
  evidenceNote: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "open_dispute",
      args: [
        orderId,
        reason,
        evidenceUrl,
        evidenceNote,
        new Date().toISOString(),
      ],
    },
    onSubmitted,
  );
}

export function addOrderEvidence(
  wallet: WalletAdapter,
  orderId: string,
  evidenceUrl: string,
  evidenceNote: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "add_evidence",
      args: [orderId, evidenceUrl, evidenceNote],
    },
    onSubmitted,
  );
}

export function adjudicateOrder(
  wallet: WalletAdapter,
  orderId: string,
  onSubmitted?: SubmittedCallback,
) {
  return submit(
    wallet,
    {
      functionName: "adjudicate",
      args: [orderId, new Date().toISOString()],
    },
    onSubmitted,
  );
}
