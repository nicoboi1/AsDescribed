import "@rainbow-me/rainbowkit/styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import RainbowRuntime from "./RainbowRuntime";
import "./styles.css";
import "./pro-ui.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RainbowRuntime />
  </React.StrictMode>,
);
