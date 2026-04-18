import { type Address } from "viem";

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpc: string;
  blockExplorer: string;
  decimals: number;
  symbol: string;
  contract_address: Address;
}

const sepolia: NetworkConfig = {
  name: 'Sepolia (Testnet)',
  chainId: 11155111,
  rpc: 'https://0xrpc.io/sep',
  blockExplorer: 'https://sepolia.etherscan.io',
  decimals: 18,
  symbol: 'sETH',
  contract_address: '0xB1383CABf4fFd42204Cc18Df5aF00066d5e71f6a' as Address,
};

const hashkey: NetworkConfig = {
  name: 'HashKey Chain (Live)',
  chainId: 177,
  rpc: 'https://mainnet.hsk.xyz',
  blockExplorer: 'https://hashkey.blockscout.com',
  decimals: 18,
  symbol: 'HSK',
  contract_address: '' as Address,
};



const chains: NetworkConfig[] = [sepolia, hashkey];

export { chains };