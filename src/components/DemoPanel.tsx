import React, { useState } from 'react';
import { Activity, ChevronRight, ExternalLink, Play, RotateCcw, Settings, ShieldCheck, Square, Wallet } from 'lucide-react';
import { useDemoServer, useDemoSettings } from '@/hooks/useDemo';
import { settingsEqual, validateForm } from '@/lib/demoStore';
import { openSettings } from '@/lib/uiEvents';
import { fmtMs, fmtPct, fmtSol, fmtTime, groupByOp, short, tone, translateText } from '@/lib/demoShared';
import type { PositionRow, TradeRow } from '@/lib/demoShared';
import { PremiumAnalysis } from './PremiumAnalysis';

type TabKey = 'feed' | 'open' | 'closed';

interface WalletStats {
  slowestDelayMs: number | null;
  closedOps: number;
  openOps: number;
  n: number;
  unpriced: number;
  wins: number;
  winRate: number | null;
  totalPnlSol: number;
  pnlWithoutBest: number | null;
  avgPnlPct: number | null;
  medianSlipPct: number | null;
}

const SKIP_LABELS: Record<string, string> = {
  stale: 'Transaction already too old when fetched',
  late: 'Price read too long after the planned delay',
  txNotFound: 'Transaction not found',
  curveUnavailable: 'Curve account unavailable',
  curveQuoteNotSol: 'Coin paired with another coin (not SOL)',
  ammPoolUnknown: 'PumpSwap pool not identified',
  ammQuoteNotSol: 'PumpSwap pair is not SOL',
  ammUnreadable: 'PumpSwap pool unreadable',
  notATrade: 'Notifications ignored (not a Pump trade)',
  routed: 'Trade routed through another exchange (not simulated)',
};

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

interface ToggleProps {
  open: boolean;
  label: string;
  onClick: () => void;
}
const Toggle: React.FC<ToggleProps> = ({ open, label, onClick }) => (
  <button type='button' className='icon-btn' aria-expanded={open} aria-label={label} title={label} onClick={onClick}>
    <ChevronRight className='w-4 h-4' style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
  </button>
);

const fmtRange = (values: number[], fmt: (v: number) => string): string => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? fmt(lo) : `${fmt(lo)} to ${fmt(hi)}`;
};

const bySlowest = <T extends { delayMs: number }>(rows: T[]): T[] => [...rows].sort((a, b) => a.delayMs - b.delayMs);

export const DemoPanel: React.FC = () => {
  const { state, serverUp, error, setError, send } = useDemoServer();
  const settings = useDemoSettings();
  const [tab, setTab] = useState<TabKey>('feed');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleOp = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const running = !!state?.running;
  const v = validateForm(settings.form);
  const hasKey = settings.apiKey.trim().length >= 8;
  const hasWallets = settings.wallets.length > 0;
  const applied = state?.settings;
  const dirty = running && v.ok && !!v.settings && !!applied && !settingsEqual(v.settings, applied);

  const handleStart = () => {
    setError(null);
    if (!hasKey) {
      setError('Add your Helius API key in Options first (free at helius.dev).');
      openSettings('connection');
      return;
    }
    if (!hasWallets) {
      setError('Add at least one wallet to follow in Options.');
      openSettings('wallets');
      return;
    }
    if (!v.ok || !v.settings) {
      const tradeKeys = ['buySol', 'delays', 'feePct', 'costPerTxSol', 'timeoutMin'] as const;
      setError('Some options are invalid. Fix the highlighted fields in Options.');
      openSettings(tradeKeys.some((k) => v.errors[k]) ? 'trade' : 'rules');
      return;
    }
    send({ type: 'demo_start', apiKey: settings.apiKey.trim(), settings: v.settings, wallets: settings.wallets });
  };

  const handleApply = () => {
    if (v.ok && v.settings) send({ type: 'demo_update_settings', settings: v.settings });
  };

  const walletState = (address: string) => state?.wallets.find((w) => w.address === address);
  const stats = state?.stats ?? [];
  const slowest = stats.length ? stats[stats.length - 1] : null;
  const positions = state?.positions ?? [];
  const events = state?.events ?? [];
  const trades = state?.trades ?? [];
  const lat = state?.latency;
  const cov = state?.coverage;
  const clockWarning = !!lat && lat.medianChainLagMs != null && lat.medianChainLagMs < 0;
  const shown = applied ?? v.settings;
  const skipRows = Object.entries(state?.skipReasons ?? {}).filter(([, n]) => n > 0);
  const routedTrades = (cov as unknown as { routed?: number } | undefined)?.routed ?? 0;

  const ops = state?.ops;
  const openOps = ops?.openOps ?? new Set(positions.map((p) => p.opId ?? p.key)).size;
  const openScenarios = ops?.openScenarios ?? positions.length;
  const closedOps = ops?.closedOps ?? trades.length;
  const closedScenarios = ops?.closedScenarios ?? trades.length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

  const openGroups = groupByOp<PositionRow>(positions, (p) => p.key)
    .map((g) => ({ ...g, rows: bySlowest(g.rows) }))
    .reverse();
  const closedGroups = groupByOp<TradeRow>(trades, (t, i) => `${t.time}-${t.mint}-${t.delayMs}-${i}`).map((g) => ({ ...g, rows: bySlowest(g.rows) }));

  let verdict = 'Start the simulator and let it run.';
  let verdictClass = 'info';
  if (slowest && state) {
    const perDelay = Math.max(...stats.map((s) => s.n));
    if (perDelay < 50) {
      verdict = `Not enough data: ${perDelay}/50 closed operations for the scenario with the most data. Do not conclude anything yet. Scenarios of the same operation are not independent.`;
      verdictClass = 'warn';
    } else if (slowest.totalPnlSol <= 0) {
      verdict = `At a ${slowest.delayMs} ms delay, the simulated PnL is negative (${fmtSol(slowest.totalPnlSol)} SOL). Copying this wallet would lose money at this delay.`;
      verdictClass = 'error';
    } else {
      verdict = `PnL is positive even at ${slowest.delayMs} ms (${fmtSol(slowest.totalPnlSol)} SOL). Promising, but keep running for several days before risking real money.`;
      verdictClass = 'good';
    }
  }

  const tabButton = (key: TabKey, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`px-3 py-1.5 rounded-md text-sm ${tab === key ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
    >
      {label}
    </button>
  );

  const step = (done: boolean, text: string, action?: () => void, actionLabel?: string) => (
    <li className='flex items-center gap-3 text-sm'>
      <span className={`chip ${done ? 'good' : 'warn'}`}>{done ? 'Done' : 'To do'}</span>
      <span className={done ? 'text-slate-400' : ''}>{text}</span>
      {!done && action && (
        <button className='btn btn-ghost ml-auto' onClick={action}>
          {actionLabel}
        </button>
      )}
    </li>
  );

  const tokenLink = (mint: string) => (
    <a className='link' href={`https://solscan.io/token/${mint}`} target='_blank' rel='noopener noreferrer'>
      {short(mint)}
      <ExternalLink className='w-3 h-3' />
    </a>
  );

  const pnlChip = (pct: number | null) => <span className={`chip ${pct == null ? 'neutral' : pct >= 0 ? 'good' : 'bad'}`}>{fmtPct(pct)}</span>;

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
              Paper: no key, no transaction
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
      {dirty && (
        <div className='alert info flex flex-wrap items-center justify-between gap-3'>
          <span>Your options changed but are not applied to the running simulation yet. Operations already open keep their original scenarios.</span>
          <span className='flex gap-2'>
            <button className='btn btn-ghost' onClick={() => openSettings()}>
              Review
            </button>
            <button className='btn btn-primary' onClick={handleApply}>
              Apply now
            </button>
          </span>
        </div>
      )}

      {!running && (!hasKey || !hasWallets) && (
        <Panel title='Get started' icon={<Settings className='w-4 h-4 text-slate-400' />}>
          <ul className='space-y-3'>
            {step(hasKey, 'Add your free Helius API key', () => openSettings('connection'), 'Open options')}
            {step(hasWallets, 'Add the wallet you want to follow', () => openSettings('wallets'), 'Open options')}
            {step(false, 'Press Start simulation, then let it run for hours')}
          </ul>
        </Panel>
      )}

      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Stat
          label={slowest ? `Net PnL at ${slowest.delayMs} ms` : 'Net PnL'}
          value={slowest && slowest.n ? `${fmtSol(slowest.totalPnlSol)} SOL` : '-'}
          sub='Slowest scenario tested'
          valueClass={tone(slowest && slowest.n ? slowest.totalPnlSol : null)}
        />
        <Stat
          label='Win rate'
          value={slowest && slowest.winRate != null ? `${(slowest.winRate * 100).toFixed(0)} %` : '-'}
          sub={slowest ? `at ${slowest.delayMs} ms` : 'No data yet'}
        />
        <Stat label='Closed operations' value={String(closedOps)} sub={`${plural(closedScenarios, 'scenario')} - ${state?.skipped ?? 0} skipped`} />
        <Stat label='Open operations' value={String(openOps)} sub={`${plural(openScenarios, 'scenario')} - ${state?.wallets.length ?? 0} wallet(s)`} />
        <Stat label='Detection lag' value={fmtMs(lat?.medianChainLagMs)} sub={`median - avg ${fmtMs(lat?.avgChainLagMs)}`} />
        <Stat label='Processing time' value={fmtMs(lat?.avgFetchMs)} sub={`average - ${lat?.samples ?? 0} samples`} />
      </div>

      <div className={`alert ${verdictClass}`}>{verdict}</div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        <div className='lg:col-span-8 space-y-5'>
          <Panel title='Results by scenario (execution delay)' icon={<Activity className='w-4 h-4 text-slate-400' />}>
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
              You need at least 50 closed operations per scenario, and several different tokens, before drawing any conclusion. The scenarios of one operation copy the same
              trade, so they are alternatives, not independent observations, and their results must not be added together.
            </p>
          </Panel>

          <PremiumAnalysis premium={state?.premium} filtered={state?.filtered} settings={applied} />

          <section className='panel'>
            <header className='panel-head'>
              <div className='inline-flex flex-wrap gap-1 p-1 rounded-lg border border-white/10'>
                {tabButton('feed', `Wallet trades (${events.length})`)}
                {tabButton('open', `Open positions (${openScenarios})`)}
                {tabButton('closed', `Closed trades (${closedScenarios})`)}
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
                        <span className='chip neutral'>{ev.venue === 'pump' ? 'Pump.fun' : ev.venue === 'routed' ? 'Routed' : 'PumpSwap'}</span>
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
                        <th />
                        <th>Wallet</th>
                        <th>Token</th>
                        <th>Scenarios</th>
                        <th>Vs target</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openGroups.map((g) => {
                        const first = g.rows[0];
                        const multi = g.rows.length > 1;
                        const key = `open:${g.id}`;
                        const isOpen = expanded.has(key);
                        const total = first.scenarioTotal ?? g.rows.length;
                        const label = multi ? `${g.rows.length}/${total} scenarios` : total > 1 ? `${first.delayMs} ms - 1/${total}` : `${first.delayMs} ms`;
                        return (
                          <React.Fragment key={key}>
                            <tr>
                              <td style={{ width: 36 }}>{multi && <Toggle open={isOpen} label={isOpen ? 'Hide the scenarios' : 'Show the scenarios'} onClick={() => toggleOp(key)} />}</td>
                              <td>{first.label}</td>
                              <td>{tokenLink(first.mint)}</td>
                              <td>{label}</td>
                              <td className={multi ? '' : tone(-first.slipVsTargetPct)}>
                                {multi ? fmtRange(g.rows.map((r) => r.slipVsTargetPct), fmtPct) : fmtPct(first.slipVsTargetPct)}
                              </td>
                              <td>{fmtTime(Math.min(...g.rows.map((r) => r.openedAt)))}</td>
                            </tr>
                            {multi &&
                              isOpen &&
                              g.rows.map((r) => (
                                <tr key={r.key} style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <td />
                                  <td colSpan={2} className='text-slate-400 text-xs'>
                                    Scenario
                                  </td>
                                  <td>{r.delayMs} ms</td>
                                  <td className={tone(-r.slipVsTargetPct)}>{fmtPct(r.slipVsTargetPct)}</td>
                                  <td>{fmtTime(r.openedAt)}</td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}
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
                        <th />
                        <th>Time</th>
                        <th>Wallet</th>
                        <th>Token</th>
                        <th>Scenarios</th>
                        <th>Vs target</th>
                        <th>Held</th>
                        <th>Exit</th>
                        <th>PnL (SOL)</th>
                        <th>PnL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {closedGroups.slice(0, 50).map((g) => {
                        const first = g.rows[0];
                        const multi = g.rows.length > 1;
                        const key = `closed:${g.id}`;
                        const isOpen = expanded.has(key);
                        if (!multi) {
                          return (
                            <tr key={key}>
                              <td />
                              <td>{fmtTime(first.time)}</td>
                              <td>{first.label}</td>
                              <td>{tokenLink(first.mint)}</td>
                              <td>{first.delayMs} ms</td>
                              <td>{fmtPct(first.slipVsTargetPct)}</td>
                              <td>{first.heldSec} s</td>
                              <td>{translateText(first.reason)}</td>
                              <td className={tone(first.pnlSol)}>{fmtSol(first.pnlSol)}</td>
                              <td>{pnlChip(first.pnlPct)}</td>
                            </tr>
                          );
                        }
                        const pcts = g.rows.map((r) => r.pnlPct).filter((x): x is number => x != null);
                        const reasons = [...new Set(g.rows.map((r) => translateText(r.reason)))];
                        return (
                          <React.Fragment key={key}>
                            <tr>
                              <td style={{ width: 36 }}>
                                <Toggle open={isOpen} label={isOpen ? 'Hide the scenarios' : 'Show the scenarios'} onClick={() => toggleOp(key)} />
                              </td>
                              <td>{fmtTime(Math.max(...g.rows.map((r) => r.time)))}</td>
                              <td>{first.label}</td>
                              <td>{tokenLink(first.mint)}</td>
                              <td>{g.rows.length} scenarios</td>
                              <td>{fmtRange(g.rows.map((r) => r.slipVsTargetPct), fmtPct)}</td>
                              <td>{fmtRange(g.rows.map((r) => r.heldSec), (x) => `${x} s`)}</td>
                              <td>{reasons.length === 1 ? reasons[0] : 'Mixed'}</td>
                              <td />
                              <td>{pcts.length ? <span className='chip neutral'>{fmtRange(pcts, fmtPct)}</span> : pnlChip(null)}</td>
                            </tr>
                            {isOpen &&
                              g.rows.map((r, i) => (
                                <tr key={`${key}:${r.delayMs}:${i}`} style={{ background: 'rgba(255,255,255,0.03)' }}>
                                  <td />
                                  <td colSpan={3} className='text-slate-400 text-xs'>
                                    Scenario closed {fmtTime(r.time)}
                                  </td>
                                  <td>{r.delayMs} ms</td>
                                  <td>{fmtPct(r.slipVsTargetPct)}</td>
                                  <td>{r.heldSec} s</td>
                                  <td>{translateText(r.reason)}</td>
                                  <td className={tone(r.pnlSol)}>{fmtSol(r.pnlSol)}</td>
                                  <td>{pnlChip(r.pnlPct)}</td>
                                </tr>
                              ))}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                  {trades.length === 0 && <div className='empty'>No closed trades yet.</div>}
                </div>
              )}
            </div>
          </section>
        </div>

        <div className='lg:col-span-4 space-y-5'>
          <Panel
            title='Followed wallets'
            icon={<Wallet className='w-4 h-4 text-slate-400' />}
            right={
              <button className='btn btn-ghost' onClick={() => openSettings('wallets')}>
                Manage
              </button>
            }
          >
            <ul>
              {settings.wallets.map((w) => {
                const ws = walletState(w.address);
                const wst = (ws as unknown as { stats?: WalletStats } | undefined)?.stats;
                const copied = wst ? wst.closedOps + wst.openOps : 0;
                return (
                  <li key={w.address} className='wallet-row'>
                    <div className='avatar'>{w.label.slice(0, 2).toUpperCase()}</div>
                    <div className='min-w-0 flex-1'>
                      <div className='truncate font-medium'>{w.label}</div>
                      <a className='link text-xs' href={`https://pump.fun/profile/${w.address}`} target='_blank' rel='noopener noreferrer' title='Open this trader on Pump.fun'>
                        {short(w.address)}
                        <ExternalLink className='w-3 h-3' />
                      </a>
                      <div className='flex flex-wrap gap-1.5 mt-1.5'>
                        <span className='chip good'>{ws?.buys ?? 0} buys</span>
                        <span className='chip bad'>{ws?.sells ?? 0} sells</span>
                        <span className='chip neutral'>{ws?.lastSeen ? fmtTime(ws.lastSeen) : 'no trade yet'}</span>
                      </div>
                      {wst && copied > 0 && (
                        <dl className='text-xs grid grid-cols-2 gap-y-1 mt-2'>
                          <dt className='text-slate-400'>Operations</dt>
                          <dd className='text-right'>
                            {wst.closedOps} closed - {wst.openOps} open
                          </dd>
                          <dt className='text-slate-400'>Simulated buys</dt>
                          <dd className='text-right'>
                            {copied} of {ws?.buys ?? 0}
                          </dd>
                          <dt className='text-slate-400'>Win rate{wst.slowestDelayMs != null ? ` (${wst.slowestDelayMs} ms)` : ''}</dt>
                          <dd className='text-right'>{wst.winRate == null ? '-' : `${Math.round(wst.winRate * 100)} % (${wst.wins}/${wst.n})`}</dd>
                          <dt className='text-slate-400'>Net PnL</dt>
                          <dd className={`text-right ${tone(wst.n ? wst.totalPnlSol : null)}`}>{wst.n ? `${fmtSol(wst.totalPnlSol)} SOL` : '-'}</dd>
                          <dt className='text-slate-400'>Without best trade</dt>
                          <dd className={`text-right ${tone(wst.pnlWithoutBest)}`}>{wst.pnlWithoutBest == null ? '-' : `${fmtSol(wst.pnlWithoutBest)} SOL`}</dd>
                          <dt className='text-slate-400'>Avg PnL per trade</dt>
                          <dd className={`text-right ${tone(wst.avgPnlPct)}`}>{fmtPct(wst.avgPnlPct)}</dd>
                          <dt className='text-slate-400'>Paid vs wallet (median)</dt>
                          <dd className='text-right'>{fmtPct(wst.medianSlipPct)}</dd>
                        </dl>
                      )}
                      {wst && copied > 0 && wst.n < 50 && (
                        <p className='text-xs text-slate-400 mt-1'>Only {wst.n} closed trades at this scenario: too few to conclude anything about this trader.</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {!hasWallets && <div className='empty'>No wallets. Open Manage to add one.</div>}
          </Panel>

          <Panel
            title={applied ? 'Active settings' : 'Settings used at start'}
            icon={<Settings className='w-4 h-4 text-slate-400' />}
            right={
              <button className='btn btn-ghost' onClick={() => openSettings('trade')}>
                Change
              </button>
            }
          >
            {shown ? (
              <dl className='text-sm grid grid-cols-2 gap-y-2'>
                <dt className='text-slate-400'>Amount per trade</dt>
                <dd className='text-right'>{shown.buySol} SOL</dd>
                <dt className='text-slate-400'>Scenarios</dt>
                <dd className='text-right'>
                  {shown.delaysMs.length}: {shown.delaysMs.join(' / ')} ms
                </dd>
                <dt className='text-slate-400'>Pump.fun fee</dt>
                <dd className='text-right'>{shown.feePct} %</dd>
                <dt className='text-slate-400'>Max hold</dt>
                <dd className='text-right'>{shown.timeoutMin} min</dd>
                <dt className='text-slate-400'>Max premium</dt>
                <dd className='text-right'>{(shown.maxPremiumPct ?? 0) > 0 ? `${shown.maxPremiumPct} %` : 'off'}</dd>
                <dt className='text-slate-400'>Min wallet buy</dt>
                <dd className='text-right'>{(shown.minWalletBuySol ?? 0) > 0 ? `${shown.minWalletBuySol} SOL` : 'off'}</dd>
              </dl>
            ) : (
              <div className='empty'>Some options are invalid. Open Change to fix them.</div>
            )}
          </Panel>

          {cov && (cov.walletTrades > 0 || cov.rejected > 0) && (
            <Panel title='Coverage and skipped trades'>
              <ul className='text-sm text-slate-400 space-y-1'>
                <li>
                  {cov.walletTrades} wallet trades seen: {cov.onCurve} on the Pump.fun curve, {cov.onAmm} on PumpSwap.
                </li>
                {routedTrades > 0 && <li>{routedTrades} went through a router or another exchange and are not simulated.</li>}
                {cov.distinctTokens != null && (
                  <li>
                    {cov.distinctTokens} distinct tokens traded by the wallets, {cov.usableTokens ?? 0} with at least one valid simulated entry.
                  </li>
                )}
                <li>{cov.unpriced} simulated trades closed without a price.</li>
                <li>{cov.rejected} simulated entries rejected because their price looked impossible compared with the wallet fill.</li>
              </ul>
              {skipRows.length > 0 && (
                <details className='mt-3'>
                  <summary className='cursor-pointer text-slate-300 text-sm'>Why trades were skipped</summary>
                  <ul className='text-xs text-slate-400 mt-2 space-y-1'>
                    {skipRows.map(([key, n]) => (
                      <li key={key} className='flex justify-between gap-3'>
                        <span>{SKIP_LABELS[key] ?? key}</span>
                        <span className='tabular-nums'>{n}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
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
                  When the wallet buys a token, that is one operation. For each scenario (a delay you configured), the bot waits, reads the real price at that moment and
                  computes what your buy would have cost, fees included.
                </li>
                <li>When the wallet sells, the bot simulates your sell after the same delay. Otherwise the position closes after the max hold time.</li>
                <li>A scenario is the time between the bot seeing the trade and your simulated entry. Longer delays usually mean a worse price.</li>
                <li>Click the arrow next to an operation to see each of its scenarios. Scenarios of one operation are alternatives for the same trade, never separate orders.</li>
                <li>Positive results at the slowest scenario, over many different tokens and several days, are the only ones worth trusting.</li>
              </ol>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
