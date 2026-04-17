import { useCallback, useEffect, useMemo, useState } from 'react';
import { getContract, prepareContractCall, waitForReceipt } from 'thirdweb';
import { useSendTransaction } from 'thirdweb/react';
import { createPublicClient, formatUnits, http, parseEther, parseUnits, type Abi, type Address } from 'viem';
import erc20Json from '../abi/ERC20.json';
import vaultJson from '../abi/Vault.json';
import { defaultNetwork, toThirdwebChain, type SupportedNetwork } from '../lib/networks';
import { thirdwebClient } from '../lib/thirdweb';
import type { CreateFundInput, TokenMetadata, VaultFund, VaultStatus } from '../types/vault';

const vaultAbi = vaultJson.abi as Abi;
const erc20Abi = erc20Json.abi as Abi;
const zeroAddress = '0x0000000000000000000000000000000000000000' as Address;

const formatVaultBalance = (amount: bigint, decimals: number) => {
  const formatted = formatUnits(amount, decimals);
  const [whole, fraction = ''] = formatted.split('.');
  const trimmed = fraction.slice(0, 4).replace(/0+$/, '');
  return trimmed ? `${whole}.${trimmed}` : whole;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Something went wrong while talking to the vault.';
};

const withContractAddress = (networkName: string, contractAddress?: Address) => {
  if (!contractAddress) {
    throw new Error(`No vault contract address configured for ${networkName}.`);
  }

  return contractAddress;
};

export function useVault(account?: Address, network: SupportedNetwork = defaultNetwork, walletChainId?: number) {
  const [funds, setFunds] = useState<VaultFund[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<VaultStatus>({ tone: 'idle', message: '' });
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();

  const contractAddress = network.contractAddress;
  const publicClient = useMemo(
    () =>
      createPublicClient({
        transport: http(network.rpc),
      }),
    [network.rpc],
  );

  const thirdwebChain = useMemo(() => toThirdwebChain(network), [network]);

  const contract = useMemo(() => {
    if (!contractAddress) {
      return null;
    }

    return getContract({
      client: thirdwebClient,
      chain: thirdwebChain,
      address: contractAddress,
    });
  }, [contractAddress, thirdwebChain]);

  const inspectToken = useCallback(
    async (tokenAddress: Address): Promise<TokenMetadata> => {
      const [symbolResult, decimalsResult] = await Promise.allSettled([
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'symbol',
        }),
        publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'decimals',
        }),
      ]);

      return {
        address: tokenAddress,
        symbol: symbolResult.status === 'fulfilled' ? String(symbolResult.value) : 'TOKEN',
        decimals: decimalsResult.status === 'fulfilled' ? Number(decimalsResult.value) : 18,
      };
    },
    [publicClient],
  );

  const refresh = useCallback(async () => {
    if (!account || !contractAddress) {
      setFunds([]);
      return;
    }

    setLoading(true);

    try {
      const totalFunds = Number(
        await publicClient.readContract({
          address: contractAddress,
          abi: vaultAbi,
          functionName: 'funds',
        }),
      );

      if (totalFunds === 0) {
        setFunds([]);
        return;
      }

      const ids = Array.from({ length: totalFunds }, (_, index) => BigInt(index + 1));
      const [marketResults, tokenResults] = await Promise.all([
        publicClient.multicall({
          contracts: ids.map((id) => ({
            address: contractAddress,
            abi: vaultAbi,
            functionName: 'allMarketData',
            args: [id],
          })),
          allowFailure: true,
        }),
        publicClient.multicall({
          contracts: ids.map((id) => ({
            address: contractAddress,
            abi: vaultAbi,
            functionName: 'paymentTokens',
            args: [id],
          })),
          allowFailure: true,
        }),
      ]);

      const relevant = ids
        .map((id, index) => {
          const marketResult = marketResults[index];
          const tokenResult = tokenResults[index];

          if (marketResult.status !== 'success') {
            return null;
          }

          const market = marketResult.result as readonly [Address, bigint, bigint, bigint, boolean, boolean];
          const creator = market[0];

          if (creator.toLowerCase() !== account.toLowerCase()) {
            return null;
          }

          const paymentToken =
            tokenResult.status === 'success' ? (tokenResult.result as Address) : zeroAddress;

          return {
            id,
            creator,
            marketBalance: market[1],
            startTime: market[2],
            endTime: market[3],
            feeType: market[4],
            closed: market[5],
            paymentToken,
          };
        })
        .filter((fund): fund is NonNullable<typeof fund> => Boolean(fund));

      const uniqueTokens = [...new Set(relevant.map((fund) => fund.paymentToken).filter((token) => token !== zeroAddress))];
      const tokenMetadataEntries = await Promise.all(
        uniqueTokens.map(async (tokenAddress) => [tokenAddress, await inspectToken(tokenAddress)] as const),
      );
      const tokenMetadata = new Map(tokenMetadataEntries);

      const hydratedFunds: VaultFund[] = relevant
        .map((fund) => {
          const metadata =
            fund.paymentToken === zeroAddress
              ? { address: zeroAddress, symbol: network.symbol, decimals: network.decimals }
              : tokenMetadata.get(fund.paymentToken) ?? { address: fund.paymentToken, symbol: 'TOKEN', decimals: 18 };

          return {
            ...fund,
            tokenSymbol: metadata.symbol,
            tokenDecimals: metadata.decimals,
            networkName: network.name,
            explorerUrl: `${network.blockExplorer}/address/${contractAddress}`,
            balanceLabel: formatVaultBalance(fund.marketBalance, metadata.decimals),
          };
        })
        .sort((left, right) => Number(right.id - left.id));

      setFunds(hydratedFunds);
      setStatus((current) => (current.tone === 'error' ? { tone: 'idle', message: '' } : current));
    } catch (error) {
      setStatus({
        tone: 'error',
        message: getErrorMessage(error),
      });
    } finally {
      setLoading(false);
    }
  }, [account, contractAddress, inspectToken, network.blockExplorer, network.decimals, network.name, network.symbol, publicClient]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [refresh]);

  const createFund = useCallback(
    async (input: CreateFundInput) => {
      if (!account) {
        setStatus({ tone: 'error', message: 'Connect your wallet before creating a fund.' });
        return false;
      }

      if (!contract) {
        setStatus({ tone: 'error', message: `No contract is configured for ${network.name}.` });
        return false;
      }

      if (walletChainId !== network.chainId) {
        setStatus({ tone: 'error', message: `Switch your wallet to ${network.name} before creating a fund.` });
        return false;
      }

      try {
        const amount = input.amount.trim();
        const daysLocked = BigInt(input.daysLocked);
        let parsedAmount = parseEther(amount);
        let tokenAddress = zeroAddress;

        if (input.feeType === 'token') {
          tokenAddress = input.paymentToken;
          const metadata = await inspectToken(input.paymentToken);
          parsedAmount = parseUnits(amount, metadata.decimals);

          setStatus({ tone: 'pending', message: `Approving ${metadata.symbol} for the vault...` });

          const approval = prepareContractCall({
            contract: getContract({
              client: thirdwebClient,
              chain: thirdwebChain,
              address: tokenAddress,
            }),
            method: 'function approve(address spender, uint256 amount) returns (bool)',
            params: [withContractAddress(network.name, contractAddress), parsedAmount],
          });

          const approvalResult = await sendTransaction(approval);

          await waitForReceipt({
            client: thirdwebClient,
            chain: thirdwebChain,
            transactionHash: approvalResult.transactionHash,
          });
        }

        setStatus({ tone: 'pending', message: 'Creating your new vault fund...' });

        const transaction = prepareContractCall({
          contract,
          method: 'function deposit(uint256 _marketBalance, bool _feeType, address _paymentToken, uint256 _days) payable',
          params: [parsedAmount, input.feeType === 'token', tokenAddress, daysLocked],
          value: input.feeType === 'token' ? 0n : parsedAmount,
        });

        const result = await sendTransaction(transaction);

        await waitForReceipt({
          client: thirdwebClient,
          chain: thirdwebChain,
          transactionHash: result.transactionHash,
        });

        setStatus({
          tone: 'success',
          message: `Fund created on ${network.name}.`,
        });
        await refresh();
        return true;
      } catch (error) {
        setStatus({ tone: 'error', message: getErrorMessage(error) });
        return false;
      }
    },
    [account, contract, contractAddress, inspectToken, network.chainId, network.name, refresh, sendTransaction, thirdwebChain, walletChainId],
  );

  const withdrawFund = useCallback(
    async (fund: VaultFund, amount: string) => {
      if (!account) {
        setStatus({ tone: 'error', message: 'Connect your wallet before withdrawing.' });
        return false;
      }

      if (!contract) {
        setStatus({ tone: 'error', message: `No contract is configured for ${network.name}.` });
        return false;
      }

      if (walletChainId !== network.chainId) {
        setStatus({ tone: 'error', message: `Switch your wallet to ${network.name} before withdrawing.` });
        return false;
      }

      try {
        setStatus({ tone: 'pending', message: `Withdrawing ${fund.tokenSymbol} from fund #${fund.id.toString()}...` });

        const transaction = prepareContractCall({
          contract,
          method: 'function withdraw(uint256 _fund, uint256 _amount) payable',
          params: [fund.id, parseUnits(amount, fund.tokenDecimals)],
        });

        const result = await sendTransaction(transaction);

        await waitForReceipt({
          client: thirdwebClient,
          chain: thirdwebChain,
          transactionHash: result.transactionHash,
        });

        setStatus({ tone: 'success', message: `Withdrawal complete for fund #${fund.id.toString()}.` });
        await refresh();
        return true;
      } catch (error) {
        setStatus({ tone: 'error', message: getErrorMessage(error) });
        return false;
      }
    },
    [account, contract, network.chainId, network.name, refresh, sendTransaction, thirdwebChain, walletChainId],
  );

  return {
    contractAddress,
    funds,
    inspectToken,
    isPending,
    loading,
    refresh,
    status,
    createFund,
    withdrawFund,
  };
}
