import { defineChain } from "viem";
import { CHAIN_ID, RPC_URL } from "./chain";

// GenLayer Bradbury as a viem/wagmi chain so the connected wallet targets the
// same testnet as the deployed intelligent contract.
export const bradbury = defineChain({
  id: CHAIN_ID,
  name: "GenLayer Bradbury Testnet",
  network: "testnet-bradbury",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: {
      name: "GenLayer Bradbury Explorer",
      url: "https://explorer-bradbury.genlayer.com",
    },
  },
  testnet: true,
});
