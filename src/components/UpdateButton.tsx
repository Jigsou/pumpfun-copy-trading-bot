import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';
const RESUME_KEY = 'pumpResumeAfterUpdate';
const LABELS: Record<string, string> = { main: 'Stable (main)', dev: 'Test (dev)' };

type Phase = 'idle' | 'working' | 'restarting' | 'done' | 'error';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function buildStartMessage(): Record<string, unknown> | null {
  const apiKey = (localStorage.getItem('demoHeliusKey') ?? '').trim();
  const wallets = readJson<Array<{ address: string; label: string }>>('demoWallets', []);
  const form = readJson<Record<string, string>>('demoForm', {});
  if (apiKey.length < 8 || !Array.isArray(wallets) || wallets.length === 0) return null;
  const delays = String(form.delays ?? '1000,2000,3000')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
  return {
    type: 'demo_start',
    apiKey,
    wallets,
    settings: {
      buySol: Number(form.buySol ?? 0.1),
      delaysMs: delays,
      feePct: Number(form.feePct ?? 1),
      costPerTxSol: Number(form.costPerTxSol ?? 0.001),
      timeoutMin: Number(form.timeoutMin ?? 30),
      maxPremiumPct: Number(localStorage.getItem('demoMaxPremium') ?? 0),
      minWalletBuySol: Number(localStorage.getItem('demoMinBuy') ?? 0),
    },
  };
}

export const UpdateButton: React.FC = () => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string>('');
  const [head, setHead] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [channels, setChannels] = useState<string[]>(['main', 'dev']);
  const wsRef = useRef<WebSocket | null>(null);
  const phaseRef = useRef<Phase>('idle');
  const runningRef = useRef(false);
  const resumedRef = useRef(false);
  const pendingRef = useRef<Record<string, unknown>>({ type: 'app_update' });

  const go = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    if (phase !== 'restarting') return undefined;
    const t = setTimeout(() => {
      if (phaseRef.current === 'restarting') {
        go('error');
        setMessage('The local server did not come back within 90 seconds. Check the terminal that runs npm start.');
      }
    }, 90000);
    return () => clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        if (phaseRef.current === 'restarting') {
          go('done');
          setMessage('Server back online.');
        }
        ws.send(JSON.stringify({ type: 'app_version' }));
        ws.send(JSON.stringify({ type: 'demo_hello' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'app_version') {
            setHead(msg.head ?? null);
            setBranch(msg.branch ?? null);
            if (Array.isArray(msg.channels) && msg.channels.length) setChannels(msg.channels);
            if (phaseRef.current === 'restarting' || sessionStorage.getItem(RESUME_KEY)) {
              go('done');
              setMessage('Server back online on ' + (msg.branch ?? '?') + ' ' + (msg.head ?? '') + '.');
            }
          } else if (msg.type === 'demo_state' && msg.state) {
            runningRef.current = !!msg.state.running;
            const pending = sessionStorage.getItem(RESUME_KEY);
            if (pending && !resumedRef.current) {
              resumedRef.current = true;
              sessionStorage.removeItem(RESUME_KEY);
              let wasRunning = false;
              try {
                const info = JSON.parse(pending);
                wasRunning = !!info.wasRunning && Date.now() - Number(info.at) < 180000;
              } catch {
                wasRunning = false;
              }
              if (wasRunning && !msg.state.running) {
                const start = buildStartMessage();
                if (start) {
                  ws.send(JSON.stringify(start));
                  setMessage('Server back online. Simulation resumed (statistics restarted from zero).');
                } else {
                  setMessage('Server back online. Press Start simulation (Helius key or wallets missing).');
                }
              }
            }
          } else if (msg.type === 'app_update_progress') {
            setMessage(String(msg.message));
          } else if (msg.type === 'app_update_result') {
            if (msg.branch) setBranch(msg.branch);
            if (msg.head) setHead(msg.head);
            if (msg.needsStash) {
              const files = Array.isArray(msg.dirtyFiles) ? msg.dirtyFiles.slice(0, 8).join(', ') : '';
              const yes = window.confirm(
                'Local changes would be overwritten in: ' + files + '. Save them aside (git stash) and continue? You can restore them later with git stash pop.'
              );
              if (yes) {
                pendingRef.current = { ...pendingRef.current, stash: true };
                go('working');
                setMessage('Working...');
                ws.send(JSON.stringify({ ...pendingRef.current, confirmed: false }));
              } else {
                go('idle');
                setMessage('Cancelled. Nothing was changed.');
              }
            } else if (!msg.ok) {
              go('error');
              setMessage(String(msg.message));
            } else if (msg.needsConfirm) {
              const files = Array.isArray(msg.files) ? msg.files.slice(0, 8).join(', ') : '';
              const yes = window.confirm(String(msg.message) + (files ? ' Files: ' + files : '') + ' Continue?');
              if (yes) {
                go('working');
                setMessage('Working...');
                ws.send(JSON.stringify({ ...pendingRef.current, confirmed: true }));
              } else {
                go('idle');
                setMessage('Cancelled.');
              }
            } else if (msg.restarting) {
              resumedRef.current = false;
              sessionStorage.setItem(RESUME_KEY, JSON.stringify({ wasRunning: runningRef.current, at: Date.now() }));
              go('restarting');
              setMessage(String(msg.message));
            } else {
              go(msg.manual ? 'error' : 'done');
              setMessage(String(msg.message));
            }
          }
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
        if (phaseRef.current === 'working') {
          go('error');
          setMessage('Connection to the local server was lost during the operation. Refresh the page to see the result.');
        }
        if (!closed) timer = setTimeout(connect, 1500);
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

  const busy = phase === 'working' || phase === 'restarting';

  const send = (payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (busy) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      go('error');
      setMessage('Local server unreachable.');
      return;
    }
    pendingRef.current = payload;
    go('working');
    setMessage('Checking GitHub...');
    ws.send(JSON.stringify({ ...payload, confirmed: false }));
  };

  const changeChannel = (value: string) => {
    if (!value || value === branch) return;
    const label = LABELS[value] ?? value;
    if (!window.confirm('Switch to the ' + label + ' channel? The code changes and the server may restart.')) return;
    send({ type: 'app_switch', branch: value });
  };

  const tone = phase === 'error' ? 'text-rose-400' : phase === 'done' ? 'text-emerald-400' : 'text-slate-400';
  const options = branch && !channels.includes(branch) ? [...channels, branch] : channels;

  return (
    <div className='flex items-center gap-3'>
      {message && <span className={`text-xs max-w-[420px] ${tone}`}>{message}</span>}
      <select
        className='input'
        style={{ width: 'auto', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
        value={branch ?? ''}
        disabled={busy || !branch}
        onChange={(e) => changeChannel(e.target.value)}
        title='Code channel: Stable follows main, Test follows dev'
      >
        {!branch && <option value=''>?</option>}
        {options.map((b) => (
          <option key={b} value={b}>
            {LABELS[b] ?? b}
          </option>
        ))}
      </select>
      {head && (
        <span className='text-xs text-slate-500' title='Installed version (git commit)'>
          {head}
        </span>
      )}
      <button className='btn btn-ghost' onClick={() => send({ type: 'app_update' })} disabled={busy} title='Run git pull on the current channel and restart the local server if needed'>
        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
        {phase === 'restarting' ? 'Restarting...' : phase === 'working' ? 'Working...' : 'Update'}
      </button>
    </div>
  );
};
