import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAccount } from "wagmi";
import { DealCard, PhasePill } from "../components/DealCard";
import { PhaseClock } from "../components/PhaseClock";
import { MilestoneScales } from "../components/MilestoneScales";
import { RoleRegistryTable } from "../components/RoleRegistryTable";
import { DisputeDrawer } from "../components/DisputeDrawer";
import { Actions } from "../components/Actions";
import * as svc from "../contractService";
import { genToWei, shortAddr, weiToGen } from "../lib";
import { NETWORK, CHAIN_ID } from "../chain";
import type {
  DealView,
  DisputeView,
  MilestoneView,
  ParticipantsView,
  PlatformSummary,
  TrackedDeal,
} from "../types";
import s from "./AppPage.module.css";

const LS_KEY = "ej.tracked.v1";
const loadTracked = (): TrackedDeal[] => {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
};
const saveTracked = (t: TrackedDeal[]) =>
  localStorage.setItem(LS_KEY, JSON.stringify(t));

export function AppPage() {
  const { address, isConnected, connector, chainId } = useAccount();
  const myAddr = (address ?? "") as string;
  const wrongChain = isConnected && chainId !== CHAIN_ID;
  const canWrite = isConnected && !wrongChain && !!address;

  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [tracked, setTracked] = useState<TrackedDeal[]>(loadTracked());
  const [deals, setDeals] = useState<Record<string, DealView>>({});
  const [selId, setSelId] = useState<string | null>(null);
  const [milestones, setMilestones] = useState<MilestoneView[]>([]);
  const [tranches, setTranches] = useState<Record<number, { tranche_value: number; released: boolean }>>({});
  const [participants, setParticipants] = useState<ParticipantsView | null>(null);
  const [myRole, setMyRole] = useState<string>("");
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [isErr, setIsErr] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dispute, setDispute] = useState<DisputeView | null>(null);

  const [oSeller, setOSeller] = useState("");
  const [oUri, setOUri] = useState("");
  const [oTotal, setOTotal] = useState("");
  const [oWit, setOWit] = useState(false);
  const [trackInput, setTrackInput] = useState("");

  const sel = selId ? deals[selId] : undefined;

  const flash = (msg: string, err = false) => {
    setNote(msg);
    setIsErr(err);
    if (msg) window.setTimeout(() => setNote(""), 6500);
  };

  const refreshSummary = useCallback(async () => {
    try {
      setSummary(await svc.getPlatformSummary());
    } catch {
      /* ignore */
    }
  }, []);

  const refreshDeal = useCallback(
    async (id: string, mine: string) => {
      try {
        const [d, ms, pp] = await Promise.all([
          svc.getDeal(id),
          svc.getMilestones(id),
          svc.getParticipants(id),
        ]);
        setDeals((prev) => ({ ...prev, [id]: d }));
        if (id === selId) {
          setMilestones(ms);
          setParticipants(pp);
          try {
            const tr = await Promise.all(
              ms.map((m) => svc.getTranche(id, m.idx).catch(() => null))
            );
            const map: Record<number, { tranche_value: number; released: boolean }> = {};
            tr.forEach((t, i) => {
              if (t)
                map[ms[i].idx] = {
                  tranche_value: Number((t as Record<string, unknown>).tranche_value ?? 0),
                  released: Boolean((t as Record<string, unknown>).released),
                };
            });
            setTranches(map);
          } catch {
            setTranches({});
          }
          if (mine) {
            try {
              setMyRole(await svc.getRoleOf(id, mine));
            } catch {
              setMyRole("");
            }
          }
        }
        return d;
      } catch {
        return undefined;
      }
    },
    [selId]
  );

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = connector?.getProvider ? await connector.getProvider() : null;
        if (active) svc.setWalletProvider(p);
      } catch {
        if (active) svc.setWalletProvider(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [connector, address]);

  useEffect(() => {
    refreshSummary();
    const t = setInterval(refreshSummary, 15000);
    return () => clearInterval(t);
  }, [refreshSummary]);

  useEffect(() => {
    tracked.forEach((td) => {
      svc
        .getDeal(td.id)
        .then((d) => setDeals((prev) => ({ ...prev, [td.id]: d })))
        .catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracked.length]);

  useEffect(() => {
    if (!selId) return;
    refreshDeal(selId, myAddr);
    const t = setInterval(() => refreshDeal(selId, myAddr), 12000);
    return () => clearInterval(t);
  }, [selId, myAddr, refreshDeal]);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      setBusy(label);
      setNote("");
      try {
        const r = await fn();
        flash(`${label} — accepted on ${NETWORK}.`);
        await refreshSummary();
        if (selId) await refreshDeal(selId, myAddr);
        return r;
      } catch (e) {
        flash(String((e as Error).message || e).slice(0, 240), true);
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [refreshSummary, refreshDeal, selId, myAddr]
  );

  function track(id: string, label: string) {
    setTracked((prev) => {
      if (prev.some((t) => t.id === id)) return prev;
      const next = [{ id, label, addedAt: Date.now(), disputeIds: [] }, ...prev];
      saveTracked(next);
      return next;
    });
  }
  function addDisputeId(dealId: string, disputeId: string) {
    setTracked((prev) => {
      const next = prev.map((t) =>
        t.id === dealId && !t.disputeIds.includes(disputeId)
          ? { ...t, disputeIds: [disputeId, ...t.disputeIds] }
          : t
      );
      saveTracked(next);
      return next;
    });
  }
  function untrack(id: string) {
    setTracked((prev) => {
      const next = prev.filter((t) => t.id !== id);
      saveTracked(next);
      return next;
    });
    if (selId === id) setSelId(null);
  }

  async function onOpenDeal() {
    if (!isConnected || !address) return flash("Connect a wallet first.", true);
    if (wrongChain)
      return flash("Switch your wallet to GenLayer Bradbury (chain 4221).", true);
    if (!/^0x[0-9a-fA-F]{40}$/.test(oSeller.trim()))
      return flash("Enter a valid seller address.", true);
    if (!oUri.trim()) return flash("A milestones document URL is required.", true);
    let wei: bigint;
    try {
      wei = genToWei(oTotal);
    } catch (e) {
      return flash((e as Error).message, true);
    }
    setBusy("Opening & funding deal");
    setNote("");
    try {
      const { dealId } = await svc.openDeal(address, oSeller, oUri, wei, oWit);
      track(dealId, oUri.slice(0, 40));
      setSelId(dealId);
      setOSeller("");
      setOUri("");
      setOTotal("");
      setOWit(false);
      await refreshSummary();
      flash(`Deal opened: ${dealId.slice(0, 12)}… funded ${weiToGen(wei)} GEN.`);
    } catch (e) {
      flash(String((e as Error).message || e).slice(0, 240), true);
    } finally {
      setBusy(null);
    }
  }

  async function openDrawerFor(disputeId: string) {
    try {
      setDispute(await svc.getDispute(disputeId));
      setDrawer(true);
    } catch (e) {
      flash(String((e as Error).message).slice(0, 200), true);
    }
  }

  const selTracked = tracked.find((t) => t.id === selId);

  return (
    <main className={s.page}>
      <div className="wrap">
        {/* header + live ledger stats */}
        <section className={s.head}>
          <p className="eyebrow">the bench · {NETWORK}</p>
          <h1 className={s.title}>Open, witness, and settle escrow.</h1>
          <div className={s.stats}>
            <span className={s.stat}>
              <b className="mono">{summary?.deals_total ?? "—"}</b>deals
            </span>
            <span className={s.stat}>
              <b className="mono">{summary?.disputes_total ?? "—"}</b>disputes
            </span>
            <span className={s.stat}>
              <b className="mono">{summary?.phase_counts?.ARBITRATING ?? "—"}</b>arbitrating
            </span>
            <span className={s.stat}>
              <b className="mono">{summary?.phase_counts?.CLOSED ?? "—"}</b>closed
            </span>
          </div>
        </section>

        <hr className="rule" />

        {/* registry desk */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <p className="eyebrow">the registry desk</p>
            <h2 className={s.h2}>Open a deal</h2>
          </div>

          <div className={`${s.wallet} ${wrongChain ? s.warn : ""}`}>
            {!isConnected ? (
              <span>Connect a wallet from the top bar to open and sign deals.</span>
            ) : wrongChain ? (
              <span>
                Wrong network — switch your wallet to GenLayer Bradbury (chain 4221).
              </span>
            ) : (
              <span>
                Signing as <b className="mono">{shortAddr(myAddr)}</b> · every action is
                approved in your wallet.
              </span>
            )}
          </div>

          <div className={s.deskGrid}>
            <div>
              <label className="fld">Seller address</label>
              <input
                className="in mono"
                value={oSeller}
                onChange={(e) => setOSeller(e.target.value)}
                placeholder="0x… counterparty"
              />
              <label className="fld">Milestones document URL</label>
              <input
                className="in mono"
                value={oUri}
                onChange={(e) => setOUri(e.target.value)}
                placeholder="https://… (sha256 anchored on-chain)"
              />
            </div>
            <div className={s.deskRight}>
              <label className="fld">Escrow total (GEN)</label>
              <input
                className="in mono"
                value={oTotal}
                onChange={(e) => setOTotal(e.target.value)}
                placeholder="e.g. 2"
                inputMode="decimal"
              />
              <label className={s.check}>
                <input
                  type="checkbox"
                  checked={oWit}
                  onChange={(e) => setOWit(e.target.checked)}
                />
                require a witness attestation before release
              </label>
              <button
                className="btn brass"
                style={{ marginTop: 18, width: "100%", justifyContent: "center" }}
                disabled={!!busy || !canWrite}
                onClick={onOpenDeal}
              >
                Open &amp; fund deal <span className="ico">→</span>
              </button>
            </div>
          </div>
        </section>

        <hr className="rule" />

        {/* deal ledger */}
        <section className={s.section}>
          <div className={s.sectionHead}>
            <p className="eyebrow">the deal ledger</p>
            <h2 className={s.h2}>Tracked deals</h2>
          </div>

          <div className={s.trackRow}>
            <input
              className="in mono"
              value={trackInput}
              onChange={(e) => setTrackInput(e.target.value)}
              placeholder="track an existing deal_id (64 hex)"
            />
            <button
              className="btn ghost"
              onClick={() => {
                const v = trackInput.trim().replace(/^0x/, "");
                if (/^[0-9a-f]{64}$/i.test(v)) {
                  track(v, "tracked deal");
                  setSelId(v);
                  setTrackInput("");
                } else flash("Deal ids are 64 hex characters.", true);
              }}
            >
              Track
            </button>
          </div>

          <div className={s.ledger}>
            {tracked.length === 0 && (
              <div className="empty">No deals tracked yet. Open one above, or paste a deal_id.</div>
            )}
            {tracked.map((td) => {
              const d = deals[td.id];
              if (!d || !d.exists)
                return (
                  <div key={td.id} className={s.ghostRow}>
                    <span className="mono">#{td.id.slice(0, 12)}…</span>
                    <span>loading / not found</span>
                    <button className="btn ghost" onClick={() => untrack(td.id)}>
                      drop
                    </button>
                  </div>
                );
              return (
                <DealCard
                  key={td.id}
                  deal={d}
                  selected={selId === td.id}
                  myRole={selId === td.id ? myRole : undefined}
                  onClick={() => setSelId(td.id)}
                />
              );
            })}
          </div>
        </section>

        {/* the bench */}
        <AnimatePresence mode="wait">
          {sel && sel.exists && (
            <motion.section
              key={sel.deal_id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
            >
              <hr className="rule" />
              <div className={s.sectionHead}>
                <p className="eyebrow">in session</p>
                <h2 className={s.h2}>
                  Deal <span className="mono">#{sel.deal_id.slice(0, 12)}</span>
                </h2>
              </div>

              <div className={s.bench}>
                <div className={s.benchCol}>
                  <p className={s.colLabel}>Actors</p>
                  <RoleRegistryTable
                    participants={participants}
                    myAddr={myAddr}
                    witnessRequired={sel.witness_required}
                  />
                  <div className={s.facts}>
                    <div className="kv"><span>status / phase</span><PhasePill phase={sel.phase} /></div>
                    <div className="kv"><span>escrowed</span><b className="mono">{weiToGen(sel.funded)} GEN</b></div>
                    <div className="kv"><span>remaining in escrow</span><b className="mono">{weiToGen(sel.remaining_escrow_balance)} GEN</b></div>
                    <div className="kv"><span>claimable to seller</span><b className="mono">{weiToGen(sel.seller_claimable)} GEN</b></div>
                    <div className="kv"><span>refundable to buyer</span><b className="mono">{weiToGen(sel.buyer_claimable)} GEN</b></div>
                    <div className="kv"><span>released to seller</span><b className="mono">{weiToGen(sel.released)} GEN</b></div>
                    <div className="kv"><span>refunded to buyer</span><b className="mono">{weiToGen(sel.refunded)} GEN</b></div>
                    <div className="kv"><span>unallocated</span><b className="mono">{weiToGen(sel.unallocated_escrow)} GEN</b></div>
                    <div className="kv"><span>witness</span><b>{sel.witness_required ? "required" : "optional"}</b></div>
                    <div className="kv"><span>doc sha256</span><b className="mono">{sel.milestones_doc_sha256 ? sel.milestones_doc_sha256.slice(0, 10) + "…" : "—"}</b></div>
                  </div>
                </div>

                <div className={s.benchCol}>
                  <p className={s.colLabel}>Phase clock</p>
                  <PhaseClock current={sel.phase} />
                  {selTracked && selTracked.disputeIds.length > 0 && (
                    <div className={s.disputes}>
                      <p className={s.colLabel}>Disputes</p>
                      {selTracked.disputeIds.map((did) => (
                        <button key={did} className={s.disputeRow} onClick={() => openDrawerFor(did)}>
                          <span className="mono">#{did.slice(0, 12)}…</span>
                          <span>open bench →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className={s.benchCol}>
                  <p className={s.colLabel}>Milestone scales</p>
                  <MilestoneScales milestones={milestones} />
                  {milestones.length > 0 && (
                    <div className={s.facts}>
                      {[...milestones]
                        .sort((a, b) => a.idx - b.idx)
                        .map((m) => (
                          <div className="kv" key={m.idx}>
                            <span>M{m.idx} tranche</span>
                            <b className="mono">
                              {tranches[m.idx] ? weiToGen(tranches[m.idx].tranche_value) : "—"} GEN
                              {tranches[m.idx]?.released ? " · released" : ""}
                            </b>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>

              <hr className="rule" />
              <div className={s.sectionHead}>
                <p className="eyebrow">actions</p>
                <h2 className={s.h2}>Move the deal</h2>
              </div>
              {canWrite && address ? (
                <Actions
                  account={address}
                  deal={sel}
                  milestones={milestones}
                  busy={!!busy}
                  run={run}
                  onDisputeOpened={(did, dealId) => {
                    addDisputeId(dealId, did);
                    flash(`Dispute opened: ${did.slice(0, 12)}…`);
                  }}
                />
              ) : (
                <div className="empty">
                  {wrongChain
                    ? "Switch your wallet to GenLayer Bradbury (chain 4221) to act on this deal."
                    : "Connect a wallet to act on this deal."}
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </div>

      <DisputeDrawer open={drawer} dispute={dispute} onClose={() => setDrawer(false)} />

      {(busy || note) && (
        <div className={`toast ${isErr ? "err" : ""}`}>{busy ? `${busy}…` : note}</div>
      )}
    </main>
  );
}
