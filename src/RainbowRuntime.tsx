import {
  RainbowKitProvider,
  connectorsForWallets,
  darkTheme,
  getDefaultConfig,
  useAccountModal,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import { injectedWallet } from "@rainbow-me/rainbowkit/wallets";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useMemo } from "react";
import {
  WagmiProvider,
  createConfig,
  http,
  useAccount,
  useDisconnect,
  useSwitchChain,
} from "wagmi";
import type { Chain } from "wagmi/chains";
import App from "./App";
import {
  BRADBURY_CHAIN_ID,
  BRADBURY_EXPLORER,
  BRADBURY_RPC,
} from "./lib/genlayer";
import type { WalletAdapter } from "./types";

const APP_NAME = "AsDescribed";
const injectedOnlyProjectId = "asdescribed-injected-only";
const walletConnectProjectId =
  import.meta.env.VITE_WALLETCONNECT_PROJECT_ID?.trim();

export const bradburyChain = {
  id: BRADBURY_CHAIN_ID,
  name: "GenLayer Bradbury",
  nativeCurrency: {
    name: "GEN",
    symbol: "GEN",
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [BRADBURY_RPC] },
  },
  blockExplorers: {
    default: {
      name: "GenLayer Explorer",
      url: BRADBURY_EXPLORER,
    },
  },
  testnet: true,
} as const satisfies Chain;

const chains = [bradburyChain] as const;
const transports = {
  [bradburyChain.id]: http(BRADBURY_RPC),
};

const injectedConnectors = connectorsForWallets(
  [
    {
      groupName: "Installed wallets",
      wallets: [injectedWallet],
    },
  ],
  {
    appName: APP_NAME,
    projectId: injectedOnlyProjectId,
  },
);

const wagmiConfig = walletConnectProjectId
  ? getDefaultConfig({
      appName: APP_NAME,
      appDescription:
        "Enforceable marketplace delivery promises on GenLayer Bradbury.",
      appUrl: window.location.origin,
      projectId: walletConnectProjectId,
      chains,
      transports,
    })
  : createConfig({
      chains,
      connectors: injectedConnectors,
      transports,
    });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 15_000,
    },
  },
});

function ConnectedMarketplace() {
  const {
    address,
    connector,
    isConnected,
    status,
  } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { disconnectAsync } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const wallet = useMemo<WalletAdapter | null>(() => {
    if (!address || !connector || !isConnected) return null;

    return {
      address,
      getEthereumProvider: () => connector.getProvider(),
      switchChain: async (chainId) => {
        if (chainId !== BRADBURY_CHAIN_ID) {
          throw new Error(`Unsupported chain ${chainId}.`);
        }
        return switchChainAsync({ chainId: BRADBURY_CHAIN_ID });
      },
    };
  }, [address, connector, isConnected, switchChainAsync]);

  const openWallet = async () => {
    if (openAccountModal) {
      openAccountModal();
      return;
    }
    await disconnectAsync();
  };

  return (
    <App
      wallet={wallet}
      walletReady={status !== "reconnecting"}
      walletMode="rainbowkit"
      authenticated={Boolean(wallet)}
      onConnect={() => openConnectModal?.()}
      onDisconnect={openWallet}
    />
  );
}

export default function RainbowRuntime() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          initialChain={bradburyChain}
          modalSize="compact"
          theme={darkTheme({
            accentColor: "#c8ff3d",
            accentColorForeground: "#07120e",
            borderRadius: "large",
            fontStack: "system",
            overlayBlur: "small",
          })}
          appInfo={{
            appName: APP_NAME,
            learnMoreUrl: "https://docs.genlayer.com",
          }}
        >
          <ConnectedMarketplace />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
