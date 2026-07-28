import { motion } from "framer-motion";
import s from "./RoleRegistryTable.module.css";
import type { ParticipantsView } from "../types";
import { shortAddr } from "../lib";

interface Props {
  participants: ParticipantsView | null;
  myAddr?: string;
  witnessRequired?: boolean;
}

const ROWS: { key: keyof ParticipantsView; role: string }[] = [
  { key: "buyer", role: "Buyer" },
  { key: "seller", role: "Seller" },
  { key: "witness", role: "Witness" },
  { key: "platform", role: "Platform" },
];

function isReal(a?: string): boolean {
  return !!a && a !== "0x" && a.replace(/^0x/, "").replace(/0/g, "") !== "";
}

export function RoleRegistryTable({ participants, myAddr, witnessRequired }: Props) {
  if (!participants) {
    return <div className="empty">Select a deal to see its role registry.</div>;
  }
  const mine = (myAddr ?? "").toLowerCase();
  return (
    <div className={s.table}>
      {ROWS.map((row) => {
        const addr = participants[row.key];
        const present = isReal(addr);
        const isMe = present && addr!.toLowerCase() === mine;
        const optional = row.key === "witness" && !witnessRequired;
        return (
          <motion.div
            key={row.key}
            className={`${s.row} ${present ? "" : s.absent}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className={`${s.role} ${s["r_" + row.key]}`}>{row.role}</span>
            <span className={`${s.addr} mono`}>
              {present ? shortAddr(addr) : optional ? "not required" : "unbound"}
            </span>
            {isMe && <span className={s.you}>you</span>}
          </motion.div>
        );
      })}
    </div>
  );
}
