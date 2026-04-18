import { create } from "zustand";
import { persist } from "zustand/middleware";
import { chains, defaultNetwork, type NetworkConfig } from "../tools/networkData";

interface NetworkStore {
  selectedNetwork: NetworkConfig;
  setSelectedNetwork: (network: NetworkConfig) => void;
  getNetworkByChainId: (chainId: number) => NetworkConfig | undefined;
}

export const useNetworkStore = create<NetworkStore>()(
  persist(
    (set) => ({
      selectedNetwork: defaultNetwork,
      setSelectedNetwork: (network) => set({ selectedNetwork: network }),
      getNetworkByChainId: (chainId) => chains.find((chain) => chain.chainId === chainId),
    }),
    {
      name: "simplevault-network",
    },
  ),
);

export const getCurrentNetwork = (): NetworkConfig => useNetworkStore.getState().selectedNetwork;
