// EscrowArbiter — deployed on GenLayer Bradbury Testnet.
// Public config; values come from the committed .env (see .env.example) with
// the deployed fallbacks below so a build without an env file stays correct.
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ??
  "0x9f5f20c298415d3fd653867ab1b27a10184358b9") as `0x${string}`;

export const NETWORK = "testnetBradbury" as const;
export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 4221);
export const RPC_URL =
  import.meta.env.VITE_RPC_URL ?? "https://rpc-bradbury.genlayer.com";
export const EXPLORER_TX = "https://explorer-bradbury.genlayer.com/tx/";
