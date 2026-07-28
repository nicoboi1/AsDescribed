import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import gsap from "gsap";
import s from "./BrassScale.module.css";
import { verdictColor, verdictLabel } from "../lib";
import type { Verdict } from "../types";

interface Props {
  // seller share of the disputed tranche, 0..10000; null when no live dispute
  splitBps: number | null;
  verdict: Verdict;
  caption: string;
}

// Map seller-share bps (0..10000) to a beam tilt. 5000 = level.
function bpsToAngle(bps: number): number {
  return ((bps - 5000) / 5000) * 16;
}

export function BrassScale({ splitBps, verdict, caption }: Props) {
  const live = splitBps != null;
  const angle = live ? bpsToAngle(splitBps) : 0;
  const beamRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    if (live || !beamRef.current) return;
    const tween = gsap.to(beamRef.current, {
      rotation: 2.4,
      transformOrigin: "200px 96px",
      duration: 3.6,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    return () => {
      tween.kill();
      if (beamRef.current) gsap.set(beamRef.current, { rotation: 0 });
    };
  }, [live]);

  return (
    <div className={s.wrap}>
      <svg viewBox="0 0 400 300" className={s.svg} aria-hidden>
        <rect x="150" y="262" width="100" height="12" rx="3" fill="#2a2620" />
        <rect x="186" y="96" width="28" height="172" rx="6" fill="#34302a" />
        <circle cx="200" cy="96" r="9" fill="var(--brass)" stroke="#5e4708" />
        <motion.g
          ref={beamRef}
          animate={live ? { rotate: angle } : undefined}
          transition={{ type: "spring", stiffness: 42, damping: 10 }}
          style={{ originX: "200px", originY: "96px" }}
        >
          <rect x="48" y="92" width="304" height="8" rx="4" fill="var(--brass)" />
          <circle cx="56" cy="96" r="5" fill="var(--brass-dim)" />
          <circle cx="344" cy="96" r="5" fill="var(--brass-dim)" />
          <line x1="56" y1="96" x2="40" y2="150" stroke="#5e4708" strokeWidth="1.5" />
          <line x1="56" y1="96" x2="72" y2="150" stroke="#5e4708" strokeWidth="1.5" />
          <path d="M24 150 H88 L78 176 Q56 188 34 176 Z" fill="rgba(139,0,0,0.16)" stroke="var(--verdict)" strokeWidth="1.5" />
          <text x="56" y="168" className={s.pan} textAnchor="middle">BUYER</text>
          <line x1="344" y1="96" x2="328" y2="150" stroke="#5e4708" strokeWidth="1.5" />
          <line x1="344" y1="96" x2="360" y2="150" stroke="#5e4708" strokeWidth="1.5" />
          <path d="M312 150 H376 L366 176 Q344 188 322 176 Z" fill="rgba(184,134,11,0.18)" stroke="var(--brass-dim)" strokeWidth="1.5" />
          <text x="344" y="168" className={s.pan} textAnchor="middle">SELLER</text>
        </motion.g>
      </svg>
      <div className={s.readout}>
        {live ? (
          <>
            <span className={s.verdict} style={{ color: verdictColor(verdict) }}>
              {verdictLabel(verdict)}
            </span>
            <span className={s.split}>
              <b className="mono">{(splitBps! / 100).toFixed(0)}%</b> to seller ·{" "}
              <b className="mono">{((10000 - splitBps!) / 100).toFixed(0)}%</b> to buyer
            </span>
          </>
        ) : (
          <span className={s.idle}>{caption}</span>
        )}
      </div>
    </div>
  );
}
