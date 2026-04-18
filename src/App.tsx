import { useEffect, useMemo, useState } from 'react';
import { ConnectButton, useActiveAccount, useActiveWalletChain, useSwitchActiveWalletChain } from 'thirdweb/react';
import { motion } from 'framer-motion';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { Address } from 'viem';
import {
  configuredNetworks,
  defaultNetwork,
  getNetworkByChainId,
  supportedNetworks,
  toThirdwebChain,
  type SupportedNetwork,
} from './lib/networks';
import { getConnectTheme, hasThirdwebClientId, thirdwebClient, wallets } from './lib/thirdweb';
import { useVault } from './hooks/useVault';
import type { AppView, ThemeMode, VaultFund } from './types/vault';
import './App.css';

const storageKeys = {
  mode: 'simplevault-theme',
  network: 'simplevault-network',
} as const;

const ringPalette = {
  native: ['#0f6bff', '#92f4cf', '#c6d7f8'],
  token: ['#ff8a5b', '#ffd26f', '#ffdfe0'],
  urgent: ['#ef4444', '#fb7185', '#fee2e2'],
} as const;

const readStoredTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  return window.localStorage.getItem(storageKeys.mode) === 'light' ? 'light' : 'dark';
};

const readStoredNetwork = () => {
  if (typeof window === 'undefined') {
    return defaultNetwork;
  }

  const stored = window.localStorage.getItem(storageKeys.network);
  return supportedNetworks.find((network) => network.key === stored) ?? defaultNetwork;
};

const formatCountdown = (distanceMs: number) => {
  if (distanceMs <= 0) {
    return 'Unlocked now';
  }

  const totalSeconds = Math.floor(distanceMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

const getFundMetrics = (fund: VaultFund | undefined, now: number) => {
  if (!fund) {
    return {
      elapsedMs: 0,
      remainingMs: 0,
      unlocksAt: '',
      progress: 0,
      status: 'Awaiting fund selection',
      chartColors: ringPalette.native,
      unlocked: false,
    };
  }

  const start = Number(fund.startTime) * 1000;
  const end = Number(fund.endTime) * 1000;
  const durationMs = Math.max(end - start, 1);
  const elapsedMs = Math.min(Math.max(now - start, 0), durationMs);
  const remainingMs = Math.max(end - now, 0);
  const progress = durationMs > 0 ? Math.min(100, (elapsedMs / durationMs) * 100) : 0;
  const unlocked = remainingMs <= 0 && !fund.closed;
  const urgent = remainingMs > 0 && remainingMs < 24 * 60 * 60 * 1000;
  const chartColors = urgent ? ringPalette.urgent : fund.feeType ? ringPalette.token : ringPalette.native;

  return {
    elapsedMs,
    remainingMs,
    unlocksAt: new Date(end).toLocaleString(),
    progress,
    status: fund.closed ? 'Fully withdrawn' : unlocked ? 'Ready to withdraw' : 'Lock still active',
    chartColors,
    unlocked,
  };
};

function App() {
  const account = useActiveAccount();
  const activeChain = useActiveWalletChain();
  const switchChain = useSwitchActiveWalletChain();

  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);
  const [selectedNetwork, setSelectedNetwork] = useState<SupportedNetwork>(readStoredNetwork);
  const [view, setView] = useState<AppView>('overview');
  const [selectedFundId, setSelectedFundId] = useState<bigint | null>(null);
  const [amount, setAmount] = useState('');
  const [daysLocked, setDaysLocked] = useState(30);
  const [assetMode, setAssetMode] = useState<'native' | 'token'>('native');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenPreview, setTokenPreview] = useState('Token metadata will appear here.');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.mode, mode);
  }, [mode]);

  useEffect(() => {
    window.localStorage.setItem(storageKeys.network, selectedNetwork.key);
  }, [selectedNetwork.key]);

  const { contractAddress, createFund, funds, inspectToken, isPending, loading, status, withdrawFund } = useVault(
    account?.address as Address | undefined,
    selectedNetwork,
    activeChain?.id,
  );

  const selectedFund = useMemo(
    () =>
      funds.find((fund) => fund.id === selectedFundId) ??
      funds[0] ??
      undefined,
    [funds, selectedFundId],
  );

  const fundMetrics = useMemo(() => getFundMetrics(selectedFund, nowMs), [selectedFund, nowMs]);

  const chartData = useMemo(
    () => [
      { name: 'Elapsed', value: Math.max(fundMetrics.elapsedMs, 0) || 1 },
      { name: 'Remaining', value: Math.max(fundMetrics.remainingMs, 0) || 1 },
    ],
    [fundMetrics.elapsedMs, fundMetrics.remainingMs],
  );

  const connectedWrongChain = Boolean(account && activeChain?.id !== selectedNetwork.chainId);
  const configuredNetworkCount = configuredNetworks.length;
  const walletNetwork = getNetworkByChainId(activeChain?.id);
  const tokenAddressValid = /^0x[a-fA-F0-9]{40}$/.test(tokenAddress);
  const canCreateFund =
    Boolean(account) &&
    Boolean(contractAddress) &&
    Boolean(amount.trim()) &&
    daysLocked > 0 &&
    !isPending &&
    (assetMode === 'native' || tokenAddressValid);

  const handleTokenPreview = async () => {
    if (assetMode !== 'token') {
      return;
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
      setTokenPreview('Enter a valid ERC20 token address.');
      return;
    }

    const metadata = await inspectToken(tokenAddress as Address);
    setTokenPreview(`${metadata.symbol} with ${metadata.decimals} decimals detected.`);
  };

  const handleCreateFund = async () => {
    const created = await createFund({
      amount,
      daysLocked,
      feeType: assetMode,
      paymentToken:
        assetMode === 'token'
          ? (tokenAddress as Address)
          : ('0x0000000000000000000000000000000000000000' as Address),
    });

    if (created) {
      setView('withdraw');
      setSelectedFundId(null);
      setAmount('');
      setWithdrawAmount('');
      setAssetMode('native');
      setTokenAddress('');
      setTokenPreview('Token metadata will appear here.');
    }
  };

  const handleWithdraw = async () => {
    if (!selectedFund) {
      return;
    }

    const withdrawn = await withdrawFund(selectedFund, withdrawAmount);
    if (withdrawn) {
      setWithdrawAmount('');
    }
  };

  const handleSelectNetwork = async (network: SupportedNetwork) => {
    setSelectedNetwork(network);

    if (!account) {
      return;
    }

    try {
      await switchChain(toThirdwebChain(network));
    } catch {
      // Keep the preferred network in the UI even if the wallet rejects the switch.
    }
  };

  return (
    <div className={`app-shell ${mode}`}>
      <div className="backdrop backdrop-one" />
      <div className="backdrop backdrop-two" />
      <div className="backdrop backdrop-three" />

      <header className="hero glass">
        <div className="hero-copy">
          <span className="eyebrow">SimpleVault</span>
          <h1>Coinbase-clean vault controls with a softer, playful edge.</h1>
          <p>
            Create time-locked native or ERC20 funds, browse everything your connected wallet owns, and unlock withdrawals
            with a live animated countdown.
          </p>
          <div className="hero-actions">
            <button className="mode-toggle" onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
              {mode === 'dark' ? 'Switch to light' : 'Switch to dark'}
            </button>
            <div className="status-pill">
              {configuredNetworkCount > 0
                ? `${configuredNetworkCount} configured network${configuredNetworkCount > 1 ? 's' : ''}`
                : 'Add a vault address to begin'}
            </div>
          </div>
        </div>

        <div className="hero-connect glass-subtle">
          <div className="wallet-caption">
            <strong>Connect and continue</strong>
            <span>Coinbase Wallet is first in the list, then MetaMask, WalletConnect, and social login.</span>
          </div>
          {hasThirdwebClientId ? (
            <ConnectButton
              client={thirdwebClient}
              chain={toThirdwebChain(selectedNetwork)}
              wallets={wallets}
              theme={getConnectTheme(mode)}
              connectButton={{ label: account ? 'Wallet connected' : 'Connect wallet' }}
              connectModal={{
                size: 'wide',
                title: 'Open SimpleVault',
                welcomeScreen: {
                  title: 'SimpleVault',
                  subtitle: 'Lock assets with calm, polished control.',
                },
              }}
            />
          ) : (
            <div className="empty-state">
              Add <code>VITE_THIRDWEB_CLIENT_ID</code> to your environment to enable wallet connection.
            </div>
          )}
          <div className="network-strip">
            {supportedNetworks.map((network) => (
              <button
                key={network.chainId}
                className={`network-chip ${network.chainId === selectedNetwork.chainId ? 'active' : ''}`}
                onClick={() => void handleSelectNetwork(network)}
              >
                <span>{network.name}</span>
                <small>{network.contractAddress ? 'Vault ready' : 'Needs address'}</small>
              </button>
            ))}
          </div>
        </div>
      </header>

      <nav className="view-tabs">
        {(['overview', 'create', 'withdraw'] as AppView[]).map((panel) => (
          <button key={panel} className={view === panel ? 'active' : ''} onClick={() => setView(panel)}>
            {panel === 'overview' ? 'Overview' : panel === 'create' ? 'Create fund' : 'Withdraw'}
          </button>
        ))}
      </nav>

      <main className="dashboard">
        <section className="overview-column">
          <motion.article className="glass card stack-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="card-head">
              <div>
                <span className="card-label">Portfolio</span>
                <h2>Your locked funds</h2>
              </div>
              <div className={`wallet-state ${connectedWrongChain ? 'warn' : ''}`}>
                {account
                  ? connectedWrongChain
                    ? `Wallet on ${walletNetwork?.name ?? activeChain?.name ?? 'another chain'}`
                    : `Connected as ${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                  : 'Not connected'}
              </div>
            </div>

            <div className="portfolio-grid">
              <div>
                <span className="metric-label">Funds</span>
                <strong>{funds.length}</strong>
              </div>
              <div>
                <span className="metric-label">Network</span>
                <strong>{selectedNetwork.name}</strong>
              </div>
              <div>
                <span className="metric-label">Vault address</span>
                <strong>{contractAddress ? `${contractAddress.slice(0, 6)}...${contractAddress.slice(-4)}` : 'Unconfigured'}</strong>
              </div>
            </div>

            <div className="fund-list">
              {loading && <div className="empty-state">Reading vault data from {selectedNetwork.name}...</div>}
              {!loading && !funds.length && (
                <div className="empty-state">
                  {account ? 'No funds found for this wallet on the selected network yet.' : 'Connect a wallet to load your funds.'}
                </div>
              )}
              {funds.map((fund) => {
                const isSelected = selectedFund?.id === fund.id;
                return (
                  <button key={fund.id.toString()} className={`fund-item ${isSelected ? 'active' : ''}`} onClick={() => setSelectedFundId(fund.id)}>
                    <div>
                      <strong>Fund #{fund.id.toString()}</strong>
                      <span>
                        {fund.balanceLabel} {fund.tokenSymbol}
                      </span>
                    </div>
                    <div className="fund-badges">
                      <span className={`badge ${fund.closed ? 'neutral' : fund.feeType ? 'warm' : 'cool'}`}>
                        {fund.closed ? 'Closed' : fund.feeType ? 'ERC20' : 'Native'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.article>

          <motion.article className="glass card detail-card" initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <div className="card-head">
              <div>
                <span className="card-label">Detail</span>
                <h2>{selectedFund ? `Fund #${selectedFund.id.toString()}` : 'Select a fund'}</h2>
              </div>
              <div className={`timeline-pill ${fundMetrics.unlocked ? 'ready' : ''}`}>{fundMetrics.status}</div>
            </div>

            {!selectedFund ? (
              <div className="empty-state">Pick any listed fund to inspect its timing, asset details, and withdrawal controls.</div>
            ) : (
              <div className="detail-layout">
                <div className="chart-panel">
                  <ResponsiveContainer width="100%" height={310}>
                    <PieChart>
                      <Pie data={chartData} dataKey="value" innerRadius={74} outerRadius={112} paddingAngle={4} startAngle={90} endAngle={-270} isAnimationActive>
                        {chartData.map((entry, index) => (
                          <Cell key={`${entry.name}-${index}`} fill={fundMetrics.chartColors[index]} />
                        ))}
                      </Pie>
                      <Pie data={[{ name: 'Glow', value: 1 }]} dataKey="value" innerRadius={117} outerRadius={126} startAngle={90} endAngle={-270}>
                        <Cell fill={fundMetrics.chartColors[1]} fillOpacity={0.18} />
                      </Pie>
                      <Tooltip formatter={(value) => formatCountdown(Number(value ?? 0))} />
                    </PieChart>
                  </ResponsiveContainer>

                  <motion.div
                    className="center-orb"
                    animate={{
                      boxShadow: `0 0 40px ${fundMetrics.chartColors[0]}66, inset 0 1px 0 rgba(255,255,255,0.55)`,
                      rotate: fundMetrics.progress / 30,
                    }}
                    transition={{ type: 'spring', stiffness: 90, damping: 18 }}
                  >
                    <span>{fundMetrics.unlocked ? 'Ready' : `${Math.round(fundMetrics.progress)}%`}</span>
                    <strong>{formatCountdown(fundMetrics.remainingMs)}</strong>
                  </motion.div>
                </div>

                <div className="detail-copy">
                  <div className="meta-card glass-subtle">
                    <span className="metric-label">Asset</span>
                    <strong>
                      {selectedFund.tokenSymbol} {selectedFund.feeType ? 'token vault' : 'native vault'}
                    </strong>
                    <p>Decimals: {selectedFund.tokenDecimals}</p>
                  </div>

                  <div className="meta-grid">
                    <div className="meta-card glass-subtle">
                      <span className="metric-label">Balance</span>
                      <strong>
                        {selectedFund.balanceLabel} {selectedFund.tokenSymbol}
                      </strong>
                    </div>
                    <div className="meta-card glass-subtle">
                      <span className="metric-label">Unlocks</span>
                      <strong>{fundMetrics.unlocksAt}</strong>
                    </div>
                    <div className="meta-card glass-subtle">
                      <span className="metric-label">Created</span>
                      <strong>{new Date(Number(selectedFund.startTime) * 1000).toLocaleString()}</strong>
                    </div>
                    <div className="meta-card glass-subtle">
                      <span className="metric-label">Explorer</span>
                      <a href={selectedFund.explorerUrl} target="_blank" rel="noreferrer">
                        View contract
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.article>
        </section>

        <section className="action-column">
          <motion.article className={`glass card ${view === 'create' ? 'featured' : ''}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }}>
            <div className="card-head">
              <div>
                <span className="card-label">Create</span>
                <h2>Build a new lock</h2>
              </div>
              <div className="status-pill">{selectedNetwork.name}</div>
            </div>

            <label className="field">
              <span>Amount</span>
              <input value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.25" />
            </label>

            <label className="field">
              <span>Lock duration in days</span>
              <input type="number" min={1} value={daysLocked} onChange={(event) => setDaysLocked(Number(event.target.value))} />
            </label>

            <div className="toggle-row">
              <button
                className={assetMode === 'native' ? 'active' : ''}
                onClick={() => {
                  setAssetMode('native');
                  setTokenAddress('');
                  setTokenPreview('Token metadata will appear here.');
                }}
              >
                Native asset
              </button>
              <button className={assetMode === 'token' ? 'active' : ''} onClick={() => setAssetMode('token')}>
                ERC20 token
              </button>
            </div>

            {assetMode === 'token' && (
              <>
                <label className="field">
                  <span>Token address</span>
                  <input
                    value={tokenAddress}
                    onChange={(event) => setTokenAddress(event.target.value)}
                    onBlur={() => void handleTokenPreview()}
                    placeholder="0x..."
                  />
                </label>
                <div className="token-preview">{tokenPreview}</div>
              </>
            )}

            <button className="primary-action" disabled={!canCreateFund} onClick={() => void handleCreateFund()}>
              {isPending ? 'Working...' : 'Create fund'}
            </button>

            <p className="helper-copy">
              Native mode sends `msg.value`. Token mode approves then deposits the ERC20 amount using the token&apos;s live decimals.
            </p>
          </motion.article>

          <motion.article className={`glass card ${view === 'withdraw' ? 'featured' : ''}`} initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 }}>
            <div className="card-head">
              <div>
                <span className="card-label">Withdraw</span>
                <h2>Release a matured fund</h2>
              </div>
              <div className={`status-pill ${fundMetrics.unlocked ? 'ready' : ''}`}>{fundMetrics.unlocked ? 'Unlocked' : 'Locked'}</div>
            </div>

            {selectedFund ? (
              <>
                <div className="countdown-card glass-subtle">
                  <span className="metric-label">Time remaining</span>
                  <strong>{formatCountdown(fundMetrics.remainingMs)}</strong>
                  <div className="progress-track">
                    <motion.div
                      className="progress-fill"
                      animate={{
                        width: `${fundMetrics.progress}%`,
                        background: `linear-gradient(90deg, ${fundMetrics.chartColors[0]}, ${fundMetrics.chartColors[1]})`,
                      }}
                    />
                  </div>
                </div>

                <label className="field">
                  <span>Withdraw amount in {selectedFund.tokenSymbol}</span>
                  <input value={withdrawAmount} onChange={(event) => setWithdrawAmount(event.target.value)} placeholder={`Max ${selectedFund.balanceLabel}`} />
                </label>

                <button
                  className="primary-action"
                  disabled={!fundMetrics.unlocked || !withdrawAmount || selectedFund.closed || isPending}
                  onClick={() => void handleWithdraw()}
                >
                  {selectedFund.closed ? 'Fund closed' : fundMetrics.unlocked ? 'Withdraw now' : 'Unlock countdown running'}
                </button>

                <p className="helper-copy">
                  Withdrawals activate only after the vault end time passes and the fund still has a remaining balance.
                </p>
              </>
            ) : (
              <div className="empty-state">Create or select a fund first.</div>
            )}
          </motion.article>

          <motion.article className="glass card status-card" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12 }}>
            <div className="card-head">
              <div>
                <span className="card-label">Session</span>
                <h2>Current state</h2>
              </div>
              <div className={`status-pill ${status.tone}`}>{status.tone}</div>
            </div>
            <p className="session-copy">
              {status.message || 'Connect your wallet, pick a configured chain, and the dapp will load all funds owned by that address.'}
            </p>
            {connectedWrongChain && (
              <button className="secondary-action" onClick={() => void switchChain(toThirdwebChain(selectedNetwork))}>
                Switch wallet to {selectedNetwork.name}
              </button>
            )}
          </motion.article>
        </section>
      </main>
    </div>
  );
}

export default App;
