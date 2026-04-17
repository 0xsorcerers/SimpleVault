import type { Address } from 'viem';

export type ThemeMode = 'light' | 'dark';
export type AppView = 'overview' | 'create' | 'withdraw';
export type StatusTone = 'idle' | 'pending' | 'success' | 'error';

export interface TokenMetadata {
  address: Address;
  symbol: string;
  decimals: number;
}

export interface VaultFund {
  id: bigint;
  creator: Address;
  marketBalance: bigint;
  startTime: bigint;
  endTime: bigint;
  feeType: boolean;
  closed: boolean;
  paymentToken: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  networkName: string;
  explorerUrl: string;
  balanceLabel: string;
}

export interface VaultStatus {
  tone: StatusTone;
  message: string;
}

export interface CreateFundInput {
  amount: string;
  daysLocked: number;
  feeType: 'native' | 'token';
  paymentToken: Address;
}
