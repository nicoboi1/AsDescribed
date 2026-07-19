import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  Check,
  ChevronRight,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Fingerprint,
  Gavel,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  ScanSearch,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  Unplug,
  UploadCloud,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { demoListings } from "./data";
import {
  BRADBURY_CHAIN_ID,
  BRADBURY_EXPLORER,
  TransactionFailure,
  addOrderEvidence,
  adjudicateOrder,
  confirmOrderReceipt,
  contractAddress,
  createListing,
  markOrderDelivered,
  openOrderDispute,
  purchaseListing as purchaseListingTx,
  readListings,
  readMarketState,
  readOrders,
} from "./lib/genlayer";
import type {
  Listing,
  MarketState,
  Order,
  TransactionOutcome,
  TransactionStage,
  WalletAdapter,
  WalletMode,
} from "./types";

export interface AppProps {
  wallet: WalletAdapter | null;
  walletReady: boolean;
  walletMode: WalletMode;
  authenticated: boolean;
  onConnect: () => void | Promise<void>;
  onDisconnect: () => void | Promise<void>;
}

type Notice = { tone: "success" | "error"; text: string } | null;
type SubmitAction = (
  onSubmitted: (hash: `0x${string}`) => void,
) => Promise<TransactionOutcome>;

interface TransactionState {
  stage: TransactionStage;
  label: string;
  hash?: `0x${string}`;
  status?: string;
  execution?: string;
}

const emptyMarket: MarketState = {
  listing_count: 0n,
  order_count: 0n,
  resolved_count: 0n,
  disputed_count: 0n,
  escrowed_total_wei: 0n,
  chain_id: 4221n,
};

const visuals = ["camera", "type", "controller", "audio"] as const;
const categories = ["Physical", "Digital", "Collectible"] as const;
type MarketFilter = "All" | Listing["category"];
const marketFilters: MarketFilter[] = ["All", ...categories];

const catalogProfiles: Record<string, Partial<Listing>> = {
  "bradbury-test-mrrwqawn": {
    title: "Aperture M40 Rangefinder Kit",
    description:
      "Serviced 35 mm rangefinder in graphite finish with calibrated meter, fast 40 mm glass, leather strap, and fitted hard case.",
    fulfillment_notes:
      "Dispatches insured within two business days. The serial, meter calibration sheet, lens, strap, and fitted case must match the listing.",
    category: "Physical",
    visual: "camera",
    seller_name: "Northline Camera Co.",
    asset_condition: "Serviced · Grade A",
    asset_delivery: "Insured · 2-day dispatch",
    display_code: "M40",
  },
  "recovery-test-mrrxdddh": {
    title: "Atlas Grotesk Pro — 14 Styles",
    description:
      "Complete commercial font system with desktop and web licenses, variable files, multilingual glyph set, and a production-ready Figma specimen.",
    fulfillment_notes:
      "The encrypted delivery must include all 14 styles, variable OTF/WOFF2 files, license certificate, glyph guide, and Figma specimen.",
    category: "Digital",
    visual: "type",
    seller_name: "Form & Function Studio",
    asset_condition: "Commercial license",
    asset_delivery: "Encrypted instant delivery",
    display_code: "AG14",
  },
  "e2e-listing-mrryrpdo": {
    title: "Arc One Founder’s Controller",
    description:
      "Numbered low-profile arcade controller with hot-swap switches, machined aluminum top plate, braided USB-C cable, and tournament firmware.",
    fulfillment_notes:
      "Edition number, switch layout, cable, firmware checksum, authenticity card, and protective sleeve are material delivery terms.",
    category: "Collectible",
    visual: "controller",
    seller_name: "Arc Works",
    asset_condition: "Edition 03 / 50",
    asset_delivery: "Authenticated · Reserved",
    display_code: "ARC-03",
  },
  "recovery-test-mrrziw4i": {
    title: "Nocturne Field Recorder Kit",
    description:
      "Compact 32-bit float field recorder with stereo capsule, two XLR inputs, wind protection, rechargeable pack, and travel case.",
    fulfillment_notes:
      "Ships tracked in a hard case. Recorder, stereo capsule, wind protection, battery pack, USB-C cable, and XLR pair must be present.",
    category: "Physical",
    visual: "audio",
    seller_name: "Signal House",
    asset_condition: "Studio grade · Tested",
    asset_delivery: "Tracked hard-case shipping",
    display_code: "NFR-01",
  },
};

const sameAddress = (left: string, right: string) =>
  Boolean(left && right && left.toLowerCase() === right.toLowerCase());

const shortAddress = (address: string) =>
  address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;

const shortHash = (hash: string) =>
  hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;

const formatGen = (value: bigint | number | string) => {
  const wei = BigInt(value);
  const whole = wei / 1_000_000_000_000_000_000n;
  const fraction = (wei % 1_000_000_000_000_000_000n)
    .toString()
    .padStart(18, "0")
    .slice(0, 4)
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction} GEN` : `${whole} GEN`;
};

const parseGen = (value: string) => {
  const match = value.trim().match(/^(\d+)(?:\.(\d{0,18}))?$/);
  if (!match) throw new Error("Enter a valid GEN amount with up to 18 decimals.");
  const fraction = (match[2] ?? "").padEnd(18, "0");
  return BigInt(match[1]) * 10n ** 18n + BigInt(fraction || "0");
};

const displayDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
};

function normalizeListing(listing: Listing, index: number): Listing {
  const profile = catalogProfiles[listing.listing_id];
  return {
    ...listing,
    price_wei: BigInt(listing.price_wei),
    category: profile?.category ?? categories[index % categories.length],
    visual: profile?.visual ?? visuals[index % visuals.length],
    ...profile,
  };
}

function normalizeOrder(order: Order): Order {
  return { ...order, amount_wei: BigInt(order.amount_wei) };
}

function ProductVisual({
  type,
  imageUrl,
  code,
}: {
  type: Listing["visual"];
  imageUrl?: string;
  code?: string;
}) {
  return (
    <div className={`product-visual visual-${type}`} aria-hidden="true">
      {imageUrl ? (
        <img
          className="product-image"
          src={imageUrl}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      ) : null}
      <div className="visual-grid" />
      {type === "camera" && (
        <div className="camera-object">
          <div className="camera-lens"><span /></div>
          <div className="camera-top" />
        </div>
      )}
      {type === "type" && (
        <div className="type-object">
          <span>Aa</span>
          <small>ATLAS / 14</small>
        </div>
      )}
      {type === "controller" && (
        <div className="controller-object">
          <span className="button-a" />
          <span className="button-b" />
          <span className="button-c" />
          <span className="button-d" />
          <i />
        </div>
      )}
      {type === "audio" && (
        <div className="audio-object">
          <div className="audio-screen">
            <span>32F</span>
            <i />
          </div>
          <div className="audio-meter">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="audio-dial" />
          <div className="audio-inputs" />
        </div>
      )}
      <span className="visual-index">
        {code ??
          `0${type === "camera" ? "1" : type === "type" ? "2" : type === "controller" ? "3" : "4"}`}
      </span>
    </div>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  tone = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  busy: boolean;
  tone?: "primary" | "quiet" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`action-button action-${tone}`}
      onClick={onClick}
      disabled={busy || disabled}
    >
      {busy ? <LoaderCircle className="spin" /> : null}
      {children}
    </button>
  );
}

function CreateListingForm({
  busy,
  onCreate,
}: {
  busy: boolean;
  onCreate: (input: {
    title: string;
    description: string;
    imageUrl: string;
    priceWei: bigint;
    fulfillmentNotes: string;
  }) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [price, setPrice] = useState("0.01");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    try {
      const priceWei = parseGen(price);
      if (priceWei <= 0n) throw new Error("Price must be greater than zero.");
      if (!title.trim() || !description.trim()) {
        throw new Error("Title and listing promise are required.");
      }
      setFormError("");
      onCreate({
        title: title.trim(),
        description: description.trim(),
        imageUrl: imageUrl.trim(),
        priceWei,
        fulfillmentNotes: notes.trim(),
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Invalid listing.");
    }
  };

  return (
    <form className="dashboard-form create-form" onSubmit={submit}>
      <div className="form-heading">
        <div>
          <span>SELLER DESK</span>
          <h3>Create a listing</h3>
        </div>
        <Store />
      </div>
      <label>
        Title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          placeholder="What are you selling?"
        />
      </label>
      <label>
        Promise / description
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={4000}
          placeholder="Describe exactly what the buyer should receive."
          rows={4}
        />
      </label>
      <div className="form-row">
        <label>
          Price in GEN
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
          />
        </label>
        <label>
          Public image URL
          <input
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            placeholder="https://…"
            type="url"
          />
        </label>
      </div>
      <label>
        Fulfillment notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          maxLength={1200}
          placeholder="Shipping, access, or delivery details."
          rows={2}
        />
      </label>
      {formError ? <p className="form-error">{formError}</p> : null}
      <button className="button-primary form-submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" /> : <Plus />}
        Publish on Bradbury
      </button>
    </form>
  );
}

function OrderPanel({
  order,
  walletAddress,
  busyAction,
  onMarkDelivered,
  onConfirm,
  onDispute,
  onEvidence,
  onAdjudicate,
  onReceipt,
}: {
  order: Order;
  walletAddress: string;
  busyAction: string;
  onMarkDelivered: (tracking: string, note: string) => void;
  onConfirm: () => void;
  onDispute: (reason: string, url: string, note: string) => void;
  onEvidence: (url: string, note: string) => void;
  onAdjudicate: () => void;
  onReceipt: () => void;
}) {
  const [tracking, setTracking] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const seller = sameAddress(order.seller, walletAddress);
  const buyer = sameAddress(order.buyer, walletAddress);
  const party = seller || buyer;
  const busy = busyAction === order.order_id;

  return (
    <article className="order-panel">
      <div className="order-panel-head">
        <div>
          <span className={`status status-${order.status.toLowerCase()}`}>
            {order.status}
          </span>
          <h3>{order.order_id}</h3>
          <small>Listing {order.listing_id}</small>
        </div>
        <div className="order-amount">
          <small>ESCROW</small>
          <strong>{formatGen(order.amount_wei)}</strong>
        </div>
      </div>

      <div className="order-facts">
        <div><span>Buyer</span><strong>{shortAddress(order.buyer)}</strong></div>
        <div><span>Seller</span><strong>{shortAddress(order.seller)}</strong></div>
        <div><span>Settlement</span><strong>{order.settlement.replaceAll("_", " ")}</strong></div>
        <div>
          <span>Evidence</span>
          <strong>{order.buyer_evidence.length + order.seller_evidence.length} sources</strong>
        </div>
      </div>

      {seller && order.status === "ESCROWED" ? (
        <div className="order-action-box">
          <strong>Record delivery</strong>
          <input
            value={tracking}
            onChange={(event) => setTracking(event.target.value)}
            placeholder="Public tracking URL (optional)"
            type="url"
          />
          <textarea
            value={deliveryNote}
            onChange={(event) => setDeliveryNote(event.target.value)}
            placeholder="What was delivered?"
            rows={2}
          />
          <ActionButton
            busy={busy}
            onClick={() => onMarkDelivered(tracking.trim(), deliveryNote.trim())}
          >
            <PackageCheck /> Mark delivered
          </ActionButton>
        </div>
      ) : null}

      {buyer && order.status === "DELIVERED" ? (
        <div className="order-action-grid">
          <div className="order-action-box">
            <strong>Everything arrived?</strong>
            <p>Confirm the delivery and make the seller disposition claimable.</p>
            <ActionButton busy={busy} onClick={onConfirm}>
              <Check /> Confirm receipt
            </ActionButton>
          </div>
          <div className="order-action-box dispute-box">
            <strong>Open a dispute</strong>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="What materially differs from the listing?"
              rows={2}
            />
            <input
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="Public evidence URL"
              type="url"
            />
            <input
              value={evidenceNote}
              onChange={(event) => setEvidenceNote(event.target.value)}
              placeholder="Explain what the source proves"
            />
            <ActionButton
              busy={busy}
              tone="danger"
              disabled={!reason.trim() || !evidenceUrl.trim() || !evidenceNote.trim()}
              onClick={() =>
                onDispute(reason.trim(), evidenceUrl.trim(), evidenceNote.trim())
              }
            >
              <ShieldAlert /> Submit dispute
            </ActionButton>
          </div>
        </div>
      ) : null}

      {party && order.status === "DISPUTED" ? (
        <div className="order-action-grid">
          <div className="order-action-box">
            <strong>Add public evidence</strong>
            <input
              value={evidenceUrl}
              onChange={(event) => setEvidenceUrl(event.target.value)}
              placeholder="https://…"
              type="url"
            />
            <input
              value={evidenceNote}
              onChange={(event) => setEvidenceNote(event.target.value)}
              placeholder="What does this source establish?"
            />
            <ActionButton
              busy={busy}
              tone="quiet"
              disabled={!evidenceUrl.trim() || !evidenceNote.trim()}
              onClick={() => onEvidence(evidenceUrl.trim(), evidenceNote.trim())}
            >
              <UploadCloud /> Add evidence
            </ActionButton>
          </div>
          <div className="order-action-box court-action">
            <strong>Ask the delivery court</strong>
            <p>
              Validators independently re-fetch every public source and agree on
              buyer or seller.
            </p>
            <ActionButton busy={busy} onClick={onAdjudicate}>
              <Gavel /> Run adjudication
            </ActionButton>
          </div>
        </div>
      ) : null}

      {order.status === "RESOLVED" ? (
        <div className="resolved-callout">
          <div>
            <span>VERDICT</span>
            <strong>{order.winner || "Confirmed delivery"} wins</strong>
          </div>
          <button onClick={onReceipt}>
            View public receipt <ArrowRight />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function ReceiptCard({ order }: { order: Order | null }) {
  if (!order) {
    return (
      <div className="empty-receipt">
        <FileCheck2 />
        <h3>No live settlement receipt yet.</h3>
        <p>
          Completed confirmations and validator verdicts will appear here with
          their evidence trail.
        </p>
      </div>
    );
  }

  const evidenceCount =
    order.buyer_evidence.length + order.seller_evidence.length;
  return (
    <div className="receipt-card">
      <aside className="receipt-sidebar">
        <div className="receipt-seal"><Sparkles /><span>AD</span></div>
        <small>ORDER</small>
        <strong>{order.order_id}</strong>
        <div className="receipt-status"><Check /> {order.status}</div>
        <dl>
          <div><dt>Chain</dt><dd>Bradbury 4221</dd></div>
          <div><dt>Amount</dt><dd>{formatGen(order.amount_wei)}</dd></div>
          <div><dt>Winner</dt><dd>{order.winner || "Seller"}</dd></div>
          <div><dt>Evidence</dt><dd>{evidenceCount} sources</dd></div>
        </dl>
      </aside>
      <div className="receipt-body">
        <div className="receipt-title">
          <div>
            <span>SETTLEMENT DISPOSITION</span>
            <h3>{order.settlement.replaceAll("_", " ")}</h3>
          </div>
          <ShieldCheck size={36} />
        </div>
        <blockquote>
          “{order.verdict_summary || "Delivery confirmation recorded on-chain."}”
        </blockquote>
        <div className="reason-block">
          <small>CONSENSUS REASON</small>
          <p>{order.verdict_reasons || "No adjudication was required."}</p>
        </div>
        <div className="receipt-timeline">
          {[
            ["Purchased", order.created_at],
            ["Delivered", order.delivered_at],
            ["Disputed", order.disputed_at],
            ["Resolved", order.resolved_at],
          ].map(([label, time]) => (
            <div key={label} className={time ? "current" : ""}>
              <i>{time ? <Check size={11} /> : null}</i>
              <span>{label}<small>{displayDate(time)}</small></span>
            </div>
          ))}
        </div>
        <a href={BRADBURY_EXPLORER} target="_blank" rel="noreferrer">
          Open Bradbury explorer <ExternalLink size={14} />
        </a>
      </div>
    </div>
  );
}

export default function App({
  wallet,
  walletReady,
  walletMode,
  authenticated,
  onConnect,
  onDisconnect,
}: AppProps) {
  const liveConfigured = Boolean(contractAddress);
  const [listings, setListings] = useState<Listing[]>(
    liveConfigured ? [] : demoListings,
  );
  const [orders, setOrders] = useState<Order[]>([]);
  const [market, setMarket] = useState<MarketState>(emptyMarket);
  const [selected, setSelected] = useState<Listing | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Order | null>(null);
  const [busyAction, setBusyAction] = useState("");
  const [loading, setLoading] = useState(liveConfigured);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeNav, setActiveNav] = useState("explore");
  const [marketFilter, setMarketFilter] = useState<MarketFilter>("All");
  const [marketQuery, setMarketQuery] = useState("");
  const [transaction, setTransaction] = useState<TransactionState>({
    stage: "IDLE",
    label: "",
  });

  const refresh = useCallback(async () => {
    if (!liveConfigured) return;
    setLoading(true);
    try {
      const [rawListings, marketState] = await Promise.all([
        readListings(),
        readMarketState(),
      ]);
      const normalizedListings = rawListings.map(normalizeListing);
      const rawOrders = await readOrders(normalizedListings);
      setListings(normalizedListings);
      setOrders(rawOrders.map(normalizeOrder));
      setMarket({
        ...marketState,
        listing_count: BigInt(marketState.listing_count),
        order_count: BigInt(marketState.order_count),
        resolved_count: BigInt(marketState.resolved_count),
        disputed_count: BigInt(marketState.disputed_count),
        escrowed_total_wei: BigInt(marketState.escrowed_total_wei),
        chain_id: BigInt(marketState.chain_id),
      });
    } catch (error) {
      setNotice({
        tone: "error",
        text:
          error instanceof Error
            ? error.message
            : "Could not refresh Bradbury state.",
      });
    } finally {
      setLoading(false);
    }
  }, [liveConfigured]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const scrollTo = (id: string) => {
    setActiveNav(id);
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const ensureWallet = async () => {
    if (wallet) return true;
    await onConnect();
    return false;
  };

  const runAction = async (
    key: string,
    label: string,
    action: SubmitAction,
  ) => {
    if (!(await ensureWallet())) return;
    setBusyAction(key);
    setTransaction({ stage: "AWAITING_SIGNATURE", label });
    try {
      const outcome = await action((hash) => {
        setTransaction({
          stage: "CONSENSUS",
          label,
          hash,
          status: "Waiting for validators",
        });
      });
      setTransaction({
        stage: "ACCEPTED",
        label,
        hash: outcome.hash,
        status: outcome.status,
        execution: outcome.execution,
      });
      setNotice({
        tone: "success",
        text: `${label} accepted with validator agreement.`,
      });
      setSelected(null);
      await refresh();
    } catch (error) {
      if (error instanceof TransactionFailure) {
        setTransaction({
          stage: "FAILED",
          label,
          hash: error.outcome.hash,
          status: error.outcome.status,
          execution: error.outcome.execution,
        });
      } else {
        setTransaction({
          stage: "FAILED",
          label,
          status: "CLIENT_ERROR",
          execution: "NOT_SUBMITTED",
        });
      }
      setNotice({
        tone: "error",
        text: error instanceof Error ? error.message : `${label} failed.`,
      });
    } finally {
      setBusyAction("");
    }
  };

  const handlePurchase = () => {
    if (!selected) return;
    if (!liveConfigured) {
      setNotice({ tone: "success", text: "Demo purchase completed locally." });
      setSelected(null);
      return;
    }
    if (wallet && sameAddress(wallet.address, selected.seller)) {
      setNotice({ tone: "error", text: "A seller cannot buy their own listing." });
      return;
    }
    const orderId = `order-${Date.now().toString(36)}`;
    void runAction(selected.listing_id, "Escrow purchase", (onSubmitted) =>
      purchaseListingTx(wallet!, selected, orderId, onSubmitted),
    );
  };

  const connectedAddress = wallet?.address ?? "";
  const sellingListings = listings.filter((listing) =>
    sameAddress(listing.seller, connectedAddress),
  );
  const buyingOrders = orders.filter((order) =>
    sameAddress(order.buyer, connectedAddress),
  );
  const sellingOrders = orders.filter((order) =>
    sameAddress(order.seller, connectedAddress),
  );
  const availableCount = listings.filter(
    (listing) => listing.status === "AVAILABLE",
  ).length;
  const receiptOrder =
    selectedReceipt ??
    orders.find((order) => order.status === "RESOLVED") ??
    null;
  const dashboardOrders = Array.from(
    new Map(
      [...sellingOrders, ...buyingOrders].map((order) => [order.order_id, order]),
    ).values(),
  );
  const visibleListings = useMemo(() => {
    const query = marketQuery.trim().toLowerCase();
    return listings.filter((listing) => {
      const matchesCategory =
        marketFilter === "All" || listing.category === marketFilter;
      const matchesQuery =
        !query ||
        listing.title.toLowerCase().includes(query) ||
        listing.description.toLowerCase().includes(query) ||
        listing.seller_name?.toLowerCase().includes(query) ||
        listing.asset_condition?.toLowerCase().includes(query) ||
        listing.seller.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  }, [listings, marketFilter, marketQuery]);

  const walletLabel = authenticated && wallet
    ? shortAddress(wallet.address)
    : walletMode === "unavailable"
      ? "Install wallet"
      : "Connect wallet";

  return (
    <div className="app-shell">
      <div className="topline">
        <span>LIVE COURT RAIL</span>
        <span>BRADBURY / {BRADBURY_CHAIN_ID}</span>
        <span>{liveConfigured ? "CONTRACT CONNECTED" : "DEMO LEDGER"}</span>
      </div>

      <header className="site-header">
        <button
          className="brand"
          onClick={() => scrollTo("top")}
          aria-label="AsDescribed home"
        >
          <span className="brand-mark">AD</span>
          <span className="brand-copy">
            <strong>AsDescribed</strong>
            <small>Commerce court</small>
          </span>
        </button>
        <nav aria-label="Main navigation">
          {[
            ["explore", "Explore"],
            ["dashboard", "Dashboard"],
            ["receipt", "Receipts"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={activeNav === id ? "active" : ""}
              onClick={() => scrollTo(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className={`wallet-button ${authenticated ? "connected" : ""}`}
          onClick={() => void (authenticated ? onDisconnect() : onConnect())}
          disabled={!walletReady}
        >
          {authenticated && wallet ? <Fingerprint size={16} /> : <Wallet size={16} />}
          {walletLabel}
        </button>
      </header>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button
          className={activeNav === "explore" ? "active" : ""}
          onClick={() => scrollTo("explore")}
        >
          <Store /> Explore
        </button>
        <button
          className={activeNav === "dashboard" ? "active" : ""}
          onClick={() => scrollTo("dashboard")}
        >
          <LayoutDashboard /> Dashboard
        </button>
        <button
          className={activeNav === "receipt" ? "active" : ""}
          onClick={() => scrollTo("receipt")}
        >
          <FileCheck2 /> Receipts
        </button>
      </nav>

      <main id="top">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow">
              <ShieldCheck size={15} />
              The GenLayer commerce court
            </div>
            <h1>
              Trade the promise.
              <em>Settle the proof.</em>
            </h1>
            <p>
              A marketplace where delivery claims become enforceable terms.
              Buyers escrow GEN, sellers prove fulfillment, and independent
              validators resolve the gap.
            </p>
            <div className="hero-actions">
              <button
                className="button-primary"
                onClick={() => scrollTo("explore")}
              >
                Browse live market <ArrowRight size={17} />
              </button>
              <button
                className="button-quiet"
                onClick={() => scrollTo("dashboard")}
              >
                Open your dashboard
              </button>
            </div>
            <div className="trust-row">
              <span><LockKeyhole size={14} /> Payable escrow</span>
              <span><ScanSearch size={14} /> Source verification</span>
              <span><BadgeCheck size={14} /> Validator verdict</span>
            </div>
          </div>

          <div className="hero-court" aria-label="Example dispute resolution">
            <div className="court-header">
              <span>CASE 04-221 / LIVE RAIL</span>
              <span className="live-dot">BRADBURY</span>
            </div>
            <div className="court-product">
              <div className="mini-product"><PackageCheck /></div>
              <div>
                <small>MATERIAL MATCH REVIEW</small>
                <strong>Promise compared to public proof</strong>
                <span>Escrow stays locked during consensus</span>
              </div>
            </div>
            <div className="claim-compare">
              <div>
                <small>LISTING CLAIM</small>
                <p>“Every material promise becomes the decision rubric.”</p>
              </div>
              <div>
                <small>DELIVERY EVIDENCE</small>
                <p>Five validators re-fetch and inspect the same sources.</p>
              </div>
            </div>
            <div className="validator-line">
              <span>VALIDATOR CONSENSUS</span>
              <div className="validator-dots"><i /><i /><i /><i /><i /></div>
              <strong>5 / 5</strong>
            </div>
            <div className="verdict-stamp">
              <Gavel size={22} />
              <div>
                <small>VERDICT</small>
                <strong>Seller claimable · agreement reached</strong>
              </div>
              <Check size={20} />
            </div>
          </div>
        </section>

        <section className="metric-strip" aria-label="Marketplace metrics">
          <div><strong>{availableCount.toString().padStart(2, "0")}</strong><span>Open listings</span></div>
          <div><strong>{market.order_count.toString().padStart(2, "0")}</strong><span>Orders</span></div>
          <div><strong>{market.disputed_count.toString().padStart(2, "0")}</strong><span>Disputes</span></div>
          <div><strong>{market.resolved_count.toString().padStart(2, "0")}</strong><span>Resolved</span></div>
        </section>

        <section className="market-section" id="explore">
          <div className="section-heading">
            <div>
              <span className="section-kicker">
                LIVE MARKET / {listings.length.toString().padStart(2, "0")}
              </span>
              <h2>Listings with promises you can enforce.</h2>
            </div>
            <div className="heading-actions">
              <p>
                Every listing becomes the rubric. Payment stays locked until
                delivery is confirmed or adjudicated.
              </p>
              <button onClick={() => void refresh()} disabled={loading}>
                <RefreshCw className={loading ? "spin" : ""} /> Refresh
              </button>
            </div>
          </div>

          <div className="market-toolbar">
            <label className="market-search">
              <Search />
              <input
                value={marketQuery}
                onChange={(event) => setMarketQuery(event.target.value)}
                placeholder="Search listings or seller"
                aria-label="Search marketplace"
              />
              <span>{visibleListings.length} results</span>
            </label>
            <div className="market-filter-wrap">
              <SlidersHorizontal aria-hidden="true" />
              <div className="market-filters" aria-label="Filter listings by category">
                {marketFilters.map((filter) => (
                  <button
                    type="button"
                    key={filter}
                    className={marketFilter === filter ? "active" : ""}
                    onClick={() => setMarketFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {loading && !listings.length ? (
            <div className="empty-market"><LoaderCircle className="spin" /> Reading Bradbury state…</div>
          ) : null}
          {!loading && !listings.length ? (
            <div className="empty-market">
              <Store />
              <h3>No listings yet.</h3>
              <p>Connect a wallet and publish the first accountable promise.</p>
            </div>
          ) : null}
          {!loading && listings.length > 0 && visibleListings.length === 0 ? (
            <div className="empty-market filtered-empty">
              <Search />
              <h3>No matching listings.</h3>
              <p>Try another keyword or return to the full market.</p>
              <button
                type="button"
                onClick={() => {
                  setMarketFilter("All");
                  setMarketQuery("");
                }}
              >
                Clear filters
              </button>
            </div>
          ) : null}
          <div className="listing-grid" id="market-grid">
            {visibleListings.map((listing) => (
              <article
                className={`listing-card listing-card-${listing.status.toLowerCase()}`}
                key={listing.listing_id}
              >
                <button
                  type="button"
                  className="listing-visual-button"
                  onClick={() => setSelected(listing)}
                  disabled={listing.status !== "AVAILABLE"}
                  aria-label={`View ${listing.title}`}
                >
                  <ProductVisual
                    type={listing.visual}
                    imageUrl={listing.image_url}
                    code={listing.display_code}
                  />
                  <span className="visual-cta">
                    Inspect asset <ArrowRight />
                  </span>
                </button>
                <div className="listing-meta">
                  <div className="tag-row">
                    <span>{listing.category}</span>
                    <span className={`status status-${listing.status.toLowerCase()}`}>
                      {listing.status === "AVAILABLE"
                        ? "Available"
                        : listing.status === "ESCROWED"
                          ? "Reserved"
                          : "Sold"}
                    </span>
                  </div>
                  <h3>{listing.title}</h3>
                  <p>{listing.description}</p>
                  {listing.asset_condition || listing.asset_delivery ? (
                    <div className="listing-specs">
                      {listing.asset_condition ? (
                        <span>{listing.asset_condition}</span>
                      ) : null}
                      {listing.asset_delivery ? (
                        <span>{listing.asset_delivery}</span>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="seller-line">
                    <div>
                      <strong>{listing.seller_name ?? "Independent seller"}</strong>
                      <span>{shortAddress(listing.seller)}</span>
                    </div>
                    <BadgeCheck size={14} />
                  </div>
                  <div className="listing-footer">
                    <div>
                      <small>BRADBURY ESCROW</small>
                      <strong>{formatGen(listing.price_wei)}</strong>
                    </div>
                    <button
                      className="listing-open"
                      onClick={() => setSelected(listing)}
                      disabled={listing.status !== "AVAILABLE"}
                      aria-label={`View ${listing.title}`}
                    >
                      <span>
                        {listing.status === "AVAILABLE" ? "Review & escrow" : "Escrow active"}
                      </span>
                      {listing.status === "AVAILABLE" ? <ChevronRight /> : <LockKeyhole />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-section" id="dashboard">
          <div className="dashboard-heading">
            <div>
              <span className="section-kicker light">ACCOUNT WORKSPACE</span>
              <h2>One desk for both sides of delivery.</h2>
            </div>
            <div className="dashboard-identity">
              <LayoutDashboard />
              <div>
                <small>ACTIVE ACCOUNT</small>
                <strong>{wallet ? shortAddress(wallet.address) : "Not connected"}</strong>
                <span>
                  {walletMode === "rainbowkit"
                    ? "RainbowKit + Wagmi"
                    : walletMode === "privy"
                      ? "Privy"
                      : "Browser wallet"}{" "}
                  · Bradbury 4221
                </span>
              </div>
            </div>
          </div>

          {!wallet ? (
            <div className="connect-callout">
              <Wallet />
              <div>
                <h3>Connect to create, buy, deliver, or dispute.</h3>
                <p>
                  Public marketplace reads stay available without a wallet. A
                  signature is requested only when you choose an action.
                </p>
              </div>
              <button className="button-primary" onClick={() => void onConnect()}>
                {walletMode === "unavailable" ? "Install wallet" : "Connect wallet"}
              </button>
            </div>
          ) : (
            <div className="dashboard-grid">
              <CreateListingForm
                busy={busyAction === "create-listing"}
                onCreate={(input) => {
                  const listingId = `listing-${Date.now().toString(36)}`;
                  void runAction(
                    "create-listing",
                    "Listing publication",
                    (onSubmitted) =>
                      createListing(
                        wallet,
                        { ...input, listingId },
                        onSubmitted,
                      ),
                  );
                }}
              />
              <div className="portfolio-card">
                <div className="form-heading">
                  <div><span>PORTFOLIO</span><h3>Your Bradbury activity</h3></div>
                  <CircleDollarSign />
                </div>
                <div className="portfolio-metrics">
                  <div><strong>{sellingListings.length}</strong><span>Listings</span></div>
                  <div><strong>{sellingOrders.length}</strong><span>Sales</span></div>
                  <div><strong>{buyingOrders.length}</strong><span>Purchases</span></div>
                  <div>
                    <strong>{dashboardOrders.filter((order) => order.status === "DISPUTED").length}</strong>
                    <span>Open cases</span>
                  </div>
                </div>
                <div className="settlement-warning">
                  <ShieldAlert />
                  <p>
                    Bradbury currently records claimable settlement dispositions.
                    The verified runtime does not expose outbound GEN transfers.
                  </p>
                </div>
              </div>
            </div>
          )}

          {wallet ? (
            <div className="order-workspace">
              <div className="workspace-title">
                <div>
                  <span>LIVE ORDERS</span>
                  <h3>Fulfillment and court actions</h3>
                </div>
                <span>{dashboardOrders.length} linked orders</span>
              </div>
              {!dashboardOrders.length ? (
                <div className="empty-orders">
                  <Box />
                  <p>No orders are linked to this wallet yet.</p>
                </div>
              ) : null}
              <div className="order-list">
                {dashboardOrders.map((order) => (
                  <OrderPanel
                    key={order.order_id}
                    order={order}
                    walletAddress={wallet.address}
                    busyAction={busyAction}
                    onMarkDelivered={(tracking, note) =>
                      void runAction(order.order_id, "Delivery record", (onSubmitted) =>
                        markOrderDelivered(
                          wallet,
                          order.order_id,
                          tracking,
                          note,
                          onSubmitted,
                        ),
                      )
                    }
                    onConfirm={() =>
                      void runAction(order.order_id, "Receipt confirmation", (onSubmitted) =>
                        confirmOrderReceipt(wallet, order.order_id, onSubmitted),
                      )
                    }
                    onDispute={(reason, url, note) =>
                      void runAction(order.order_id, "Dispute opening", (onSubmitted) =>
                        openOrderDispute(
                          wallet,
                          order.order_id,
                          reason,
                          url,
                          note,
                          onSubmitted,
                        ),
                      )
                    }
                    onEvidence={(url, note) =>
                      void runAction(order.order_id, "Evidence submission", (onSubmitted) =>
                        addOrderEvidence(
                          wallet,
                          order.order_id,
                          url,
                          note,
                          onSubmitted,
                        ),
                      )
                    }
                    onAdjudicate={() =>
                      void runAction(order.order_id, "Validator adjudication", (onSubmitted) =>
                        adjudicateOrder(wallet, order.order_id, onSubmitted),
                      )
                    }
                    onReceipt={() => {
                      setSelectedReceipt(order);
                      scrollTo("receipt");
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="process-section" id="process">
          <div className="process-intro">
            <span className="section-kicker light">THE SETTLEMENT RAIL</span>
            <h2>Routine when it works.<br />Credible when it doesn’t.</h2>
            <p>
              GenLayer only enters when judgment is required. Routine orders stay
              routine.
            </p>
            <a href="https://docs.genlayer.com" target="_blank" rel="noreferrer">
              Read the protocol docs <ExternalLink size={14} />
            </a>
          </div>
          <div className="process-steps">
            {[
              { n: "01", icon: <CircleDollarSign />, title: "Lock the price", text: "The buyer sends the exact listing price into payable escrow." },
              { n: "02", icon: <Box />, title: "Record delivery", text: "The seller adds fulfillment notes and a public tracking reference." },
              { n: "03", icon: <FileCheck2 />, title: "Confirm or dispute", text: "The buyer confirms happily or submits a reason and evidence URL." },
              { n: "04", icon: <Gavel />, title: "Reach one verdict", text: "Validators independently re-fetch evidence and agree buyer or seller." },
            ].map((step) => (
              <div className="process-step" key={step.n}>
                <span>{step.n}</span>
                <div className="step-icon">{step.icon}</div>
                <div><h3>{step.title}</h3><p>{step.text}</p></div>
              </div>
            ))}
          </div>
        </section>

        <section className="receipt-section" id="receipt">
          <div className="section-heading">
            <div>
              <span className="section-kicker">PUBLIC RECEIPT</span>
              <h2>A verdict with a paper trail.</h2>
            </div>
            <p>
              The prose explains the outcome. Only the validator-agreed binary
              winner controls the settlement disposition.
            </p>
          </div>
          <ReceiptCard order={receiptOrder} />
        </section>

        <section className="final-cta">
          <div>
            <span><Zap size={14} /> BRADBURY TESTNET MVP</span>
            <h2>Turn “as described”<br />into executable trust.</h2>
          </div>
          <button onClick={() => scrollTo("dashboard")}>
            Open workspace <ArrowRight />
          </button>
        </section>
      </main>

      <footer>
        <div className="brand"><span className="brand-mark">AD</span><span>AsDescribed</span></div>
        <p>Independent delivery judgment on GenLayer.</p>
        <span>BRADBURY / 4221</span>
      </footer>

      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={() => setSelected(null)}
        >
          <section
            className="purchase-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="purchase-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className="modal-close"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <X />
            </button>
            <ProductVisual
              type={selected.visual}
              imageUrl={selected.image_url}
              code={selected.display_code}
            />
            <div className="modal-copy">
              <span className="section-kicker">
                {selected.category} / ESCROW CHECKOUT
              </span>
              <h2 id="purchase-title">{selected.title}</h2>
              <p>{selected.description}</p>
              <div className="promise-box">
                <PackageCheck />
                <div>
                  <small>FULFILLMENT PROMISE</small>
                  <span>{selected.fulfillment_notes || "No additional notes."}</span>
                </div>
              </div>
              <div className="checkout-total">
                <span>Total locked</span>
                <strong>{formatGen(selected.price_wei)}</strong>
              </div>
              <button
                className="button-primary full"
                onClick={handlePurchase}
                disabled={busyAction === selected.listing_id}
              >
                {busyAction === selected.listing_id
                  ? <LoaderCircle className="spin" />
                  : <LockKeyhole />}
                {wallet ? "Lock GEN in escrow" : "Connect to purchase"}
              </button>
              <small className="modal-note">
                Your wallet will switch to Bradbury chain 4221. The seller cannot
                purchase their own listing.
              </small>
            </div>
          </section>
        </div>
      ) : null}

      {transaction.stage !== "IDLE" ? (
        <div className={`transaction-rail tx-${transaction.stage.toLowerCase()}`}>
          <div className="tx-icon">
            {transaction.stage === "ACCEPTED"
              ? <Check />
              : transaction.stage === "FAILED"
                ? <Unplug />
                : <LoaderCircle className="spin" />}
          </div>
          <div>
            <small>{transaction.stage.replaceAll("_", " ")}</small>
            <strong>{transaction.label}</strong>
            <span>
              {transaction.status ?? "Approve the request in your wallet."}
              {transaction.execution ? ` · ${transaction.execution}` : ""}
            </span>
          </div>
          {transaction.hash ? (
            <a href={BRADBURY_EXPLORER} target="_blank" rel="noreferrer">
              {shortHash(transaction.hash)} <ExternalLink />
            </a>
          ) : null}
          <button onClick={() => setTransaction({ stage: "IDLE", label: "" })}>
            <X />
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className={`notice notice-${notice.tone}`} role="status">
          {notice.tone === "success" ? <Check /> : <Unplug />}
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Dismiss"><X /></button>
        </div>
      ) : null}
    </div>
  );
}
