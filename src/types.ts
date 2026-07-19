export type ListingStatus = "AVAILABLE" | "ESCROWED" | "CLOSED";
export type OrderStatus = "ESCROWED" | "DELIVERED" | "DISPUTED" | "RESOLVED";

export interface Listing {
  listing_id: string;
  seller: string;
  title: string;
  description: string;
  image_url: string;
  price_wei: bigint;
  fulfillment_notes: string;
  status: ListingStatus;
  order_id: string;
  created_at: string;
  category: "Physical" | "Digital" | "Collectible";
  visual: "camera" | "type" | "controller" | "audio";
  seller_name?: string;
  asset_condition?: string;
  asset_delivery?: string;
  display_code?: string;
}

export interface Evidence {
  url: string;
  note: string;
}

export interface Order {
  order_id: string;
  listing_id: string;
  buyer: string;
  seller: string;
  amount_wei: bigint;
  status: OrderStatus;
  settlement: "LOCKED" | "SELLER_CLAIMABLE" | "BUYER_REFUND_CLAIMABLE";
  tracking_url: string;
  delivery_note: string;
  dispute_reason: string;
  winner: "" | "buyer" | "seller";
  verdict_summary: string;
  verdict_reasons: string;
  created_at: string;
  delivered_at: string;
  disputed_at: string;
  resolved_at: string;
  buyer_evidence: Evidence[];
  seller_evidence: Evidence[];
}

export interface MarketState {
  listing_count: bigint;
  order_count: bigint;
  resolved_count: bigint;
  disputed_count: bigint;
  escrowed_total_wei: bigint;
  chain_id: bigint;
}

export type TransactionStage =
  | "IDLE"
  | "AWAITING_SIGNATURE"
  | "SUBMITTED"
  | "CONSENSUS"
  | "ACCEPTED"
  | "FAILED";

export interface TransactionOutcome {
  hash: `0x${string}`;
  status: string;
  statusCode?: number;
  result: string;
  execution: string;
}

export interface WalletAdapter {
  address: string;
  switchChain: (chainId: number) => Promise<unknown>;
  getEthereumProvider: () => Promise<unknown>;
}

export type WalletMode =
  | "rainbowkit"
  | "privy"
  | "injected"
  | "unavailable";
