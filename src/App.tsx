import { useMemo, useState } from 'react';
import { ConnectButton, useActiveAccount, useActiveWalletChain } from 'thirdweb/react';
import { formatUnits, type Address } from 'viem';
import { motion } from 'framer-motion';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { supportedChains } from './lib/networks';
import { thirdwebClient } from './lib/thirdweb';
import { useVault } from './hooks/useVault';
import type { CountdownState, ThemeMode } from './types/vault';
import './App.css';

const palette = ['#7C3AED', '#22C55E', '#06B6D4', '#F59E0B'];

const getCountdown = (start: bigint, end: bigint): CountdownState => {
  const now = Date.now() / 1000;
  const total = Number(end - start);
  const remaining = Math.max(0, Math.floor(Number(end) - now));
  return { total, remaining, unlocked: remaining <= 0 };
};

function App() {
  const account = useActiveAccount();
  const chain = useActiveWalletChain();
  const [mode, setMode] = useState<ThemeMode>('dark');
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [amount, setAmount] = useState('');
  const [days, setDays] = useState(30);
  const [tokenAddress, setTokenAddress] = useState('');
  const [useToken, setUseToken] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const { funds, loading, txState, createFund, withdraw, vaultAddress, formatBalance } = useVault(
    account?.address as Address | undefined,
    chain?.id,
  );

  const selectedFund = useMemo(
    () => funds.find((f) => f.id === selectedId) ?? funds[0],
    [funds, selectedId],
  );

  const countdown = selectedFund
    ? getCountdown(selectedFund.startTime, selectedFund.endTime)
    : { total: 0, remaining: 0, unlocked: false };

  const progress = countdown.total > 0 ? ((countdown.total - countdown.remaining) / countdown.total) * 100 : 0;

  return (
    <div className={`app ${mode}`}>
      <div className="bg-orb orb1" />
      <div className="bg-orb orb2" />

      <header className="topbar glass">
        <h1>SimpleVault Studio</h1>
        <div className="controls">
          <button onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')} className="pill">
            {mode === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <ConnectButton client={thirdwebClient} chains={supportedChains as never} theme={mode} />
        </div>
      </header>

      <main className="layout">
        <section className="glass panel create-panel">
          <h2>Create Fund</h2>
          <p>Design a new lockbox with ETH or ERC20 assets.</p>
          <label>
            Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </label>
          <label>
            Lock days
            <input
              value={days}
              min={1}
              onChange={(e) => setDays(Number(e.target.value))}
              type="number"
              placeholder="30"
            />
          </label>
          <label className="switch-row">
            <input type="checkbox" checked={useToken} onChange={(e) => setUseToken(e.target.checked)} />
            Use ERC20 token instead of native asset
          </label>
          {useToken && (
            <label>
              Token address
              <input value={tokenAddress} onChange={(e) => setTokenAddress(e.target.value)} placeholder="0x..." />
            </label>
          )}
          <button
            className="cta"
            onClick={() => void createFund(amount, days, useToken, tokenAddress as Address)}
            disabled={!account || !amount || !vaultAddress}
          >
            Create Fund ✨
          </button>
          <small className="muted">Vault: {vaultAddress ?? 'Set VITE_VAULT_ADDRESSES'}</small>
        </section>

        <section className="glass panel list-panel">
          <h2>My Locked Funds</h2>
          {loading && <p>Loading your vaults...</p>}
          {!loading && funds.length === 0 && <p>No funds yet. Create your first one 🎉</p>}
          <div className="fund-list">
            {funds.map((fund, i) => (
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                key={fund.id.toString()}
                className={`fund-card ${selectedFund?.id === fund.id ? 'active' : ''}`}
                onClick={() => setSelectedId(fund.id)}
              >
                <div>
                  <h3>Fund #{fund.id.toString()}</h3>
                  <p>
                    {formatBalance(fund)} {fund.tokenSymbol}
                  </p>
                </div>
                <span style={{ background: palette[i % palette.length] }} className="dot" />
              </motion.button>
            ))}
          </div>
        </section>

        <section className="glass panel detail-panel">
          <h2>Fund Insights</h2>
          {!selectedFund ? (
            <p>Select a fund to view the pie chart and unlock timer.</p>
          ) : (
            <>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Unlocked', value: countdown.total - countdown.remaining },
                        { name: 'Remaining', value: countdown.remaining },
                      ]}
                      innerRadius={58}
                      outerRadius={100}
                      paddingAngle={4}
                      dataKey="value"
                      isAnimationActive
                    >
                      {[0, 1].map((i) => (
                        <Cell key={i} fill={palette[i]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>

                <motion.div
                  className="countdown-ring"
                  animate={{ background: `conic-gradient(#7c3aed ${progress * 3.6}deg, #94a3b833 0deg)` }}
                  transition={{ duration: 0.8 }}
                >
                  <div>
                    <strong>{countdown.unlocked ? 'Unlocked 🎉' : `${countdown.remaining}s`}</strong>
                    <span>remaining</span>
                  </div>
                </motion.div>
              </div>

              <div className="meta-grid">
                <div>
                  <small>Asset</small>
                  <p>{selectedFund.tokenSymbol}</p>
                </div>
                <div>
                  <small>Balance</small>
                  <p>{formatUnits(selectedFund.marketBalance, selectedFund.tokenDecimals)}</p>
                </div>
                <div>
                  <small>Start</small>
                  <p>{new Date(Number(selectedFund.startTime) * 1000).toLocaleString()}</p>
                </div>
                <div>
                  <small>Unlock</small>
                  <p>{new Date(Number(selectedFund.endTime) * 1000).toLocaleString()}</p>
                </div>
              </div>

              <div className="withdraw-box">
                <input
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder={`Amount in ${selectedFund.tokenSymbol}`}
                />
                <button
                  className="cta"
                  disabled={!countdown.unlocked || !withdrawAmount}
                  onClick={() => void withdraw(selectedFund.id, withdrawAmount, selectedFund.tokenDecimals)}
                >
                  {countdown.unlocked ? 'Withdraw Now' : 'Still Locked'}
                </button>
              </div>
            </>
          )}
          {txState && <p className="status">{txState}</p>}
        </section>
      </main>
    </div>
  );
}

export default App;
