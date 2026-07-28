import s from "./Nav.module.css";
import { Connect } from "./Connect";
import { NETWORK } from "../chain";

interface Props {
  route: string;
  navigate: (r: string) => void;
}

export function Nav({ route, navigate }: Props) {
  return (
    <header className={s.nav}>
      <div className={`wrap ${s.inner}`}>
        <button className={s.brand} onClick={() => navigate("home")}>
          <span className={s.glyph} aria-hidden>
            ⚖
          </span>
          <span className={s.brandText}>
            <b>Stone &amp; Scales</b>
            <i>Escrow Arbiter</i>
          </span>
        </button>

        <nav className={s.links}>
          <button
            className={`${s.link} ${route === "home" ? s.active : ""}`}
            onClick={() => navigate("home")}
          >
            Overview
          </button>
          <button
            className={`${s.link} ${route === "app" ? s.active : ""}`}
            onClick={() => navigate("app")}
          >
            The bench
          </button>
        </nav>

        <div className={s.right}>
          <span className={s.net}>
            <i /> {NETWORK}
          </span>
          <Connect />
        </div>
      </div>
    </header>
  );
}
