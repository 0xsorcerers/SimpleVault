import type { Address } from 'viem';

export type ThemeMode = 'light' | 'dark';

export interface MarketData {
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
}

export interface CountdownState {
  total: number;
  remaining: number;
  unlocked: boolean;
}
