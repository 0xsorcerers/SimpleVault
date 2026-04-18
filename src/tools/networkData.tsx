import type { Address } from "viem";

export interface NetworkConfig {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  blockExplorer: string;
  decimals: number;
  symbol: string;
  contractAddress: Address;
}

export const chains: NetworkConfig[] = [
  {
    key: "sepolia",
    name: "Sepolia",
    chainId: 11155111,
    rpc: "https://ethereum-sepolia-rpc.publicnode.com",
    blockExplorer: "https://sepolia.etherscan.io",
    decimals: 18,
    symbol: "ETH",
    contractAddress: "0x00A870a1c93C4a1569B270B537bE84E771D1786F" as Address,
  },
  {
    key: "hashkey",
    name: "HashKey",
    chainId: 177,
    rpc: "https://mainnet.hsk.xyz",
    blockExplorer: "https://hashkey.blockscout.com",
    decimals: 18,
    symbol: "HSK",
    contractAddress: import.meta.env.VITE_HASKEY_CONTRACT_ID as Address,
  },
];

export const defaultNetwork = chains[0];

export const getNetworkByChainId = (chainId?: number): NetworkConfig | undefined =>
  chains.find((network) => network.chainId === chainId);
