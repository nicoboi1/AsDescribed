import type { Listing, Order } from "./types";

const GEN = 1_000_000_000_000_000_000n;

export const demoListings: Listing[] = [
  {
    listing_id: "rangefinder-40",
    seller: "0x8c2D…4f19",
    title: "Analog Rangefinder + 40 mm",
    description:
      "A compact 35 mm rangefinder with a working light meter, clean 40 mm lens, new seals, and a fresh battery.",
    image_url: "",
    price_wei: 2n * GEN + GEN / 2n,
    fulfillment_notes: "Ships tracked in a padded hard case within two business days.",
    status: "AVAILABLE",
    order_id: "",
    created_at: "2026-07-18T09:30:00Z",
    category: "Physical",
    visual: "camera",
  },
  {
    listing_id: "atlas-typeface",
    seller: "0x91aB…08e2",
    title: "Atlas Grotesk — Full Family",
    description:
      "Commercial desktop and web license, 14 weights, variable font files, glyph PDF, and Figma specimen.",
    image_url: "",
    price_wei: GEN * 85n / 100n,
    fulfillment_notes: "Encrypted download link delivered after purchase.",
    status: "AVAILABLE",
    order_id: "",
    created_at: "2026-07-17T14:10:00Z",
    category: "Digital",
    visual: "type",
  },
  {
    listing_id: "arcade-controller",
    seller: "0x2e71…A93c",
    title: "Hand-built Arcade Controller",
    description:
      "Low-profile leverless controller with hot-swap switches, braided USB-C cable, and PC/PS5 compatibility.",
    image_url: "",
    price_wei: 1n * GEN + GEN * 8n / 10n,
    fulfillment_notes: "Built to order. Dispatches in 5–7 days with tracking.",
    status: "ESCROWED",
    order_id: "order-8f31",
    created_at: "2026-07-16T18:45:00Z",
    category: "Collectible",
    visual: "controller",
  },
];

export const demoReceipt: Order = {
  order_id: "order-7A91",
  listing_id: "field-recorder",
  buyer: "0x42e1…91Ac",
  seller: "0x77D2…e8B0",
  amount_wei: GEN * 12n / 10n,
  status: "RESOLVED",
  settlement: "BUYER_REFUND_CLAIMABLE",
  tracking_url: "https://evidence.example/tracking/7A91",
  delivery_note: "Carrier marked the parcel delivered.",
  dispute_reason: "The listing promised the XLR capsule, but it was absent.",
  winner: "buyer",
  verdict_summary: "Delivery omitted a material promised component.",
  verdict_reasons:
    "The listing explicitly included an XLR capsule. The buyer's unboxing inventory and seller packing record both show that component was not shipped.",
  created_at: "2026-07-12T11:20:00Z",
  delivered_at: "2026-07-15T15:40:00Z",
  disputed_at: "2026-07-15T18:05:00Z",
  resolved_at: "2026-07-15T18:14:00Z",
  buyer_evidence: [
    { url: "https://evidence.example/unbox/7A91", note: "Continuous unboxing record" },
  ],
  seller_evidence: [
    { url: "https://evidence.example/packing/7A91", note: "Packing inventory" },
  ],
};

