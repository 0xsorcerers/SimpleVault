import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  http,
  isAddress,
  parseEther,
  parseUnits,
  type Address,
} from 'viem';
import { sepolia } from 'viem/chains';
import { vaultAbi } from '../abi/vaultAbi';
import { getVaultAddress, tokenAbi } from '../lib/networks';
import type { MarketData } from '../types/vault';

type EthereumProvider = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

const ZERO = '0x0000000000000000000000000000000000000000';

export const useVault = (account?: Address, chainId?: number) => {
  const [funds, setFunds] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(false);
  const [txState, setTxState] = useState<string>('');

  const vaultAddress = useMemo(() => getVaultAddress(chainId), [chainId]);

  const publicClient = useMemo(() => createPublicClient({ chain: sepolia, transport: http() }), []);

  const refresh = useCallback(async () => {
    if (!account || !vaultAddress || vaultAddress === ZERO) {
      setFunds([]);
      return;
    }

    setLoading(true);
    try {
      const totalFunds = (await publicClient.readContract({
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'funds',
      })) as bigint;

      if (totalFunds === 0n) {
        setFunds([]);
        return;
      }

      const collected: MarketData[] = [];
      for (let i = 1n; i <= totalFunds; i++) {
        const row = (await publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'allMarketData',
          args: [i],
        })) as readonly [Address, bigint, bigint, bigint, boolean, boolean];

        if (row[0].toLowerCase() !== account.toLowerCase()) continue;

        const paymentToken = (await publicClient.readContract({
          address: vaultAddress,
          abi: vaultAbi,
          functionName: 'paymentTokens',
          args: [i],
        })) as Address;

        let tokenSymbol = 'ETH';
        let tokenDecimals = 18;

        if (paymentToken !== ZERO) {
          try {
            tokenSymbol = (await publicClient.readContract({
              address: paymentToken,
              abi: tokenAbi,
              functionName: 'symbol',
            })) as string;
            tokenDecimals = Number(
              await publicClient.readContract({
                address: paymentToken,
                abi: tokenAbi,
                functionName: 'decimals',
              }),
            );
          } catch {
            tokenSymbol = 'ERC20';
            tokenDecimals = 18;
          }
        }

        collected.push({
          id: i,
          creator: row[0],
          marketBalance: row[1],
          startTime: row[2],
          endTime: row[3],
          feeType: row[4],
          closed: row[5],
          paymentToken,
          tokenSymbol,
          tokenDecimals,
        });
      }

      setFunds(collected.sort((a, b) => Number(b.id - a.id)));
    } finally {
      setLoading(false);
    }
  }, [account, publicClient, vaultAddress]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);

    return () => clearTimeout(timer);
  }, [refresh]);

  const getWalletClient = useCallback(async () => {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) throw new Error('Wallet not found. Install Coinbase Wallet/MetaMask.');

    await ethereum.request({ method: 'eth_requestAccounts' });
    return createWalletClient({ chain: sepolia, transport: custom(ethereum) });
  }, []);

  const createFund = useCallback(
    async (amount: string, days: number, isToken: boolean, tokenAddress?: Address) => {
      if (!vaultAddress || !account) throw new Error('Connect wallet first.');
      const walletClient = await getWalletClient();
      const parsed = isToken ? parseUnits(amount, 18) : parseEther(amount);

      setTxState('Preparing transaction...');

      if (isToken && tokenAddress && isAddress(tokenAddress)) {
        const approveHash = await walletClient.writeContract({
          account,
          address: tokenAddress,
          abi: tokenAbi,
          functionName: 'approve',
          args: [vaultAddress, parsed],
        });
        setTxState(`Approval sent: ${approveHash.slice(0, 10)}...`);
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const hash = await walletClient.writeContract({
        account,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'deposit',
        args: [parsed, isToken, tokenAddress && isAddress(tokenAddress) ? tokenAddress : ZERO, BigInt(days)],
        value: isToken ? 0n : parsed,
      });

      setTxState(`Deposit tx sent: ${hash.slice(0, 10)}...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxState('Fund created successfully.');
      await refresh();
    },
    [account, getWalletClient, publicClient, refresh, vaultAddress],
  );

  const withdraw = useCallback(
    async (fundId: bigint, amount: string, decimals: number) => {
      if (!vaultAddress || !account) throw new Error('Connect wallet first.');
      const walletClient = await getWalletClient();
      const parsed = parseUnits(amount, decimals);
      const hash = await walletClient.writeContract({
        account,
        address: vaultAddress,
        abi: vaultAbi,
        functionName: 'withdraw',
        args: [fundId, parsed],
      });
      setTxState(`Withdraw tx sent: ${hash.slice(0, 10)}...`);
      await publicClient.waitForTransactionReceipt({ hash });
      setTxState('Withdrawal completed.');
      await refresh();
    },
    [account, getWalletClient, publicClient, refresh, vaultAddress],
  );

  const formatBalance = (fund: MarketData) => formatUnits(fund.marketBalance, fund.tokenDecimals);

  return { funds, loading, txState, setTxState, createFund, withdraw, refresh, vaultAddress, formatBalance, chainId };
};
