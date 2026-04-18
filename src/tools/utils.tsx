import type { ReactElement } from "react";
import {
  createThirdwebClient,
  defineChain,
  getContract,
  prepareContractCall,
  waitForReceipt,
} from "thirdweb";
import { ConnectButton, darkTheme, useSendTransaction } from "thirdweb/react";
import { createWallet, inAppWallet, walletConnect } from "thirdweb/wallets";
import { createPublicClient, formatEther, http, parseEther, type Abi, type Address } from "viem";
import erc20AbiJson from "../abi/ERC20.json";
import vaultAbiJson from "../abi/Vault.json";
import { getCurrentNetwork } from "../store/networkStore";

const vaultAbi = vaultAbiJson.abi as Abi;
const erc20Abi = erc20AbiJson.abi as Abi;

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

export interface MarketData {
  creator: Address;
  marketBalance: bigint;
  startTime: bigint;
  endTime: bigint;
  feeType: boolean;
  closed: boolean;
}

export interface VaultFund extends MarketData {
  id: number;
  paymentToken: Address;
}

export interface DepositParams {
  marketBalance: bigint;
  feeType: boolean;
  paymentToken: Address;
  days: number;
}

export const client = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID,
});

export const wallets = [
  createWallet("com.coinbase.wallet"),
  createWallet("io.metamask"),
  walletConnect(),
  inAppWallet({
    auth: {
      options: ["google", "email", "apple"],
      mode: "popup",
    },
  }),
];

export const getBlockchain = () => {
  const network = getCurrentNetwork();
  return {
    ...network,
    contractAddress: network.contractAddress,
  };
};

export const getThirdwebNetwork = () => {
  const network = getBlockchain();
  return defineChain({ id: network.chainId, rpc: network.rpc });
};

export const getPublicClient = () => {
  const network = getBlockchain();
  return createPublicClient({
    transport: http(network.rpc),
  });
};

export const getVaultContract = () => {
  const network = getBlockchain();
  return getContract({
    client,
    chain: getThirdwebNetwork(),
    address: network.contractAddress,
    abi: vaultAbi,
  });
};

export function Connector(): ReactElement {
  return (
    <ConnectButton
      client={client}
      wallets={wallets}
      chain={getThirdwebNetwork()}
      connectButton={{ label: "Get Started" }}
      theme={darkTheme({
        colors: {
          primaryButtonBg: "#0052ff",
          primaryButtonText: "#ffffff",
          connectedButtonBg: "#f7f9fc",
          connectedButtonBgHover: "#eef3ff",
          secondaryButtonBg: "#0b1220",
          secondaryButtonText: "#f2f7ff",
          modalBg: "#0f172a",
          separatorLine: "#1f2937",
        },
      })}
      connectModal={{
        size: "wide",
        title: "SimpleVault",
        welcomeScreen: {
          title: "Welcome to your Vault",
          subtitle: "Secure, track and release funds with precision.",
        },
      }}
    />
  );
}

export const readFundCount = async (): Promise<number> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contractAddress,
    abi: vaultAbi,
    functionName: "funds",
  });
  return Number(result);
};

export const readMarketData = async (ids: number[]): Promise<MarketData[]> => {
  if (!ids.length) return [];
  const result = await getPublicClient().readContract({
    address: getBlockchain().contractAddress,
    abi: vaultAbi,
    functionName: "readMarketData",
    args: [ids.map((id) => BigInt(id))],
  });
  return result as MarketData[];
};

export const readPaymentToken = async (id: number): Promise<Address> => {
  const result = await getPublicClient().readContract({
    address: getBlockchain().contractAddress,
    abi: vaultAbi,
    functionName: "paymentTokens",
    args: [BigInt(id)],
  });
  return result as Address;
};

export const readTokenDecimals = async (token: Address): Promise<number> => {
  if (token === ZERO_ADDRESS) return 18;
  const result = await getPublicClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
  return Number(result);
};

export const readTokenSymbol = async (token: Address): Promise<string> => {
  if (token === ZERO_ADDRESS) return getBlockchain().symbol;
  const result = await getPublicClient().readContract({
    address: token,
    abi: erc20Abi,
    functionName: "symbol",
  });
  return result as string;
};

export const toWei = (amount: string) => parseEther(amount || "0");

export const toTokenSmallestUnit = (amount: string, decimals: number): bigint => {
  const [intPart, decimalPart = ""] = amount.split(".");
  const normalized = `${intPart || "0"}${decimalPart.padEnd(decimals, "0").slice(0, decimals)}`;
  return BigInt(normalized || "0");
};

export const formatTokenAmount = (amount: bigint, decimals: number) => {
  if (decimals === 18) return formatEther(amount);
  const amountStr = amount.toString().padStart(decimals + 1, "0");
  const whole = amountStr.slice(0, -decimals);
  const fractional = amountStr.slice(-decimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
};

export const prepareDeposit = (params: DepositParams) =>
  prepareContractCall({
    contract: getVaultContract(),
    method: "function deposit(uint256 _marketBalance, bool _feeType, address _paymentToken, uint256 _days) external payable",
    params: [params.marketBalance, params.feeType, params.paymentToken, BigInt(params.days)],
  });

export const prepareWithdraw = (fundId: number, amount: bigint) =>
  prepareContractCall({
    contract: getVaultContract(),
    method: "function withdraw(uint256 _fund, uint256 _amount) external",
    params: [BigInt(fundId), amount],
  });

export const prepareTokenApprove = (tokenAddress: Address, amount: bigint) => {
  const tokenContract = getContract({
    client,
    chain: getThirdwebNetwork(),
    address: tokenAddress,
    abi: erc20Abi,
  });

  return prepareContractCall({
    contract: tokenContract,
    method: "function approve(address spender, uint256 amount) external returns (bool)",
    params: [getBlockchain().contractAddress, amount],
  });
};

export const useVaultTransactions = () => {
  const { mutateAsync: sendTx, isPending, error } = useSendTransaction();

  const approveToken = async (tokenAddress: Address, amount: bigint) => {
    const tx = prepareTokenApprove(tokenAddress, amount);
    const res = await sendTx(tx);
    await waitForReceipt({ client, chain: getThirdwebNetwork(), transactionHash: res.transactionHash });
    return res;
  };

  const deposit = async (params: DepositParams) => {
    const tx = prepareDeposit(params);
    const res = await sendTx({ ...tx, value: params.feeType ? 0n : params.marketBalance });
    await waitForReceipt({ client, chain: getThirdwebNetwork(), transactionHash: res.transactionHash });
    return res;
  };

  const withdraw = async (fundId: number, amount: bigint) => {
    const tx = prepareWithdraw(fundId, amount);
    const res = await sendTx(tx);
    await waitForReceipt({ client, chain: getThirdwebNetwork(), transactionHash: res.transactionHash });
    return res;
  };

  return { approveToken, deposit, withdraw, isPending, error };
};
