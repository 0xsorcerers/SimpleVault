import { create } from "zustand";
import { persist } from "zustand/middleware";
import { chains, type NetworkConfig } from "@/tools/networkData";
import type { Address } from "viem";

interface NetworkStore {
  selectedNetwork: NetworkConfig;
  setSelectedNetwork: (network: NetworkConfig) => void;
  getNetworkByChainId: (chainId: number) => NetworkConfig | undefined;
}

// Default to first chain (Sepolia)
const defaultNetwork = chains[0];

export const useNetworkStore = create<NetworkStore>()(
  persist(
    (set) => ({
      selectedNetwork: defaultNetwork,

      setSelectedNetwork: (network) => {
        set({ selectedNetwork: network });
      },

      getNetworkByChainId: (chainId) => {
        return chains.find((chain) => chain.chainId === chainId);
      },
    }),
    {
      name: "penny4thots-network",
    }
  )
);

// Helper to get current network (for use outside of React components)
export const getCurrentNetwork = (): NetworkConfig => {
  return useNetworkStore.getState().selectedNetwork;
};
