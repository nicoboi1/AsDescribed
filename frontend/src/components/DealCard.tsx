import { motion } from "framer-motion";
import s from "./DealCard.module.css";
import type { DealView } from "../types";
import { PHASE_COLOR, PHASE_LABEL, shortAddr, weiToGen } from "../lib";

interface Props {
  deal: DealView;
  selected: boolean;
  myRole?: string;
  onClick: () => void;
}

export function PhasePill({ phase }: { phase: string }) {
  const color = PHASE_COLOR[phase] ?? PHASE_COLOR.UNKNOWN;
  return (
    <motion.span
      className={s.pill}
      initial={false}
      animate={{
        backgroundColor: `${color}22`,
        color,
        borderColor: `${color}66`,
      }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      <motion.i
        className={s.dot}
        animate={{ backgroundColor: color }}
        transition={{ duration: 0.5 }}
      />
      {PHASE_LABEL[phase] ?? phase}
    </motion.span>
  );
}

export function DealCard({ deal, selected, myRole, onClick }: Props) {
  const pct =
    Number(deal.total) > 0
      ? Math.min(100, Math.round((Number(deal.released) / Number(deal.total)) * 100))
      : 0;
  return (
    <motion.button
      layout
      className={`${s.card} ${selected ? s.on : ""}`}
      onClick={onClick}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      <div className={s.head}>
        <span className={`${s.id} mono`}>#{deal.deal_id.slice(0, 10)}</span>
        <PhasePill phase={deal.phase} />
      </div>
      <div className={s.parties}>
        <span>
          <i>buyer</i>
          <b className="mono">{shortAddr(deal.buyer)}</b>
        </span>
        <span className={s.arrow}>⇄</span>
        <span>
          <i>seller</i>
          <b className="mono">{shortAddr(deal.seller)}</b>
        </span>
      </div>
      <div className={s.bar}>
        <motion.i
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <div className={s.meta}>
        <span className="mono">
          {weiToGen(deal.released)} / {weiToGen(deal.total)} GEN released
        </span>
        {myRole && myRole !== "NONE" && (
          <span className={s.role}>you: {myRole.toLowerCase()}</span>
        )}
      </div>
    </motion.button>
  );
}
