import { createWallet, walletConnect, inAppWallet } from "thirdweb/wallets";
import { createThirdwebClient, getContract, prepareContractCall, waitForReceipt } from "thirdweb";
import { ConnectButton, darkTheme, useSendTransaction } from "thirdweb/react";
import { defineChain, sepolia } from "thirdweb/chains";
import { createPublicClient, http, formatEther, parseEther, type Address, type Abi } from "viem";
import { sepolia as viemSepolia } from "viem/chains";
import { ReactElement } from "react";
import vault from "../abi/vault.json";
import erc20 from "../abi/ERC20.json";
import { chains } from "./networkData";
import { getCurrentNetwork } from "../store/networkStore";

const contractABI = vault.abi as Abi;
const erc20ABI = erc20.abi as Abi;

// ============================================================================
// ERC20 Token Functions (for token-based voting)
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ============================================================================
// Types
// ============================================================================

export interface MarketData {
  creator: Address;
  status: boolean;
  marketBalance: bigint;
  startTime: bigint;
  endTime: bigint;
  feeType: boolean;
  closed: boolean;
}

export interface WriteMarketParams {
  marketBalance: bigint;
  feetype?: boolean;
  paymentToken?: Address;
  days?: number; // Unix timestamp in seconds, 0 for no timer
}

// ============================================================================
// Thirdweb wallet connect
// ============================================================================

export const client = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
});

export const wallets = [
  createWallet("com.binance.wallet"),
  createWallet("com.coinbase.wallet"),
  walletConnect(),
  inAppWallet({
    auth: {
      options: [
        "google",
        "x",
        "tiktok",
        "telegram",
        "facebook",
        "apple",
        "phone",
        "email",
        "discord",
      ],
      mode: "redirect",
    },
  }),
];

// ============================================================================
// Blockchain Configuration (Dynamic per selected network)
// ============================================================================

/**
 * Get the current blockchain config based on selected network
 * This is dynamic and updates when user switches networks
 */
export const getBlockchain = () => {
  const network = getCurrentNetwork();
  return {
    chainId: network.chainId,
    rpc: network.rpc,
    blockExplorer: network.blockExplorer,
    decimals: network.decimals,
    symbol: network.symbol,
    contract_address: network.contract_address,
  };
};

/**
 * Create a dynamic network definition for Thirdweb
 * Used in ConnectButton and contract interactions
 */
export const getThirdwebNetwork = () => {
  const blockchain = getBlockchain();
  return defineChain({ id: blockchain.chainId, rpc: blockchain.rpc });
};

/**
 * Create a dynamic viem public client for the selected network
 * Used for read-only contract calls
 */
export const getPublicClient = (network?: typeof getCurrentNetwork extends () => infer T ? T : never) => {
  const blockchain = network || getBlockchain();
  return createPublicClient({
    transport: http(blockchain.rpc),
  });
};

/**
 * Get the Vault contract for the selected network
 */
export const getVaultContract = () => {
  const blockchain = getBlockchain();
  return getContract({
    client,
    chain: getThirdwebNetwork(),
    address: blockchain.contract_address,
  });
};

// Legacy constants for backward compatibility - but they now use getters
export const blockchain = getBlockchain();
export const network = getThirdwebNetwork();
export const publicClient = getPublicClient();
export const vaultContract = getVaultContract();

// ============================================================================
// Connector Component
// ============================================================================

export function Connector(): ReactElement {
  return (
    <ConnectButton
      client={client}
      chain={getThirdwebNetwork()}
      wallets={wallets}
      theme={darkTheme({
        colors: {
          primaryText: "#7FFF00",
          secondaryText: "#FFF8DC",
          connectedButtonBg: "#252525",
          connectedButtonBgHover: "#161616",
          separatorLine: "#262830",
          primaryButtonBg: "#7FFF00",
        },
      })}
      connectButton={{ label: "Get Started" }}
      connectModal={{
        size: "wide",
        title: "Sign In",
        titleIcon: "/logo-white-no-bkg.webp",
        welcomeScreen: {
          title: "Simple Vault",
          subtitle: "if it's important enough.",
          img: {
            src: '/logo-white-no-bkg.webp',
            width: 200,
            height: 200,
          },
        },
      }}
    />
  );
}

// ============================================================================
// Read Calls (using viem)
// ============================================================================

export const readMarketData = async (ids: number[]): Promise<MarketDataFormatted[]> => {
  if (ids.length === 0) return [];

  const limitedIds = ids.slice(0, MUTABLE_MARKET_FETCH_LIMIT);
  const result = await getPublicClient().readContract({
    address: getBlockchain().contract_address,
    abi: contractABI,
    functionName: 'readMarketData',
    args: [limitedIds],
  });

  const marketDataArray = result as MarketData[];

  return marketDataArray.map((marketData) => ({
    indexer: 0, // Will be filled from context
    creator: marketData.creator,
    marketBalance: marketData.marketBalance, // Keep as bigint - let display layer handle formatting
    feeType: marketData.feeType,
    startTime: Number(marketData.startTime),
    endTime: Number(marketData.endTime),
    closed: marketData.closed,
  }));
};

export const readFundCount = async (): Promise<number> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contract_address,
    abi: contractABI,
    functionName: 'funds',
  }) as number;

  return Number(result);
};

// ============================================================================
// Write Calls (using thirdweb)
// ============================================================================

export const prepareWriteMarket = (params: WriteMarketParams) => {
  const feeType = params.feetype || false;
  const days = BigInt(params.days || 0); // Unix timestamp, 0 for no timer

  // Determine the correct payment token address
  // Use the provided paymentToken, which should be set correctly by the caller
  const paymentTokenAddress: Address = params.paymentToken || ("0x0000000000000000000000000000000000000000" as Address);

  return prepareContractCall({
    contract: getVaultContract(),
    method: "function writeMarket(string[] calldata _info, uint256 _marketBalance, bool _signal, bool _feetype, address _paymentToken, uint256 _endTime) external payable",
    params: [
      params.marketBalance,
      feeType, // _feeType - true for token payment, false for ETH payment
      paymentTokenAddress,
      days, // multiplier for lock duration in days
    ],
  });
};

// Hook helper for write transactions
export const useWriteMarket = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const writeMarket = async (params: WriteMarketParams) => {

    const transaction = {
      ...prepareWriteMarket(params),
      value: params.feetype ? 0 : params.marketBalance, // Use feetype for msg.value calculation
    };
    const result = await sendTx(transaction);

    // Wait for transaction to be mined/confirmed before returning
    // This ensures the new market is written to the blockchain before we fetch updated data
    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    return result;
  };

  return { writeMarket, isPending, error };
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse comma-delimited tags string from blockchain into array
 * Tags are stored on-chain as "tag1,tag2,tag3" and need to be split
 */
export const parseTags = (tagsString: string): string[] => {
  if (!tagsString || tagsString.trim() === '') return [];
  return tagsString.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
};

/**
 * Serialize tags array to comma-delimited string for blockchain storage
 * Max 7 tags allowed
 */
export const serializeTags = (tags: string[]): string => {
  return tags.slice(0, 7).join(',');
};

/**
 * Convert any ETH amount (string or number) to wei (bigint)
 * Handles both decimal and whole numbers
 * @param amount - ETH amount as string or number (e.g., "0.01", 1, "1.5")
 * @returns bigint in wei
 */
export const toWei = (amount: string | number): bigint => {
  return parseEther(String(amount));
};

/**
 * Convert a token amount to its smallest unit (bigint) based on token decimals
 * @param amount - Token amount as string or number (e.g., "0.01", 1, "1.5")
 * @param decimals - Number of decimals the token uses (e.g., 6 for USDC, 18 for WETH)
 * @returns bigint in the token's smallest unit
 */
export const toTokenSmallestUnit = (amount: string | number, decimals: number): bigint => {
  const amountStr = String(amount);
  
  // For common decimal values, use optimized approach
  if (decimals === 18) {
    return parseEther(amountStr);
  }
  
  // For other decimal values, use viem's formatUnits/parseUnits logic
  // Convert to string with proper decimal places
  const parts = amountStr.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';
  
  // Pad or truncate fractional part to match decimals
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.slice(0, decimals);
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, '0');
  }
  
  // Combine and convert to bigint
  const combined = integerPart + fractionalPart;
  return BigInt(combined);
};

/**
 * Convert a token amount from its smallest unit to a readable string based on token decimals
 * @param amount - Amount in the token's smallest unit (bigint)
 * @param decimals - Number of decimals the token uses (e.g., 6 for USDC, 18 for WETH)
 * @returns Formatted string with appropriate decimal places
 */
export const fromTokenSmallestUnit = (amount: bigint, decimals: number): string => {
  // For common decimal values, use optimized approach
  if (decimals === 18) {
    return formatEther(amount);
  }
  
  // For other decimal values, use manual formatting
  const amountStr = amount.toString();
  
  // Pad with leading zeros to ensure we can place decimal point
  const padded = amountStr.padStart(decimals + 1, '0');
  
  // Split into integer and fractional parts
  const integerPart = padded.slice(0, -decimals) || '0';
  const fractionalPart = padded.slice(-decimals);
  
  // Remove trailing zeros from fractional part
  const trimmedFractional = fractionalPart.replace(/0+$/, '');
  
  // Combine parts
  if (trimmedFractional) {
    return `${integerPart}.${trimmedFractional}`;
  }
  return integerPart;
};

/**
 * Format a token amount for display with proper decimal handling
 * @param amount - Amount in the token's smallest unit (bigint)
 * @param decimals - Number of decimals the token uses
 * @param maxDisplayDecimals - Maximum decimals to show (optional, defaults to token decimals)
 * @returns Formatted display string
 */
export const formatTokenAmount = (
  amount: bigint, 
  decimals: number, 
  maxDisplayDecimals?: number
): string => {
  const fullAmount = fromTokenSmallestUnit(amount, decimals);
  const maxDecimals = maxDisplayDecimals !== undefined ? maxDisplayDecimals : decimals;
  
  if (maxDecimals === 0) {
    return fullAmount.split('.')[0];
  }
  
  const parts = fullAmount.split('.');
  if (parts.length === 1) {
    return parts[0];
  }
  
  const integerPart = parts[0];
  const fractionalPart = parts[1].slice(0, maxDecimals);
  
  if (fractionalPart) {
    return `${integerPart}.${fractionalPart}`;
  }
  return integerPart;
};

export const randomShuffle = (max: number): number => {
  return Math.floor(Math.random() * max);
};

export function fisherYatesShuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export const copyClipboard = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

export const truncateAddress = (address: string | null | undefined): string => {
  if (!address) return "No Account";
  const match = address.match(
    /^(0x[a-zA-Z0-9]{4})[a-zA-Z0-9]+([a-zA-Z0-9]{4})$/
  );
  if (!match) return address;
  return `${match[1]} ... ${match[2]}`;
};

export const formatNumber = (number: number | null | undefined): string => {
  if (!number) return "0";
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
  return formatter.format(number);
};

export const removeThousands = (value: string): string => {
  const cleanedValue = value.replace(/,/g, '');
  const integerPart = cleanedValue.split('.')[0];
  return integerPart;
};

export function normalizeNumberString(n: string | number): string {
  return Number(n).toLocaleString('en-US', {
    minimumFractionDigits: 18,
    useGrouping: false
  });
}

/**
 * Check if a token address is the zero address (indicating ETH payment)
 */
export const isZeroAddress = (address: Address): boolean => {
  return address === ZERO_ADDRESS;
};

/**
 * Read the current allowance for a spender on a token
 */
export const readTokenAllowance = async (
  tokenAddress: Address,
  ownerAddress: Address,
  spenderAddress: Address
): Promise<bigint> => {
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "allowance",
    args: [ownerAddress, spenderAddress],
  });

  return result as bigint;
};

/**
 * Read the token balance for an address
 */
export const readTokenBalance = async (
  tokenAddress: Address,
  ownerAddress: Address
): Promise<bigint> => {
  const result = await getPublicClient().readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: "balanceOf",
    args: [ownerAddress],
  });
  return result as bigint;
};

/**
 * Read the token decimals
 */
export const readTokenDecimals = async (tokenAddress: Address): Promise<number> => {
  try {
    const result = await getPublicClient().readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "decimals",
    });
    return Number(result);
  } catch (err) {
    console.error('Error reading token decimals:', err);
    return 18; // Default to 18 decimals if unable to read
  }
};

/**
 * Read the token symbol
 */
export const readTokenSymbol = async (tokenAddress: Address): Promise<string> => {
  try {
    const result = await getPublicClient().readContract({
      address: tokenAddress,
      abi: erc20ABI,
      functionName: "symbol",
    });
    return result as string;
  } catch (err) {
    console.error('Error reading token symbol:', err);
    return 'TOKEN';
  }
};

/**
 * Prepare an ERC20 approve transaction
 */
export const prepareTokenApprove = (tokenAddress: Address, amount: bigint) => {
  const tokenContract = getContract({
    client,
    chain: getThirdwebNetwork(),
    address: tokenAddress,
  });

  return prepareContractCall({
    contract: tokenContract,
    method: "function approve(address spender, uint256 amount) external returns (bool)",
    params: [getBlockchain().contract_address, amount],
  });
};

/**
 * Hook for approving token spending
 */
export const useTokenApprove = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const approve = async (tokenAddress: Address, amount: bigint) => {
    const transaction = prepareTokenApprove(tokenAddress, amount);
    const result = await sendTx(transaction);

    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    return result;
  };

  return { approve, isPending, error };
};

// ============================================================================
// User Profile Functions (for My Thots, Your Thots, History pages)
// ============================================================================

/**
 * Get user's created thots (markets they created)
 * Returns array of market IDs
 */
export const getUserThots = async (userAddress: Address, start: number, finish: number): Promise<number[]> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contract_address,
    abi: contractABI,
    functionName: 'getUserThots',
    args: [userAddress, BigInt(start), BigInt(finish)],
  });

  return (result as bigint[]).map((id) => Number(id));
};

/**
 * Get user's voted markets (markets they participated in)
 * Returns array of market IDs
 */
export const getUserMarkets = async (userAddress: Address, start: number, finish: number): Promise<number[]> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contract_address,
    abi: contractABI,
    functionName: 'getUserMarkets',
    args: [userAddress, BigInt(start), BigInt(finish)],
  });

  return (result as bigint[]).map((id) => Number(id));
};

/**
 * ClaimRecord structure from the contract
 */
export interface ClaimRecord {
  marketId: number;
  token: Address;
  amount: string;
  timestamp: number;
  positionId: number;
}

/**
 * Get the total count of user's claim history
 */
export const getUserTotalClaimHistory = async (userAddress: Address): Promise<number> => {
  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'userTotalClaimHistory',
      args: [userAddress],
    });
    return Number(result);
  } catch {
    return 0;
  }
};

/**
 * Get user's claims in a paginated way using getUserClaims(address, start, finish)
 * Returns array of ClaimRecord for the specified range
 */
export const getUserClaims = async (
  userAddress: Address,
  start: number,
  finish: number
): Promise<ClaimRecord[]> => {
  if (start >= finish) return [];

  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'getUserClaims',
      args: [userAddress, BigInt(start), BigInt(finish)],
    });

    const rawClaims = result as Array<{
      marketId: bigint;
      token: Address;
      amount: bigint;
      timestamp: bigint;
      positionId: bigint;
    }>;

    return rawClaims
      .map((claim) => ({
        marketId: Number(claim.marketId),
        token: claim.token,
        amount: claim.amount.toString(),
        timestamp: Number(claim.timestamp),
        positionId: Number(claim.positionId),
      }))
      .filter((claim) => claim.timestamp > 0); // Filter out empty records
  } catch (err) {
    console.error('Error fetching user claims:', err);
    return [];
  }
};

/**
 * Get user's claim history (convenience function that fetches all claims)
 * Returns array of ClaimRecord in reverse order (newest first)
 */
export const getUserClaimHistory = async (userAddress: Address): Promise<ClaimRecord[]> => {
  const total = await getUserTotalClaimHistory(userAddress);
  if (total === 0) return [];

  // Fetch all claims in one batch call
  const claims = await getUserClaims(userAddress, 0, total);

  // Return in reverse order (newest first)
  return claims.reverse();
};

/**
 * Get the count of user's thots (created markets)
 */
export const getUserTotalThots = async (userAddress: Address): Promise<number> => {
  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'userTotalThots',
      args: [userAddress],
    });
    return Number(result);
  } catch {
    return 0;
  }
};

/**
 * Get the count of user's voted markets
 */
export const getUserTotalMarkets = async (userAddress: Address): Promise<number> => {
  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'userTotalMarkets',
      args: [userAddress],
    });
    return Number(result);
  } catch {
    return 0;
  }
};

/**
 * Check which positions are claimable for a user in a market
 * Returns array of position IDs that have winning positions (can be claimed)
 * If returned array is empty, user has no claimable positions in that market
 */
export const getClaimablePositions = async (marketId: number, userAddress: Address, positionIds: number[]): Promise<number[]> => {
  if (positionIds.length === 0) return [];

  try {
    console.log(`[getClaimablePositions] Market ${marketId}, User ${userAddress}, Checking positions:`, positionIds);
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'isClaimable',
      args: [userAddress, BigInt(marketId), positionIds.map(id => BigInt(id))],
    });
    const claimable = (result as bigint[]).map(id => Number(id));
    console.log(`[getClaimablePositions] Market ${marketId}, User ${userAddress}, Claimable positions:`, claimable);
    return claimable;
  } catch (err) {
    console.error('Error checking claimable positions:', err);
    return [];
  }
};

// ============================================================================
// User Position Functions (for claiming)
// ============================================================================

const POSITION_FETCH_LIMIT = 200;

/**
 * Get the count of user's positions in a specific market
 */
export const getUserPositionCount = async (marketId: number, userAddress: Address): Promise<number> => {
  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'userPositionCount',
      args: [BigInt(marketId), userAddress],
    });
    return Number(result);
  } catch (err) {
    console.error('Error fetching user position count:', err);
    return 0;
  }
};

/**
 * Get the total number of user positions for a market.
 * Alias used by trade/kamikaze UI flows.
 */
export const totalUserMarket = async (marketId: number, userAddress: Address): Promise<number> => {
  return getUserPositionCount(marketId, userAddress);
};

/**
 * Get user's positions in a market for a given range
 * Returns array of position IDs
 */
export const getUserPositionsInRange = async (
  marketId: number,
  userAddress: Address,
  start: number,
  finish: number
): Promise<number[]> => {
  if (start >= finish) return [];

  try {
    const result = await getPublicClient().readContract({
      address: getBlockchain().contract_address,
      abi: contractABI,
      functionName: 'getUserPositions',
      args: [BigInt(marketId), userAddress, BigInt(start), BigInt(finish)],
    });

    const positions = (result as bigint[]).map((id) => Number(id));
    console.log(`[getUserPositionsInRange] Market ${marketId}, User ${userAddress}, Range ${start}-${finish}:`, positions);
    return positions;
  } catch (err) {
    console.error('Error fetching user positions:', err);
    return [];
  }
};

/**
 * Alias for getUserPositionsInRange used by trade/kamikaze UI flows.
 */
export const getUserPositions = async (
  marketId: number,
  userAddress: Address,
  start: number,
  finish: number
): Promise<number[]> => {
  return getUserPositionsInRange(marketId, userAddress, start, finish);
};

export interface PositionDetails {
  positionId: number;
  user: Address;
  side: Side;
  amount: bigint;
  timestamp: number;
  claimed: boolean;
  kamikazed: boolean;
}

/**
 * Read position details in a single multicall batch to reduce RPC pressure.
 */
export const getPositionDetailsBatch = async (
  marketId: number,
  positionIds: number[]
): Promise<PositionDetails[]> => {
  if (positionIds.length === 0) return [];

  const allDetails: PositionDetails[] = [];
  const callsRequired = Math.ceil(positionIds.length / POSITION_FETCH_LIMIT);

  for (let i = 0; i < callsRequired; i++) {
    const start = i * POSITION_FETCH_LIMIT;
    const finish = Math.min(start + POSITION_FETCH_LIMIT, positionIds.length);
    const chunk = positionIds.slice(start, finish);

    const results = await Promise.allSettled(
      chunk.map((positionId) =>
        getPublicClient().readContract({
          address: getBlockchain().contract_address,
          abi: contractABI,
          functionName: "positions",
          args: [BigInt(marketId), BigInt(positionId)],
        })
      )
    );

    results.forEach((result, idx) => {
      if (result.status !== "fulfilled") return;
      const value = result.value as [Address, number, bigint, bigint, boolean, boolean];
      allDetails.push({
        positionId: chunk[idx],
        user: value[0],
        side: value[1] as Side,
        amount: value[2],
        timestamp: Number(value[3]),
        claimed: value[4],
        kamikazed: value[5],
      });
    });
  }

  return allDetails;
};

/**
 * Delay utility for rate-limiting blockchain calls
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get all user positions in a market with pagination
 * Uses 200 position limit per call with 3 second delay between calls for large datasets
 */
export const getAllUserPositions = async (
  marketId: number,
  userAddress: Address
): Promise<number[]> => {
  const positionCount = await getUserPositionCount(marketId, userAddress);
  console.log(`[getAllUserPositions] Market ${marketId}, User ${userAddress}, Total position count:`, positionCount);

  if (positionCount === 0) return [];

  const allPositions: number[] = [];
  const callsRequired = Math.ceil(positionCount / POSITION_FETCH_LIMIT);

  for (let i = 0; i < callsRequired; i++) {
    const start = i * POSITION_FETCH_LIMIT;
    const finish = Math.min(start + POSITION_FETCH_LIMIT, positionCount);

    const positions = await getUserPositionsInRange(marketId, userAddress, start, finish);
    allPositions.push(...positions);

    // Add 3 second delay between calls if there are more calls to make
    if (i < callsRequired - 1) {
      await delay(3000);
    }
  }

  console.log(`[getAllUserPositions] Market ${marketId}, User ${userAddress}, All collected positions:`, allPositions);
  return allPositions;
};

// ============================================================================
// Batch Claim Functions
// ============================================================================

export interface BatchClaimParams {
  marketId: number;
  positionIds: number[];
}

export const prepareBatchClaim = (params: BatchClaimParams) => {
  return prepareContractCall({
    contract: getVaultContract(),
    method: "function batchClaim(uint256 _market, uint256[] calldata _posIds) external",
    params: [BigInt(params.marketId), params.positionIds.map(id => BigInt(id))],
  });
};

export const useBatchClaim = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const batchClaim = async (params: BatchClaimParams) => {
    const transaction = prepareBatchClaim(params);
    const result = await sendTx(transaction);

    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    return result;
  };

  return { batchClaim, isPending, error };
};

// ============================================================================
// Batch Kamikaze Functions
// ============================================================================

export interface BatchKamikazeParams {
  marketId: number;
  positionIds: number[];
}

export const prepareBatchKamikaze = (params: BatchKamikazeParams) => {
  return prepareContractCall({
    contract: getVaultContract(),
    method: "function batchKamikaze(uint256 _market, uint256[] calldata _posIds) external",
    params: [BigInt(params.marketId), params.positionIds.map(id => BigInt(id))],
  });
};

export const useBatchKamikaze = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const batchKamikaze = async (params: BatchKamikazeParams) => {
    const transaction = prepareBatchKamikaze(params);
    const result = await sendTx(transaction);

    await waitForReceipt({
      client,
      chain: getThirdwebNetwork(),
      transactionHash: result.transactionHash,
    });

    return result;
  };

  return { batchKamikaze, isPending, error };
};

// ============================================================================
// Market Lock Functions (for checking if shares are finalized)
// ============================================================================

export interface MarketLock {
  finalizedUpTo: number;
  sharesFinalized: boolean;
}

/**
 * Get the market lock info for a specific market
 * Returns the finalization status including whether shares are finalized
 */
export const readMarketLock = async (marketId: number): Promise<MarketLock> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contract_address,
    abi: contractABI,
    functionName: 'allMarketLocks',
    args: [BigInt(marketId)],
  }) as [bigint, boolean];

  return {
    finalizedUpTo: Number(result[0]),
    sharesFinalized: result[1],
  };
};

// Re-export useful viem utilities
export { formatEther, parseEther, ZERO_ADDRESS };
