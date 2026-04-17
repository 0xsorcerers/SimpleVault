import { baseSepolia, polygonAmoy, sepolia } from 'thirdweb/chains';
import type { Address } from 'viem';

export const supportedChains = [sepolia, baseSepolia, polygonAmoy] as const;

const fallback: Partial<Record<number, Address>> = {
  [sepolia.id]: '0x0000000000000000000000000000000000000000',
};

export const getVaultAddress = (chainId?: number): Address | undefined => {
  if (!chainId) return undefined;
  const envMap = import.meta.env.VITE_VAULT_ADDRESSES;
  if (envMap) {
    try {
      const parsed = JSON.parse(envMap) as Record<string, Address>;
      return parsed[String(chainId)];
    } catch {
      // ignore malformed env and fallback
    }
  }

  return fallback[chainId];
};

export const tokenAbi = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;
