import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

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
interface DemoState {
  running: boolean;
  connected: boolean;
  wallets: WalletState[];
  positions: PositionRow[];
  trades: TradeRow[];
  events: EventRow[];
  stats: StatRow[];
  skipped: number;
  lastError: { message: string; time: number } | null;
}

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
const colorOf = (v: number | null | undefined) => (v == null ? 'text-gray-400' : v >= 0 ? 'text-green-400' : 'text-red-400');

const TH = 'text-left text-gray-400 font-normal px-2 py-1';
const TD = 'px-2 py-1 border-t border-gray-700';

export const DemoPanel: React.FC = () => {
  const [serverUp, setServerUp] = useState(false);
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  let verdict = 'Start the simulator and let it run.';
  let verdictColor = 'text-gray-300';
  if (slowest && state) {
    const perDelay = Math.max(...stats.map((s) => s.n));
    if (perDelay < 50) {
      verdict = `Not enough data: ${perDelay}/50 closed trades for the delay with the most data. Do not conclude anything yet.`;
    } else if (slowest.totalPnlSol <= 0) {
      verdict = `At a ${slowest.delayMs} ms delay, the simulated PnL is negative (${fmtSol(slowest.totalPnlSol)} SOL). Copying this wallet would lose money at this delay.`;
      verdictColor = 'text-red-400';
    } else {
      verdict = `PnL is positive even at ${slowest.delayMs} ms (${fmtSol(slowest.totalPnlSol)} SOL). Promising, but keep running for several days before risking real money.`;
      verdictColor = 'text-green-400';
    }
  }

  return (
    <div className='space-y-6'>
      <div className='rounded-md border border-yellow-600 bg-yellow-900/20 p-3 text-sm text-yellow-200'>
        DEMO MODE: no private key, no transaction sent. The simulator reads the blockchain (free Helius) and computes what you would have
        paid, including fees, slippage and a delay of your choice.
      </div>

      <Card className='bg-gray-800 border-gray-700'>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='text-white'>Simulator</CardTitle>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='outline' className={serverUp ? 'text-green-400 border-green-400' : 'text-red-400 border-red-400'}>
                {serverUp ? 'Local server OK' : 'Local server unreachable'}
              </Badge>
              <Badge variant='outline' className={running ? 'text-green-400 border-green-400' : 'text-gray-400 border-gray-500'}>
                {running ? 'Simulation running' : 'Stopped'}
              </Badge>
              <Badge variant='outline' className={state?.connected ? 'text-green-400 border-green-400' : 'text-gray-400 border-gray-500'}>
                {state?.connected ? 'Helius connected' : 'Helius disconnected'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
            <div className='space-y-2 md:col-span-3'>
              <Label htmlFor='heliusKey' className='text-gray-300'>Helius API key (free, saved in this browser)</Label>
              <Input
                id='heliusKey'
                type='password'
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className='bg-gray-900 border-gray-600 text-white'
                placeholder='Paste your Helius key here'
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='buySol' className='text-gray-300'>Amount per trade (SOL)</Label>
              <Input id='buySol' value={form.buySol} onChange={(e) => setForm({ ...form, buySol: e.target.value })} className='bg-gray-900 border-gray-600 text-white' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='delays' className='text-gray-300'>Delays tested at the same time (ms)</Label>
              <Input id='delays' value={form.delays} onChange={(e) => setForm({ ...form, delays: e.target.value })} className='bg-gray-900 border-gray-600 text-white' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='timeoutMin' className='text-gray-300'>Max hold time (minutes)</Label>
              <Input id='timeoutMin' value={form.timeoutMin} onChange={(e) => setForm({ ...form, timeoutMin: e.target.value })} className='bg-gray-900 border-gray-600 text-white' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='feePct' className='text-gray-300'>Pump.fun fee (%)</Label>
              <Input id='feePct' value={form.feePct} onChange={(e) => setForm({ ...form, feePct: e.target.value })} className='bg-gray-900 border-gray-600 text-white' />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='cost' className='text-gray-300'>Cost per transaction (SOL)</Label>
              <Input id='cost' value={form.costPerTxSol} onChange={(e) => setForm({ ...form, costPerTxSol: e.target.value })} className='bg-gray-900 border-gray-600 text-white' />
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            {!running ? (
              <Button onClick={handleStart} className='bg-green-600 hover:bg-green-700'>Start simulation</Button>
            ) : (
              <Button onClick={() => send({ type: 'demo_stop' })} className='bg-red-600 hover:bg-red-700'>Stop</Button>
            )}
            <Button
              variant='outline'
              className='border-gray-600 text-gray-300 hover:bg-gray-700'
              disabled={!running}
              onClick={() => send({ type: 'demo_update_settings', settings: currentSettings() })}
            >
              Apply settings (next trades)
            </Button>
            <Button variant='outline' className='border-gray-600 text-gray-300 hover:bg-gray-700' onClick={() => send({ type: 'demo_reset' })}>
              Reset stats
            </Button>
          </div>

          {error && <div className='rounded-md border border-red-600 bg-red-900/20 p-2 text-sm text-red-300'>{error}</div>}
          {state?.lastError && (
            <div className='rounded-md border border-orange-600 bg-orange-900/20 p-2 text-xs text-orange-300'>
              Last error ({fmtTime(state.lastError.time)}): {translateText(state.lastError.message)}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className='bg-gray-800 border-gray-700'>
        <CardHeader>
          <CardTitle className='text-white'>Followed wallets</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-2'>
            <Input value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder='Address of the wallet to follow' className='bg-gray-900 border-gray-600 text-white' />
            <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder='Name (optional)' className='bg-gray-900 border-gray-600 text-white' />
            <Button onClick={handleAddWallet} className='bg-blue-600 hover:bg-blue-700'>Add</Button>
          </div>
          <p className='text-xs text-gray-400'>
            While the simulation is running, adding, removing or isolating a wallet applies immediately, without restarting.
            Always verify the address on Solscan: impersonators exist.
          </p>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr>
                  <th className={TH}>Name</th>
                  <th className={TH}>Address</th>
                  <th className={TH}>Buys</th>
                  <th className={TH}>Sells</th>
                  <th className={TH}>Last trade</th>
                  <th className={TH}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((w) => {
                  const ws = walletState(w.address);
                  return (
                    <tr key={w.address}>
                      <td className={TD}>{w.label}</td>
                      <td className={TD}>
                        <a className='text-blue-400 hover:text-blue-300' href={`https://solscan.io/account/${w.address}`} target='_blank' rel='noopener noreferrer'>
                          {short(w.address)}
                        </a>
                      </td>
                      <td className={TD}>{ws?.buys ?? 0}</td>
                      <td className={TD}>{ws?.sells ?? 0}</td>
                      <td className={TD}>{ws?.lastSeen ? fmtTime(ws.lastSeen) : '-'}</td>
                      <td className={`${TD} space-x-2`}>
                        <Button size='sm' variant='outline' className='border-gray-600 text-gray-300 hover:bg-gray-700' onClick={() => handleOnlyThis(w)}>
                          Follow only this one
                        </Button>
                        <Button size='sm' variant='outline' className='border-gray-600 text-red-300 hover:bg-gray-700' onClick={() => handleRemoveWallet(w.address)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {wallets.length === 0 && (
                  <tr>
                    <td className={TD} colSpan={6}>No wallets. Add an address above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className='bg-gray-800 border-gray-700'>
        <CardHeader>
          <CardTitle className='text-white'>Results by execution delay</CardTitle>
        </CardHeader>
        <CardContent className='space-y-3'>
          <p className={`text-sm ${verdictColor}`}>{verdict}</p>
          <div className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr>
                  <th className={TH}>Delay</th>
                  <th className={TH}>Closed trades</th>
                  <th className={TH}>Win rate</th>
                  <th className={TH}>Total PnL (SOL)</th>
                  <th className={TH}>Average PnL</th>
                  <th className={TH}>Price paid vs target (median)</th>
                  <th className={TH}>Unpriced</th>
                </tr>
              </thead>
              <tbody>
                {stats.map((s) => (
                  <tr key={s.delayMs}>
                    <td className={TD}>{s.delayMs} ms</td>
                    <td className={TD}>{s.n}</td>
                    <td className={TD}>{s.winRate == null ? '-' : `${(s.winRate * 100).toFixed(0)} %`}</td>
                    <td className={`${TD} ${colorOf(s.n ? s.totalPnlSol : null)}`}>{s.n ? fmtSol(s.totalPnlSol) : '-'}</td>
                    <td className={`${TD} ${colorOf(s.avgPnlPct)}`}>{fmtPct(s.avgPnlPct)}</td>
                    <td className={TD}>{fmtPct(s.medianSlipPct)}</td>
                    <td className={TD}>{s.unpriced}</td>
                  </tr>
                ))}
                {stats.length === 0 && (
                  <tr>
                    <td className={TD} colSpan={7}>No data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className='text-xs text-gray-400'>
            Total: {totalN} simulated trades. Skipped (PumpSwap, finished curve or stale): {state?.skipped ?? 0}. You need at least 50 trades per
            delay before drawing any conclusion.
          </p>
        </CardContent>
      </Card>

      <div className='grid grid-cols-1 xl:grid-cols-2 gap-6'>
        <Card className='bg-gray-800 border-gray-700'>
          <CardHeader>
            <CardTitle className='text-white'>Open simulated positions ({state?.positions.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr>
                  <th className={TH}>Wallet</th>
                  <th className={TH}>Token</th>
                  <th className={TH}>Delay</th>
                  <th className={TH}>Vs target</th>
                  <th className={TH}>Time</th>
                </tr>
              </thead>
              <tbody>
                {(state?.positions ?? []).map((p) => (
                  <tr key={p.key}>
                    <td className={TD}>{p.label}</td>
                    <td className={TD}>
                      <a className='text-blue-400 hover:text-blue-300' href={`https://solscan.io/token/${p.mint}`} target='_blank' rel='noopener noreferrer'>
                        {short(p.mint)}
                      </a>
                    </td>
                    <td className={TD}>{p.delayMs} ms</td>
                    <td className={`${TD} ${colorOf(-p.slipVsTargetPct)}`}>{fmtPct(p.slipVsTargetPct)}</td>
                    <td className={TD}>{fmtTime(p.openedAt)}</td>
                  </tr>
                ))}
                {(state?.positions.length ?? 0) === 0 && (
                  <tr>
                    <td className={TD} colSpan={5}>No open positions.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className='bg-gray-800 border-gray-700'>
          <CardHeader>
            <CardTitle className='text-white'>Followed wallet trades</CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            <table className='w-full text-sm'>
              <thead>
                <tr>
                  <th className={TH}>Time</th>
                  <th className={TH}>Wallet</th>
                  <th className={TH}>Side</th>
                  <th className={TH}>Token</th>
                  <th className={TH}>SOL</th>
                  <th className={TH}>Type</th>
                </tr>
              </thead>
              <tbody>
                {(state?.events ?? []).map((ev) => (
                  <tr key={`${ev.signature}-${ev.wallet}`}>
                    <td className={TD}>{fmtTime(ev.time)}</td>
                    <td className={TD}>{ev.label}</td>
                    <td className={`${TD} ${ev.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>{ev.side === 'buy' ? 'Buy' : 'Sell'}</td>
                    <td className={TD}>
                      <a className='text-blue-400 hover:text-blue-300' href={`https://solscan.io/tx/${ev.signature}`} target='_blank' rel='noopener noreferrer'>
                        {short(ev.mint)}
                      </a>
                    </td>
                    <td className={TD}>{ev.sol.toFixed(3)}</td>
                    <td className={TD}>{ev.venue === 'pump' ? 'Pump.fun' : 'PumpSwap (not simulated)'}</td>
                  </tr>
                ))}
                {(state?.events.length ?? 0) === 0 && (
                  <tr>
                    <td className={TD} colSpan={6}>Waiting for a wallet trade...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className='bg-gray-800 border-gray-700'>
        <CardHeader>
          <CardTitle className='text-white'>Closed simulated trades</CardTitle>
        </CardHeader>
        <CardContent className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr>
                <th className={TH}>Time</th>
                <th className={TH}>Wallet</th>
                <th className={TH}>Token</th>
                <th className={TH}>Delay</th>
                <th className={TH}>Vs target</th>
                <th className={TH}>Held</th>
                <th className={TH}>Exit</th>
                <th className={TH}>PnL (SOL)</th>
                <th className={TH}>PnL</th>
              </tr>
            </thead>
            <tbody>
              {(state?.trades ?? []).slice(0, 50).map((t, i) => (
                <tr key={`${t.time}-${t.mint}-${t.delayMs}-${i}`}>
                  <td className={TD}>{fmtTime(t.time)}</td>
                  <td className={TD}>{t.label}</td>
                  <td className={TD}>
                    <a className='text-blue-400 hover:text-blue-300' href={`https://solscan.io/token/${t.mint}`} target='_blank' rel='noopener noreferrer'>
                      {short(t.mint)}
                    </a>
                  </td>
                  <td className={TD}>{t.delayMs} ms</td>
                  <td className={TD}>{fmtPct(t.slipVsTargetPct)}</td>
                  <td className={TD}>{t.heldSec} s</td>
                  <td className={TD}>{translateText(t.reason)}</td>
                  <td className={`${TD} ${colorOf(t.pnlSol)}`}>{fmtSol(t.pnlSol)}</td>
                  <td className={`${TD} ${colorOf(t.pnlPct)}`}>{fmtPct(t.pnlPct)}</td>
                </tr>
              ))}
              {(state?.trades.length ?? 0) === 0 && (
                <tr>
                  <td className={TD} colSpan={9}>No closed trades yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};
