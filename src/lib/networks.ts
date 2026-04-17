import { defineChain } from 'thirdweb/chains';
import type { Address } from 'viem';

export interface NetworkPreset {
  key: string;
  name: string;
  chainId: number;
  rpc: string;
  blockExplorer: string;
  symbol: string;
  decimals: number;
}

export interface SupportedNetwork extends NetworkPreset {
  contractAddress?: Address;
}

const presets: NetworkPreset[] = [
  {
    key: 'sepolia',
    name: 'Sepolia',
    chainId: 11155111,
    rpc: 'https://0xrpc.io/sep',
    blockExplorer: 'https://sepolia.etherscan.io',
    symbol: 'ETH',
    decimals: 18,
  },
  {
    key: 'base',
    name: 'Base',
    chainId: 8453,
    rpc: 'https://gateway.tenderly.co/public/base',
    blockExplorer: 'https://basescan.org',
    symbol: 'ETH',
    decimals: 18,
  },
  {
    key: 'bnb',
    name: 'BNB Chain',
    chainId: 56,
    rpc: 'https://bsc-dataseed.binance.org',
    blockExplorer: 'https://bscscan.com',
    symbol: 'BNB',
    decimals: 18,
  },
  {
    key: 'hashkey',
    name: 'HashKey',
    chainId: 177,
    rpc: 'https://mainnet.hsk.xyz',
    blockExplorer: 'https://hashkey.blockscout.com',
    symbol: 'HSK',
    decimals: 18,
  },
  {
    key: 'monad',
    name: 'Monad',
    chainId: 143,
    rpc: 'https://rpc4.monad.xyz',
    blockExplorer: 'https://monadscan.com',
    symbol: 'MON',
    decimals: 18,
  },
  {
    key: 'litvm',
    name: 'LitVM',
    chainId: 4441,
    rpc: 'https://liteforge.rpc.caldera.xyz/http',
    blockExplorer: 'https://liteforge.explorer.caldera.xyz',
    symbol: 'zkLTC',
    decimals: 18,
  },
];

const isAddress = (value: string): value is Address => /^0x[a-fA-F0-9]{40}$/.test(value);

const parseEnvVaultAddresses = () => {
  const raw = import.meta.env.VITE_VAULT_ADDRESSES?.trim();
  const result: Partial<Record<number, Address>> = {};

  if (!raw) {
    return result;
  }

  if (raw.startsWith('{')) {
    try {
      const parsed = JSON.parse(raw) as Record<string, string>;
      for (const [chainId, address] of Object.entries(parsed)) {
        if (isAddress(address)) {
          result[Number(chainId)] = address;
        }
      }
    } catch {
      return result;
    }

    return result;
  }

  if (isAddress(raw)) {
    result[11155111] = raw;
  }

  return result;
};

const configuredAddresses = parseEnvVaultAddresses();

export const supportedNetworks: SupportedNetwork[] = presets.map((network) => ({
  ...network,
  contractAddress: configuredAddresses[network.chainId],
}));

export const configuredNetworks = supportedNetworks.filter(
  (network): network is SupportedNetwork & { contractAddress: Address } => Boolean(network.contractAddress),
);

export const defaultNetwork = configuredNetworks[0] ?? supportedNetworks[0];

export const getNetworkByChainId = (chainId?: number) =>
  supportedNetworks.find((network) => network.chainId === chainId);

export const toThirdwebChain = (network: SupportedNetwork) =>
  defineChain({
    id: network.chainId,
    rpc: network.rpc,
  });
