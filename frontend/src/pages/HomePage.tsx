import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BrassScale } from "../components/BrassScale";
import { PhaseClock } from "../components/PhaseClock";
import * as svc from "../contractService";
import { CONTRACT_ADDRESS, NETWORK } from "../chain";
import { PHASE_LABEL } from "../lib";
import { PHASES } from "../types";
import type { PlatformSummary } from "../types";
import s from "./HomePage.module.css";

const EASE = [0.32, 0.72, 0, 1] as const;
const reveal = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-70px" },
  transition: { duration: 0.7, ease: EASE },
};

const STEPS = [
  { n: "01", t: "Fund the escrow", d: "The buyer opens a deal against a seller and escrows the full amount. The milestones document is fetched live and its sha256 is anchored on-chain." },
  { n: "02", t: "Declare the tranches", d: "The seller breaks the work into milestones, each carrying a share of the escrow in basis points — the tranches that will release one at a time." },
  { n: "03", t: "Witness, then release", d: "An optional witness attests a milestone is done. A validator-run model checks the attestation actually describes the deliverable before the buyer releases the tranche." },
  { n: "04", t: "Open a dispute", d: "If a milestone goes wrong, either side posts a bonded dispute. The grievance is normalized into a short summary for the arbiters to read." },
  { n: "05", t: "Seat the arbiters", d: "The platform assigns arbiters to the deal. Each files a finding — which way they lean and why — recorded on-chain." },
  { n: "06", t: "Weigh the verdict", d: "A GenLayer jury synthesizes the findings and evidence into BUYER_WINS, SELLER_WINS, or SPLIT, with the exact share of the contested tranche that passes to the seller." },
];

const ROLES = [
  { r: "Buyer", d: "Opens and funds the deal, releases each tranche, and can raise a dispute." },
  { r: "Seller", d: "Accepts the deal, declares the milestones, and requests release as work lands." },
  { r: "Witness", d: "Optional third party who attests a milestone is genuinely complete." },
  { r: "Arbiter", d: "Seated on a disputed deal to file a finding the jury weighs." },
  { r: "Platform", d: "The deployer — seats arbiters and can void a stalled deal. Never a counterparty." },
];

export function HomePage({ navigate }: { navigate: (r: string) => void }) {
  const [summary, setSummary] = useState<PlatformSummary | null>(null);

  useEffect(() => {
    let on = true;
    svc.getPlatformSummary().then((d) => on && setSummary(d)).catch(() => undefined);
    return () => {
      on = false;
    };
  }, []);

  return (
    <main className={s.page}>
      {/* hero */}
      <section className={`wrap ${s.hero}`}>
        <div className={s.heroText}>
          <motion.p className="eyebrow" {...reveal}>
            multi-party escrow · on-chain arbitration
          </motion.p>
          <motion.h1 className={s.h1} {...reveal} transition={{ ...reveal.transition, delay: 0.05 }}>
            The escrow is held until the <em>scales settle.</em>
          </motion.h1>
          <motion.p className={s.lede} {...reveal} transition={{ ...reveal.transition, delay: 0.12 }}>
            A buyer funds a deal against a seller and a sequence of milestone tranches.
            Each tranche releases only when the right roles sign off. When a milestone is
            contested, a small arbiter jury files findings and a GenLayer verdict decides
            the exact split — and the brass beam tilts to the seller&apos;s share.
          </motion.p>
          <motion.div className={s.cta} {...reveal} transition={{ ...reveal.transition, delay: 0.18 }}>
            <button className="btn brass" onClick={() => navigate("app")}>
              Step up to the bench <span className="ico">→</span>
            </button>
            <a className={s.textLink} href="#mechanism">See how a deal moves</a>
          </motion.div>
          <motion.div className={s.heroStats} {...reveal} transition={{ ...reveal.transition, delay: 0.24 }}>
            <span><b className="mono">{summary?.deals_total ?? "—"}</b> deals weighed</span>
            <span><b className="mono">{summary?.disputes_total ?? "—"}</b> disputes settled</span>
            <span><b className="mono">{NETWORK}</b></span>
          </motion.div>
        </div>
        <motion.div
          className={s.heroArt}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: EASE }}
        >
          <BrassScale splitBps={null} verdict="" caption="balanced until a dispute is weighed" />
        </motion.div>
      </section>

      {/* mechanism */}
      <section id="mechanism" className={`wrap ${s.section}`}>
        <motion.div className={s.secHead} {...reveal}>
          <p className="eyebrow">the mechanism</p>
          <h2 className={s.h2}>How a deal moves</h2>
          <p className="muted" style={{ maxWidth: "54ch" }}>
            Six moves carry escrowed value from funded to settled. Two of them lean on
            validators running language models; the rest are plain role-gated state.
          </p>
        </motion.div>
        <div className={s.steps}>
          {STEPS.map((st, i) => (
            <motion.article
              key={st.n}
              className={s.step}
              {...reveal}
              transition={{ ...reveal.transition, delay: (i % 2) * 0.06 }}
            >
              <span className={s.stepNum}>{st.n}</span>
              <div>
                <h3 className={s.stepTitle}>{st.t}</h3>
                <p className={s.stepBody}>{st.d}</p>
              </div>
            </motion.article>
          ))}
        </div>
      </section>

      {/* phases */}
      <section className={`wrap ${s.section} ${s.phaseSplit}`}>
        <motion.div {...reveal}>
          <p className="eyebrow">the lifecycle</p>
          <h2 className={s.h2}>Nine phases, one ledger</h2>
          <p className="muted" style={{ maxWidth: "46ch" }}>
            Every deal walks a fixed path. The clock lights the phase a deal sits in; the
            bench reads it at a glance.
          </p>
          <div className={s.phaseList}>
            {PHASES.map((p, i) => (
              <span key={p} className={s.phaseChip}>
                <i className="mono">{String(i + 1).padStart(2, "0")}</i>
                {PHASE_LABEL[p]}
              </span>
            ))}
          </div>
        </motion.div>
        <motion.div
          className={s.phaseArt}
          {...reveal}
          transition={{ ...reveal.transition, delay: 0.1 }}
        >
          <PhaseClock current="ARBITRATING" />
        </motion.div>
      </section>

      {/* roles */}
      <section className={`wrap ${s.section}`}>
        <motion.div className={s.secHead} {...reveal}>
          <p className="eyebrow">the registry</p>
          <h2 className={s.h2}>Five roles, bound per deal</h2>
          <p className="muted" style={{ maxWidth: "52ch" }}>
            The same address can be a buyer in one deal and an arbiter in another. Every
            privileged action checks the caller&apos;s role on that specific deal first.
          </p>
        </motion.div>
        <div className={s.roles}>
          {ROLES.map((ro, i) => (
            <motion.div
              key={ro.r}
              className={s.role}
              {...reveal}
              transition={{ ...reveal.transition, delay: i * 0.05 }}
            >
              <h3 className={s.roleName}>{ro.r}</h3>
              <p className={s.roleBody}>{ro.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* consensus */}
      <section className={`wrap ${s.section}`}>
        <motion.div className={s.secHead} {...reveal}>
          <p className="eyebrow">non-determinism</p>
          <h2 className={s.h2}>Decided by validators, not a server</h2>
        </motion.div>
        <div className={s.consensus}>
          <motion.div className={s.cItem} {...reveal}>
            <span className={s.cNum}>3</span>
            <h3 className={s.roleName}>Language-model checkpoints</h3>
            <p className={s.roleBody}>
              Milestone coherence at attestation, the dispute summary, and the jury verdict
              — each run by validators and reconciled, not trusted to one machine.
            </p>
          </motion.div>
          <motion.div className={s.cItem} {...reveal} transition={{ ...reveal.transition, delay: 0.06 }}>
            <span className={s.cNum}>2</span>
            <h3 className={s.roleName}>Live web fetches</h3>
            <p className={s.roleBody}>
              The milestones document at funding and the evidence bundle at finalization are
              pulled from the open web and hashed into the record.
            </p>
          </motion.div>
          <motion.div className={s.cItem} {...reveal} transition={{ ...reveal.transition, delay: 0.12 }}>
            <span className={s.cNum}>±</span>
            <h3 className={s.roleName}>A custom split reconciler</h3>
            <p className={s.roleBody}>
              Validators agree on a verdict when they pick the same label and land within a
              tolerance band on the seller&apos;s share — so a noisy model still settles cleanly.
            </p>
          </motion.div>
        </div>
      </section>

      {/* cta */}
      <section className={`wrap ${s.ctaBlock}`}>
        <motion.div {...reveal}>
          <h2 className={s.ctaTitle}>Step up to the bench.</h2>
          <p className="muted" style={{ maxWidth: "48ch", margin: "14px auto 26px" }}>
            Connect a wallet, open a funded deal, and run it through to a settled verdict.
          </p>
          <button className="btn brass" onClick={() => navigate("app")}>
            Open the app <span className="ico">→</span>
          </button>
        </motion.div>
      </section>

      <footer className={`wrap ${s.foot}`}>
        <span>Stone &amp; Scales · EscrowArbiter</span>
        <span className="mono">{CONTRACT_ADDRESS.slice(0, 10)}… · {NETWORK}</span>
      </footer>
    </main>
  );
}
