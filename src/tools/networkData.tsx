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
    contractAddress: "0x98f524D114748Ce003466C1118E1C5537B9Fea5f" as Address,
  },
  {
    key: "hashkey",
    name: "HashKey",
    chainId: 177,
    rpc: "https://mainnet.hsk.xyz",
    blockExplorer: "https://hashkey.blockscout.com",
    decimals: 18,
    symbol: "HSK",
    contractAddress: "0x0000000000000000000000000000000000000000" as Address,
  },
];

export const defaultNetwork = chains[0];

export const getNetworkByChainId = (chainId?: number): NetworkConfig | undefined =>
  chains.find((network) => network.chainId === chainId);
