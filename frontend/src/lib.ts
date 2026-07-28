import type { Phase, Verdict } from "./types";
import { PHASES } from "./types";

export function weiToGen(wei: number | string | bigint): string {
  try {
    const v = BigInt(typeof wei === "number" ? Math.round(wei) : wei);
    const whole = v / 10n ** 18n;
    const frac = (v % 10n ** 18n).toString().padStart(18, "0").slice(0, 4);
    const f = frac.replace(/0+$/, "");
    return f ? `${whole}.${f}` : `${whole}`;
  } catch {
    return "0";
  }
}

export function genToWei(gen: string): bigint {
  const s = gen.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error("Enter a GEN amount, e.g. 2 or 1.5");
  const [w, f = ""] = s.split(".");
  const frac = (f + "0".repeat(18)).slice(0, 18);
  return BigInt(w) * 10n ** 18n + BigInt(frac || "0");
}

export function shortAddr(a?: string): string {
  if (!a) return "—";
  if (a === "0x" || a.replace(/^0x/, "").replace(/0/g, "") === "") return "—";
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function phaseIndex(p: Phase): number {
  const i = PHASES.indexOf(p as (typeof PHASES)[number]);
  return i < 0 ? 0 : i;
}

// Color per phase — drives the Framer Motion transitions on DealCard.
export const PHASE_COLOR: Record<string, string> = {
  AWAITING_FUND: "#8a7f6a",
  FUNDED: "#b8860b",
  IN_PROGRESS: "#9a7b12",
  MILESTONE_REVIEW: "#6b8f4e",
  DISPUTED: "#b81a1a",
  ARBITRATING: "#8b0000",
  SETTLING: "#7a5cb8",
  CLOSED: "#3a6b3a",
  VOID: "#4a4a4a",
  UNKNOWN: "#8a7f6a",
};

export const PHASE_LABEL: Record<string, string> = {
  AWAITING_FUND: "Awaiting fund",
  FUNDED: "Funded",
  IN_PROGRESS: "In progress",
  MILESTONE_REVIEW: "Milestone review",
  DISPUTED: "Disputed",
  ARBITRATING: "Arbitrating",
  SETTLING: "Settling",
  CLOSED: "Closed",
  VOID: "Void",
  UNKNOWN: "Unknown",
};

export function verdictLabel(v: Verdict): string {
  if (v === "BUYER_WINS") return "Buyer wins";
  if (v === "SELLER_WINS") return "Seller wins";
  if (v === "SPLIT") return "Split";
  return "Pending";
}

export function verdictColor(v: Verdict): string {
  if (v === "SELLER_WINS") return "#3a6b3a";
  if (v === "BUYER_WINS") return "#8b0000";
  if (v === "SPLIT") return "#b8860b";
  return "#8a7f6a";
}
