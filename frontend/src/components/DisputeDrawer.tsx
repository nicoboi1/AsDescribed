import { AnimatePresence, motion } from "framer-motion";
import s from "./DisputeDrawer.module.css";
import type { DisputeView } from "../types";
import { shortAddr, verdictColor, verdictLabel } from "../lib";

interface Props {
  open: boolean;
  dispute: DisputeView | null;
  onClose: () => void;
}

export function DisputeDrawer({ open, dispute, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && dispute && dispute.exists && (
        <>
          <motion.div
            className={s.scrim}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={s.drawer}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
          >
            <div className={s.top}>
              <div>
                <p className={s.eyebrow}>dispute · milestone {dispute.milestone_idx}</p>
                <h3 className={s.title}>The bench is in session</h3>
              </div>
              <button className={s.x} onClick={onClose} aria-label="Close">
                ✕
              </button>
            </div>

            <div className={s.section}>
              <span className={s.lbl}>opener</span>
              <p className="mono">{shortAddr(dispute.opener)}</p>
            </div>

            <div className={s.section}>
              <span className={s.lbl}>ground</span>
              <p className={s.body}>{dispute.ground || "—"}</p>
            </div>

            {dispute.ground_summary && (
              <div className={s.section}>
                <span className={s.lbl}>llm summary</span>
                <p className={s.summary}>{dispute.ground_summary}</p>
              </div>
            )}

            {dispute.evidence_uri && (
              <div className={s.section}>
                <span className={s.lbl}>evidence bundle</span>
                <a className="mono" href={dispute.evidence_uri} target="_blank" rel="noreferrer">
                  {dispute.evidence_uri.slice(0, 46)}
                </a>
              </div>
            )}

            <div className={s.section}>
              <span className={s.lbl}>arbiter findings</span>
              <p className={s.note}>
                Findings are filed on-chain per arbiter and synthesized into the
                verdict at <code>finalize_dispute</code>.
              </p>
            </div>

            <div
              className={s.verdictBox}
              style={{ borderColor: verdictColor(dispute.final_verdict) }}
            >
              <span className={s.lbl}>final verdict</span>
              {dispute.finalized_at_seq > 0 ? (
                <>
                  <strong
                    className={s.verdict}
                    style={{ color: verdictColor(dispute.final_verdict) }}
                  >
                    {verdictLabel(dispute.final_verdict)}
                  </strong>
                  <div className={s.splitBar}>
                    <i
                      className={s.seller}
                      style={{ width: `${dispute.final_split_bps / 100}%` }}
                    />
                    <i
                      className={s.buyer}
                      style={{ width: `${(10000 - dispute.final_split_bps) / 100}%` }}
                    />
                  </div>
                  <div className={s.splitMeta}>
                    <span className="mono">
                      seller {(dispute.final_split_bps / 100).toFixed(0)}%
                    </span>
                    <span className="mono">
                      buyer {((10000 - dispute.final_split_bps) / 100).toFixed(0)}%
                    </span>
                  </div>
                </>
              ) : (
                <p className={s.pending}>Awaiting arbiter findings + finalize.</p>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
