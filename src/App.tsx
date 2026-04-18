import { useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import type { Address } from "viem";
import { useActiveAccount } from "thirdweb/react";
import { chains } from "./tools/networkData";
import { useNetworkStore } from "./store/networkStore";
import {
  Connector,
  ZERO_ADDRESS,
  formatTokenAmount,
  getBlockchain,
  readFundCount,
  readMarketData,
  readPaymentToken,
  readTokenAllowance,
  readTokenDecimals,
  readTokenSymbol,
  toTokenSmallestUnit,
  toWei,
  useVaultTransactions,
  type VaultFund,
} from "./tools/utils";
import "./App.css";

// Notification Types
type NotificationType = "warning" | "error" | "success" | "info";

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
}

// Theme Hook
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("vault-theme") as "light" | "dark" | null;
      if (saved) return saved;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("vault-theme", theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme };
}

// Notification Hook
function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((type: NotificationType, title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setNotifications((prev) => [...prev, { id, type, title, message }]);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 5000);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  return { notifications, addNotification, removeNotification };
}

// Notification Component
function NotificationItem({ notification, onClose }: { notification: Notification; onClose: (id: string) => void }) {
  const icons: Record<NotificationType, string> = {
    warning: "⚠️",
    error: "❌",
    success: "✅",
    info: "ℹ️",
  };

  return (
    <div className={`notification ${notification.type}`}>
      <span className="notification-icon">{icons[notification.type]}</span>
      <div className="notification-content">
        <div className="notification-title">{notification.title}</div>
        <div className="notification-message">{notification.message}</div>
      </div>
      <button className="notification-close" onClick={() => onClose(notification.id)}>
        ×
      </button>
    </div>
  );
}

// Theme Toggle Component
function ThemeToggle({ theme, toggleTheme }: { theme: "light" | "dark"; toggleTheme: () => void }) {
  return (
    <button className="theme-toggle" onClick={toggleTheme} title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}>
      {theme === "light" ? "🌙" : "☀️"}
    </button>
  );
}

type Page = "dashboard" | "deposit" | "withdraw";

const shortAddress = (address?: string) => (address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "-");

const formatCountdown = (secondsLeft: number) => {
  if (secondsLeft <= 0) return "Unlocked";
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

function App() {
  const account = useActiveAccount();
  const { selectedNetwork, setSelectedNetwork } = useNetworkStore();
  const { deposit, withdraw, approveToken, isPending } = useVaultTransactions();
  const { theme, toggleTheme } = useTheme();
  const { notifications, addNotification, removeNotification } = useNotifications();

  const [page, setPage] = useState<Page>("dashboard");
  const [allFunds, setAllFunds] = useState<VaultFund[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Connect your wallet to load your vaults.");

  const [depositAmount, setDepositAmount] = useState("0.1");
  const [daysLocked, setDaysLocked] = useState(30);
  const [isTokenMode, setIsTokenMode] = useState(false);
  const [tokenAddress, setTokenAddress] = useState("");

  const [selectedFundId, setSelectedFundId] = useState<number | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState("0");
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const loadVaults = async () => {
    setLoading(true);
    try {
      const total = await readFundCount();
      const ids = Array.from({ length: total }, (_, idx) => idx + 1);
      const marketData = await readMarketData(ids);
      const enriched = await Promise.all(
        marketData.map(async (market, i) => {
          const fundId = i + 1;
          const paymentToken = await readPaymentToken(fundId);
          return {
            ...market,
            id: fundId,
            paymentToken,
          } as VaultFund;
        }),
      );
      setAllFunds(enriched);
      setStatus(`Loaded ${enriched.length} funds from ${selectedNetwork.name}.`);
    } catch (error) {
      console.error(error);
      setStatus("Unable to fetch vault data. Confirm contract + network config.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAllFunds([]);
    setStatus(`Switching to ${selectedNetwork.name}...`);
    void loadVaults();
  }, [selectedNetwork]);

  const myFunds = useMemo(() => {
    if (!account?.address) return [];
    return allFunds.filter((fund) => fund.creator.toLowerCase() === account.address.toLowerCase());
  }, [account?.address, allFunds]);

  const selectedFund = useMemo(
    () => myFunds.find((f) => f.id === selectedFundId) ?? myFunds[0],
    [myFunds, selectedFundId],
  );

  const lockMetrics = useMemo(() => {
    if (!selectedFund) return { progress: 0, secondsLeft: 0, unlocked: false };
    const start = Number(selectedFund.startTime) * 1000;
    const end = Number(selectedFund.endTime) * 1000;
    const total = Math.max(end - start, 1);
    const elapsed = Math.min(Math.max(now - start, 0), total);
    const secondsLeft = Math.max(Math.floor((end - now) / 1000), 0);
    return {
      progress: Math.round((elapsed / total) * 100),
      secondsLeft,
      unlocked: secondsLeft === 0 && !selectedFund.closed,
    };
  }, [selectedFund, now]);

  const handleDeposit = async () => {
    if (!account?.address) {
      addNotification("warning", "Wallet Not Connected", "Please connect your wallet to make a deposit.");
      return;
    }
    try {
      if (!depositAmount || daysLocked < 0) return;
      let amount = toWei(depositAmount);
      let paymentToken = ZERO_ADDRESS;

      if (isTokenMode) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
          setStatus("Enter a valid token address.");
          return;
        }
        paymentToken = tokenAddress as Address;
        const decimals = await readTokenDecimals(paymentToken);
        amount = toTokenSmallestUnit(depositAmount, decimals);
        
        // Check current allowance
        const vaultAddress = getBlockchain().contractAddress;
        const currentAllowance = await readTokenAllowance(paymentToken, account.address, vaultAddress);
        
        // Only approve if allowance is insufficient
        if (currentAllowance < amount) {
          setStatus("Approving token spend...");
          await approveToken(paymentToken, amount);
          setStatus("Token approved. Submitting deposit...");
        }
      }

      await deposit({
        marketBalance: amount,
        feeType: isTokenMode,
        paymentToken,
        days: daysLocked,
      });

      setStatus("Vault deposited successfully.");
      await loadVaults();
      setPage("dashboard");
    } catch (error) {
      console.error(error);
      setStatus("Deposit failed. Review wallet/network and try again.");
    }
  };

  const handleWithdraw = async () => {
    if (!account?.address) {
      addNotification("warning", "Wallet Not Connected", "Please connect your wallet to make a withdrawal.");
      return;
    }
    if (!selectedFund || !withdrawAmount) return;
    try {
      const decimals = selectedFund.paymentToken === ZERO_ADDRESS ? 18 : await readTokenDecimals(selectedFund.paymentToken);
      const amount = toTokenSmallestUnit(withdrawAmount, decimals);
      await withdraw(selectedFund.id, amount);
      setStatus(`Withdraw submitted for Fund #${selectedFund.id}.`);
      setWithdrawAmount("0");
      await loadVaults();
    } catch (error) {
      console.error(error);
      setStatus("Withdraw failed. Vault may still be locked or amount too high.");
    }
  };

  const [symbol, setSymbol] = useState(selectedNetwork.symbol);
  useEffect(() => {
    const resolveSymbol = async () => {
      if (!selectedFund) {
        setSymbol(selectedNetwork.symbol);
        return;
      }
      const tokenSymbol = await readTokenSymbol(selectedFund.paymentToken);
      setSymbol(tokenSymbol);
    };
    void resolveSymbol();
  }, [selectedFund, selectedNetwork.symbol]);

  const chartData = [
    { name: "Locked", value: Math.max(100 - lockMetrics.progress, 1) },
    { name: "Matured", value: Math.max(lockMetrics.progress, 1) },
  ];

  return (
    <>
      <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
      <div className="notification-container">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} onClose={removeNotification} />
        ))}
      </div>
      <div className="vault-app">
      <header className="hero">
        <div>
          <p className="eyebrow">SimpleVault</p>
          <h1>Institutional-grade vault dashboard for your wallet-created locks.</h1>
          <p className="subtitle">Coinbase-inspired clarity, with animated lock telemetry and quick deposit/withdraw controls.</p>
          <div className="chips">
            {chains.map((chain) => (
              <button
                key={chain.chainId}
                className={chain.chainId === selectedNetwork.chainId ? "chip active" : "chip"}
                onClick={() => setSelectedNetwork(chain)}
              >
                {chain.name}
              </button>
            ))}
          </div>
        </div>
        <div className="connect-panel">
          <Connector />
          <p>Wallet: {shortAddress(account?.address)}</p>
          <button className="chip" onClick={() => void loadVaults()}>
            Refresh Vaults
          </button>
        </div>
      </header>

      <nav className="tabs">
        {(["dashboard", "deposit", "withdraw"] as Page[]).map((item) => (
          <button key={item} className={page === item ? "tab active" : "tab"} onClick={() => setPage(item)}>
            {item}
          </button>
        ))}
      </nav>

      <main className="grid">
        <section className="card">
          <h3>My Vaults</h3>
          {loading ? <p>Loading vaults...</p> : null}
          {!loading && myFunds.length === 0 ? <p>No vaults created by this wallet address yet.</p> : null}
          <div className="vault-list">
            {myFunds.map((fund) => (
              <button key={fund.id} className={selectedFund?.id === fund.id ? "vault-item active" : "vault-item"} onClick={() => setSelectedFundId(fund.id)}>
                <div>
                  <strong>Fund #{fund.id}</strong>
                  <p>{shortAddress(fund.creator)}</p>
                </div>
                <span>{fund.closed ? "Closed" : fund.feeType ? "Token" : "Native"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="card lock-card">
          <h3>Lock Telemetry</h3>
          {selectedFund ? (
            <>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={chartData} innerRadius={60} outerRadius={92} dataKey="value" startAngle={90} endAngle={-270}>
                      <Cell fill="#1d4ed8" />
                      <Cell fill="#60a5fa" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <motion.div
                  className={lockMetrics.unlocked ? "lock-orb unlocked" : "lock-orb"}
                  animate={{ rotateY: [0, 8, -8, 0], y: [0, -4, 0] }}
                  transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                >
                  {lockMetrics.unlocked ? "🔓" : "🔒"}
                </motion.div>
              </div>
              <p>{formatCountdown(lockMetrics.secondsLeft)} • {lockMetrics.progress}% matured</p>
              <p>
                Balance: {formatTokenAmount(selectedFund.marketBalance, selectedFund.paymentToken === ZERO_ADDRESS ? 18 : selectedNetwork.decimals)} {symbol}
              </p>
            </>
          ) : (
            <p>Select a fund to view lock chart and unlock state.</p>
          )}
        </section>

        {page === "deposit" && (
          <section className="card action">
            <h3>Deposit Funds</h3>
            <label>Amount</label>
            <input value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} placeholder="0.10" />
            <label>Days locked</label>
            <input type="number" min={0} value={daysLocked} onChange={(e) => setDaysLocked(Number(e.target.value))} />
            <div className="chips">
              <button className={isTokenMode ? "chip" : "chip active"} onClick={() => setIsTokenMode(false)}>
                Native
              </button>
              <button className={isTokenMode ? "chip active" : "chip"} onClick={() => setIsTokenMode(true)}>
                ERC20
              </button>
            </div>
            {isTokenMode ? (
              <>
                <label>Token address</label>
                <input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="0x..." />
              </>
            ) : null}
            <button className="primary" disabled={!account || isPending} onClick={() => void handleDeposit()}>
              {isPending ? "Submitting..." : "Deposit to Vault"}
            </button>
          </section>
        )}

        {page === "withdraw" && (
          <section className="card action">
            <h3>Withdraw Funds</h3>
            <label>Amount</label>
            <input value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.01" />
            <button className="primary" disabled={!selectedFund || !lockMetrics.unlocked || isPending} onClick={() => void handleWithdraw()}>
              {lockMetrics.unlocked ? "Withdraw available funds" : "Vault still locked"}
            </button>
          </section>
        )}

        <section className="card status">
          <h3>Session Status</h3>
          <p>{status}</p>
          <p>
            Contract: <a href={`${selectedNetwork.blockExplorer}/address/${selectedNetwork.contractAddress}`} target="blank">{shortAddress(selectedNetwork.contractAddress)}</a>
          </p>
        </section>
      </main>
    </div>
    </>
  );
}

export default App;
