import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Peel the large *static* libraries into their own chunks so the entry bundle
// stays under Vite's 500 kB warning threshold. RainbowKit / WalletConnect /
// Reown keep their built-in per-wallet, per-locale dynamic splitting, so they
// are deliberately left ungrouped.
export default defineConfig({
  base: "./",
  cacheDir: ".vite_cache",
  plugins: [react()],
  server: { port: 5380 },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("/react-dom/") || id.includes("/scheduler/")) return "react-dom";
          if (id.includes("/react/")) return "react";
          if (id.includes("/genlayer-js/")) return "genlayer";
          if (id.includes("/d3-") || id.includes("/d3/") || id.includes("/internmap/")) return "d3";
          if (
            id.includes("/framer-motion/") ||
            id.includes("/motion-dom/") ||
            id.includes("/motion-utils/")
          ) {
            return "framer";
          }
          if (id.includes("/gsap/")) return "gsap";
          if (
            id.includes("/socket.io-client/") ||
            id.includes("/socket.io-parser/") ||
            id.includes("/engine.io-client/") ||
            id.includes("/engine.io-parser/") ||
            id.includes("/@socket.io/") ||
            id.includes("/cross-fetch/") ||
            id.includes("/node-fetch/") ||
            id.includes("/eventemitter2/") ||
            id.includes("/uuid/") ||
            id.includes("/@metamask/sdk-analytics/")
          ) {
            return "walletsdk";
          }
          if (id.includes("/@metamask/sdk/")) return "metamask";
          if (
            id.includes("/@noble/") ||
            id.includes("/@scure/") ||
            id.includes("/@adraffy/") ||
            id.includes("/abitype/")
          ) {
            return "cryptobase";
          }
          if (
            id.includes("/viem/") ||
            id.includes("/ox/") ||
            id.includes("/wagmi/") ||
            id.includes("/@wagmi/")
          ) {
            return "crypto";
          }
          if (id.includes("/@tanstack/")) return "tanstack";
        },
      },
    },
  },
});
