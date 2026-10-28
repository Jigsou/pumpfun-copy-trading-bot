import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity,
  ExternalLink,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  Target,
  Trash2,
  Wallet,
} from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

interface WalletEntry {
  address: string;
  label: string;
}
interface WalletState extends WalletEntry {
  buys: number;
  sells: number;
  lastSeen: number | null;
  subscribed: boolean;
}
interface PositionRow {
  key: string;
  wallet: string;
  label: string;
  mint: string;
  delayMs: number;
  openedAt: number;
  entryPrice: number;
  targetPrice: number;
  slipVsTargetPct: number;
  pipelineMs: number;
}
interface TradeRow {
  time: number;
  wallet: string;
  label: string;
  mint: string;
  delayMs: number;
  slipVsTargetPct: number;
  heldSec: number;
  reason: string;
  pnlSol: number | null;
  pnlPct: number | null;
}
interface EventRow {
  time: number;
  wallet: string;
  label: string;
  side: 'buy' | 'sell';
  mint: string;
  sol: number;
  venue: string;
  signature: string;
  fetchMs: number;
}
interface StatRow {
  delayMs: number;
  n: number;
  unpriced: number;
  wins: number;
  winRate: number | null;
  totalPnlSol: number;
  avgPnlPct: number | null;
  medianSlipPct: number | null;
}
interface Latency {
  samples: number;
  avgChainLagMs: number | null;
  medianChainLagMs: number | null;
  p90ChainLagMs: number | null;
  avgFetchMs: number | null;
  medianFetchMs: number | null;
}
interface Coverage {
  walletTrades: number;
  onCurve: number;
  onAmm: number;
  skipped: number;
  unpriced: number;
  rejected: number;
  lastMismatch: Record<string, unknown> | null;
}
interface DemoState {
  running: boolean;
  connected: boolean;
  wallets: WalletState[];
  positions: PositionRow[];
  trades: TradeRow[];
  events: EventRow[];
  stats: StatRow[];
  skipped: number;
  latency?: Latency;
  coverage?: Coverage;
  lastError: { message: string; time: number } | null;
}

type TabKey = 'feed' | 'open' | 'closed';

const OLD_DEFAULT_LABEL = 'Cupsey ? (a verifier sur Solscan)';
const DEFAULT_LABEL = 'Cupsey ? (verify on Solscan)';
const DEFAULT_WALLETS: WalletEntry[] = [{ address: '6DQAGJT7VZPVBsuG4kn3AvpyHCEi7B2RFFvMZdbqQqqP', label: DEFAULT_LABEL }];
const DEFAULT_FORM = { buySol: '0.1', delays: '1000,2000,3000', feePct: '1', costPerTxSol: '0.001', timeoutMin: '30' };

const FR_EN: [string, string][] = [
  ['vente de la cible', 'Target sold'],
  ['delai depasse', 'Timeout'],
  ['non evaluable', 'unpriced'],
  ['Adresse Solana invalide (32 a 44 caracteres base58).', 'Invalid Solana address (32 to 44 base58 characters).'],
  ['Adresse invalide', 'Invalid address'],
  ['Cle Helius manquante.', 'Missing Helius key.'],
  ['Ajoute au moins un wallet a suivre.', 'Add at least one wallet to follow.'],
  ['Cle Helius refusee ou RPC injoignable', 'Helius key rejected or RPC unreachable'],
  ['Commande inconnue', 'Unknown command'],
  ['Abonnement refuse', 'Subscription refused'],
  ['Ouverture simulee', 'Simulated open'],
  ['Envoi WebSocket', 'WebSocket send'],
  ['reponse invalide', 'invalid response'],
  ['limite de requetes Helius (429) apres', 'Helius rate limit (429) after'],
  ['essais', 'attempts'],
];
const translateText = (s: string) => FR_EN.reduce((acc, [fr, en]) => acc.split(fr).join(en), s);

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
const fmtPct = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`);
const fmtSol = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(4)}`);
const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-GB');
const fmtMs = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v)} ms`);
const tone = (v: number | null | undefined) => (v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-400' : 'text-rose-400');

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
}
const Panel: React.FC<PanelProps> = ({ title, icon, right, children }) => (
  <section className='panel'>
    <header className='panel-head'>
      <div className='flex items-center gap-2 text-slate-200'>
        {icon}
        <h2 className='panel-title'>{title}</h2>
      </div>
      {right}
    </header>
    <div className='panel-body'>{children}</div>
  </section>
);

interface StatProps {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}
const Stat: React.FC<StatProps> = ({ label, value, sub, valueClass = '' }) => (
  <div className='stat'>
    <div className='stat-label'>{label}</div>
    <div className={`stat-value ${valueClass}`} style={{ fontSize: '1.25rem' }}>
      {value}
    </div>
    {sub && <div className='stat-sub'>{sub}</div>}
  </div>
);

export const DemoPanel: React.FC = () => {
  const [serverUp, setServerUp] = useState(false);
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('feed');
  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('demoHeliusKey') ?? '');
  const [wallets, setWallets] = useState<WalletEntry[]>(() =>
    loadJson<WalletEntry[]>('demoWallets', DEFAULT_WALLETS).map((w) => (w.label === OLD_DEFAULT_LABEL ? { ...w, label: DEFAULT_LABEL } : w))
  );
  const [form, setForm] = useState(() => loadJson('demoForm', DEFAULT_FORM));
  const [newAddr, setNewAddr] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    localStorage.setItem('demoHeliusKey', apiKey);
  }, [apiKey]);
  useEffect(() => {
    localStorage.setItem('demoWallets', JSON.stringify(wallets));
  }, [wallets]);
  useEffect(() => {
    localStorage.setItem('demoForm', JSON.stringify(form));
  }, [form]);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        setServerUp(true);
        ws.send(JSON.stringify({ type: 'demo_hello' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'demo_state') setState(msg.state as DemoState);
          else if (msg.type === 'demo_error') setError(translateText(String(msg.message)));
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
        setServerUp(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((obj: object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    setError('Local server unreachable. Start the project with npm.cmd start.');
    return false;
  }, []);

  const running = !!state?.running;

  const currentSettings = () => ({
    buySol: Number(form.buySol),
    delaysMs: form.delays
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n)),
    feePct: Number(form.feePct),
    costPerTxSol: Number(form.costPerTxSol),
    timeoutMin: Number(form.timeoutMin),
  });

  const handleStart = () => {
    setError(null);
    if (apiKey.trim().length < 8) {
      setError('Paste your Helius API key (free at helius.dev).');
      return;
    }
    if (wallets.length === 0) {
      setError('Add at least one wallet to follow.');
      return;
    }
    send({ type: 'demo_start', apiKey: apiKey.trim(), settings: currentSettings(), wallets });
  };

  const handleAddWallet = () => {
    const address = newAddr.trim();
    if (!BASE58.test(address)) {
      setError('Invalid Solana address (32 to 44 characters).');
      return;
    }
    setError(null);
    const label = newLabel.trim() || short(address);
    setWallets((prev) => [...prev.filter((w) => w.address !== address), { address, label }]);
    if (running) send({ type: 'demo_add_wallet', address, label });
    setNewAddr('');
    setNewLabel('');
  };

  const handleRemoveWallet = (address: string) => {
    setWallets((prev) => prev.filter((w) => w.address !== address));
    if (running) send({ type: 'demo_remove_wallet', address });
  };

  const handleOnlyThis = (w: WalletEntry) => {
    setWallets([w]);
    if (running) send({ type: 'demo_set_wallets', wallets: [w] });
  };

  const walletState = (address: string) => state?.wallets.find((w) => w.address === address);
  const stats = state?.stats ?? [];
  const totalN = stats.reduce((a, s) => a + s.n, 0);
  const slowest = stats.length ? stats[stats.length - 1] : null;
  const positions = state?.positions ?? [];
  const events = state?.events ?? [];
  const trades = state?.trades ?? [];
  const lat = state?.latency;
  const cov = state?.coverage;
  const clockWarning = !!lat && lat.medianChainLagMs != null && lat.medianChainLagMs < 0;

  let verdict = 'Start the simulator and let it run.';
  let verdictClass = 'info';
  if (slowest && state) {
    const perDelay = Math.max(...stats.map((s) => s.n));
    if (perDelay < 50) {
      verdict = `Not enough data: ${perDelay}/50 closed trades for the delay with the most data. Do not conclude anything yet.`;
      verdictClass = 'warn';
    } else if (slowest.totalPnlSol <= 0) {
      verdict = `At a ${slowest.delayMs} ms delay, the simulated PnL is negative (${fmtSol(slowest.totalPnlSol)} SOL). Copying this wallet would lose money at this delay.`;
      verdictClass = 'error';
    } else {
      verdict = `PnL is positive even at ${slowest.delayMs} ms (${fmtSol(slowest.totalPnlSol)} SOL). Promising, but keep running for several days before risking real money.`;
      verdictClass = 'good';
    }
  }

  const inputField = (id: string, label: string, value: string, onChange: (v: string) => void, full = false) => (
    <div className={`field ${full ? 'col-span-2' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input id={id} className='input' value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );

  const tabButton = (key: TabKey, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`px-3 py-1.5 rounded-md text-sm ${tab === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {label}
    </button>
  );

  return (
    <div className='space-y-5'>
      <div className='panel'>
        <div className='panel-body flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <span
              className='chip neutral inline-flex items-center gap-1'
              title='The simulator reads the blockchain (free Helius) and computes what you would have paid, including fees, slippage and a delay of your choice.'
            >
              <ShieldCheck className='w-3 h-3' />
              Demo: no key, no transaction
            </span>
            <span className='pill'>
              <span className={`dot ${serverUp ? 'on' : 'off'}`} />
              {serverUp ? 'Local server OK' : 'Local server unreachable'}
            </span>
            <span className='pill'>
              <span className={`dot ${running ? 'on' : ''}`} />
              {running ? 'Simulation running' : 'Stopped'}
            </span>
            <span className='pill'>
              <span className={`dot ${state?.connected ? 'on' : ''}`} />
              {state?.connected ? 'Helius connected' : 'Helius disconnected'}
            </span>
          </div>
          <div className='flex flex-wrap gap-2'>
            {!running ? (
              <button className='btn btn-primary' onClick={handleStart}>
                <Play className='w-4 h-4' />
                Start simulation
              </button>
            ) : (
              <button className='btn btn-stop' onClick={() => send({ type: 'demo_stop' })}>
                <Square className='w-4 h-4' />
                Stop
              </button>
            )}
            <button className='btn btn-ghost' disabled={!running} onClick={() => send({ type: 'demo_update_settings', settings: currentSettings() })}>
              <SlidersHorizontal className='w-4 h-4' />
              Apply settings
            </button>
            <button className='btn btn-ghost' onClick={() => send({ type: 'demo_reset' })}>
              <RotateCcw className='w-4 h-4' />
              Reset stats
            </button>
          </div>
        </div>
      </div>

      {error && <div className='alert error'>{error}</div>}
      {state?.lastError && (
        <div className='alert warn text-xs'>
          Last error ({fmtTime(state.lastError.time)}): {translateText(state.lastError.message)}
        </div>
      )}
      {clockWarning && (
        <div className='alert warn'>
          Your PC clock is behind the blockchain clock, so the detection lag is understated. Sync it: open PowerShell as administrator and run
          w32tm /resync
        </div>
      )}

      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Stat
          label={slowest ? `Net PnL at ${slowest.delayMs} ms` : 'Net PnL'}
          value={slowest && slowest.n ? `${fmtSol(slowest.totalPnlSol)} SOL` : '-'}
          sub='Slowest delay tested'
          valueClass={tone(slowest && slowest.n ? slowest.totalPnlSol : null)}
        />
        <Stat
          label='Win rate'
          value={slowest && slowest.winRate != null ? `${(slowest.winRate * 100).toFixed(0)} %` : '-'}
          sub={slowest ? `at ${slowest.delayMs} ms` : 'No data yet'}
        />
        <Stat label='Closed trades' value={String(totalN)} sub={`${state?.skipped ?? 0} skipped`} />
        <Stat label='Open positions' value={String(positions.length)} sub={`${state?.wallets.length ?? 0} wallet(s) followed`} />
        <Stat label='Detection lag' value={fmtMs(lat?.medianChainLagMs)} sub={`median - avg ${fmtMs(lat?.avgChainLagMs)}`} />
        <Stat label='Processing time' value={fmtMs(lat?.avgFetchMs)} sub={`average - ${lat?.samples ?? 0} samples`} />
      </div>

      <div className={`alert ${verdictClass}`}>{verdict}</div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        <div className='lg:col-span-7 space-y-5'>
          <Panel title='Results by execution delay' icon={<Activity className='w-4 h-4 text-slate-400' />}>
            <div className='panel-scroll'>
              <table className='data-table'>
                <thead>
                  <tr>
                    <th>Delay</th>
                    <th>Closed</th>
                    <th>Win rate</th>
                    <th>Total PnL (SOL)</th>
                    <th>Avg PnL</th>
                    <th>Paid vs target</th>
                    <th>Unpriced</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.delayMs}>
                      <td className='font-semibold'>{s.delayMs} ms</td>
                      <td>{s.n}</td>
                      <td>
                        <div className='flex items-center gap-2'>
                          <div className='bar w-14'>
                            <span style={{ width: `${(s.winRate ?? 0) * 100}%` }} />
                          </div>
                          {s.winRate == null ? '-' : `${(s.winRate * 100).toFixed(0)} %`}
                        </div>
                      </td>
                      <td className={tone(s.n ? s.totalPnlSol : null)}>{s.n ? fmtSol(s.totalPnlSol) : '-'}</td>
                      <td className={tone(s.avgPnlPct)}>{fmtPct(s.avgPnlPct)}</td>
                      <td>{fmtPct(s.medianSlipPct)}</td>
                      <td>{s.unpriced}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats.length === 0 && <div className='empty'>No data yet.</div>}
            </div>
            <p className='text-xs text-slate-400 mt-3'>
              Skipped (PumpSwap, finished curve or stale): {state?.skipped ?? 0}. You need at least 50 trades per delay before drawing any
              conclusion.
            </p>
          </Panel>

          <section className='panel'>
            <header className='panel-head'>
              <div className='inline-flex gap-1 p-1 rounded-lg border border-white/10'>
                {tabButton('feed', `Wallet trades (${events.length})`)}
                {tabButton('open', `Open positions (${positions.length})`)}
                {tabButton('closed', `Closed trades (${trades.length})`)}
              </div>
            </header>
            <div className='panel-body'>
              {tab === 'feed' && (
                <div>
                  {events.length === 0 && <div className='empty'>Waiting for a wallet trade...</div>}
                  <ul>
                    {events.slice(0, 15).map((ev) => (
                      <li key={`${ev.signature}-${ev.wallet}`} className='feed-item flex-wrap'>
                        <span className={`chip ${ev.side === 'buy' ? 'good' : 'bad'}`}>{ev.side === 'buy' ? 'Buy' : 'Sell'}</span>
                        <span className='font-semibold tabular-nums'>{ev.sol.toFixed(3)} SOL</span>
                        <a className='link' href={`https://solscan.io/tx/${ev.signature}`} target='_blank' rel='noopener noreferrer'>
                          {short(ev.mint)}
                          <ExternalLink className='w-3 h-3' />
                        </a>
                        <span className='chip neutral'>{ev.venue === 'pump' ? 'Pump.fun' : 'PumpSwap (not simulated)'}</span>
                        <span className='ml-auto text-slate-400 text-xs'>
                          {ev.label} - {fmtTime(ev.time)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {tab === 'open' && (
                <div className='panel-scroll'>
                  <table className='data-table'>
                    <thead>
                      <tr>
                        <th>Wallet</th>
                        <th>Token</th>
                        <th>Delay</th>
                        <th>Vs target</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map((p) => (
                        <tr key={p.key}>
                          <td>{p.label}</td>
                          <td>
                            <a className='link' href={`https://solscan.io/token/${p.mint}`} target='_blank' rel='noopener noreferrer'>
                              {short(p.mint)}
                              <ExternalLink className='w-3 h-3' />
                            </a>
                          </td>
                          <td>{p.delayMs} ms</td>
                          <td className={tone(-p.slipVsTargetPct)}>{fmtPct(p.slipVsTargetPct)}</td>
                          <td>{fmtTime(p.openedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {positions.length === 0 && <div className='empty'>No open positions.</div>}
                </div>
              )}

              {tab === 'closed' && (
                <div className='panel-scroll'>
                  <table className='data-table'>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Wallet</th>
                        <th>Token</th>
                        <th>Delay</th>
                        <th>Vs target</th>
                        <th>Held</th>
                        <th>Exit</th>
                        <th>PnL (SOL)</th>
                        <th>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {trades.slice(0, 50).map((t, i) => (
                        <tr key={`${t.time}-${t.mint}-${t.delayMs}-${i}`}>
                          <td>{fmtTime(t.time)}</td>
                          <td>{t.label}</td>
                          <td>
                            <a className='link' href={`https://solscan.io/token/${t.mint}`} target='_blank' rel='noopener noreferrer'>
                              {short(t.mint)}
                              <ExternalLink className='w-3 h-3' />
                            </a>
                          </td>
                          <td>{t.delayMs} ms</td>
                          <td>{fmtPct(t.slipVsTargetPct)}</td>
                          <td>{t.heldSec} s</td>
                          <td>{translateText(t.reason)}</td>
                          <td className={tone(t.pnlSol)}>{fmtSol(t.pnlSol)}</td>
                          <td>
                            <span className={`chip ${t.pnlPct == null ? 'neutral' : t.pnlPct >= 0 ? 'good' : 'bad'}`}>{fmtPct(t.pnlPct)}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {trades.length === 0 && <div className='empty'>No closed trades yet.</div>}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className='lg:col-span-5 space-y-5'>
          <Panel title='Followed wallets' icon={<Wallet className='w-4 h-4 text-slate-400' />}>
            <ul>
              {wallets.map((w) => {
                const ws = walletState(w.address);
                return (
                  <li key={w.address} className='wallet-row'>
                    <div className='avatar'>{w.label.slice(0, 2).toUpperCase()}</div>
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium'>{w.label}</div>
                      <a className='link text-xs' href={`https://solscan.io/account/${w.address}`} target='_blank' rel='noopener noreferrer'>
                        {short(w.address)}
                        <ExternalLink className='w-3 h-3' />
                      </a>
                      <div className='flex flex-wrap gap-1.5 mt-1.5'>
                        <span className='chip good'>{ws?.buys ?? 0} buys</span>
                        <span className='chip bad'>{ws?.sells ?? 0} sells</span>
                        <span className='chip neutral'>{ws?.lastSeen ? fmtTime(ws.lastSeen) : 'no trade yet'}</span>
                      </div>
                    </div>
                    <div className='flex gap-1.5'>
                      <button className='icon-btn' title='Follow only this one' onClick={() => handleOnlyThis(w)}>
                        <Target className='w-4 h-4' />
                      </button>
                      <button className='icon-btn danger' title='Remove' onClick={() => handleRemoveWallet(w.address)}>
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
            {wallets.length === 0 && <div className='empty'>No wallets. Add an address below.</div>}
            <div className='space-y-2 mt-3 pt-3 border-t border-white/10'>
              <input className='input' value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder='Address of the wallet to follow' />
              <div className='flex gap-2'>
                <input className='input' value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder='Name (optional)' />
                <button className='btn btn-primary' onClick={handleAddWallet}>
                  <Plus className='w-4 h-4' />
                  Add
                </button>
              </div>
              <p className='text-xs text-slate-400'>Changes apply immediately while running. Always verify an address on Solscan: impersonators exist.</p>
            </div>
          </Panel>

          <Panel title='Settings' icon={<SlidersHorizontal className='w-4 h-4 text-slate-400' />}>
            <div className='grid grid-cols-2 gap-3'>
              <div className='field col-span-2'>
                <label htmlFor='heliusKey'>Helius API key (free, saved in this browser)</label>
                <input
                  id='heliusKey'
                  type='password'
                  className='input'
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder='Paste your Helius key here'
                />
              </div>
              {inputField('buySol', 'Amount per trade (SOL)', form.buySol, (v) => setForm({ ...form, buySol: v }))}
              {inputField('timeoutMin', 'Max hold (minutes)', form.timeoutMin, (v) => setForm({ ...form, timeoutMin: v }))}
              {inputField('delays', 'Delays tested at the same time (ms)', form.delays, (v) => setForm({ ...form, delays: v }), true)}
              {inputField('feePct', 'Pump.fun fee (%)', form.feePct, (v) => setForm({ ...form, feePct: v }))}
              {inputField('cost', 'Cost per tx (SOL)', form.costPerTxSol, (v) => setForm({ ...form, costPerTxSol: v }))}
            </div>
          </Panel>

          {cov && (cov.walletTrades > 0 || cov.rejected > 0) && (
            <Panel title='Why some trades have no profit figure'>
              <ul className='text-sm text-slate-400 space-y-1'>
                <li>
                  {cov.walletTrades} wallet trades seen: {cov.onCurve} on the Pump.fun curve (simulated), {cov.onAmm} on PumpSwap (not simulated
                  yet).
                </li>
                <li>{cov.unpriced} simulated trades closed without a price because the token moved to PumpSwap before the exit.</li>
                <li>{cov.rejected} simulated entries rejected because their price looked impossible compared with the wallet fill.</li>
              </ul>
              {cov.lastMismatch && (
                <details className='mt-3'>
                  <summary className='cursor-pointer text-slate-300 text-sm'>Diagnostic of the last rejected entry</summary>
                  <pre className='text-xs text-slate-400 overflow-x-auto mt-2'>{JSON.stringify(cov.lastMismatch, null, 2)}</pre>
                </details>
              )}
            </Panel>
          )}

          <details className='panel help'>
            <summary className='panel-body'>How does this work, and how do I read the results?</summary>
            <div className='panel-body' style={{ paddingTop: 0 }}>
              <ol>
                <li>The bot watches the followed wallet through Helius. It never touches your money and never needs a private key.</li>
                <li>
                  When the wallet buys a Pump.fun token, the bot waits for each delay you configured, reads the real price at that moment and
                  computes what your buy would have cost, fees included.
                </li>
                <li>When the wallet sells, the bot simulates your sell after the same delay. Otherwise the position closes after the max hold time.</li>
                <li>
                  A delay is the time between the bot seeing the trade and your transaction landing. Real delay behind the wallet is roughly the
                  detection lag plus the delay of the row you look at.
                </li>
                <li>
                  200 ms is a theoretical best case, 1000 ms an optimized setup, 3000 ms typical for a simple bot. Trust the row that matches your
                  real setup.
                </li>
                <li>
                  If PnL is positive at 200 ms but negative at 1000 and 3000 ms, the edge disappears with realistic latency. You need at least 50
                  closed trades per row.
                </li>
                <li>
                  Each wallet trade is replayed once per delay, so one trade gives several rows. Detection lag has about one second of precision.
                </li>
              </ol>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
