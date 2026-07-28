import { ConnectButton } from "@rainbow-me/rainbowkit";
import s from "./Connect.module.css";

export function Connect() {
  return (
    <div className={s.wrap}>
      <ConnectButton
        showBalance={false}
        accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
        chainStatus={{ smallScreen: "icon", largeScreen: "full" }}
      />
    </div>
  );
}
