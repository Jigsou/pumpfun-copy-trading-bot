import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';
const RESUME_KEY = 'pumpResumeAfterUpdate';

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
  const wsRef = useRef<WebSocket | null>(null);
  const runningRef = useRef(false);
  const resumedRef = useRef(false);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'app_version' }));
        ws.send(JSON.stringify({ type: 'demo_hello' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'app_version') {
            setHead(msg.head ?? null);
            if (sessionStorage.getItem(RESUME_KEY)) {
              setPhase('done');
              setMessage('Server back online on ' + (msg.head ?? 'new version') + '.');
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
            if (!msg.ok) {
              setPhase('error');
              setMessage(String(msg.message));
            } else if (msg.needsConfirm) {
              const files = Array.isArray(msg.files) ? msg.files.slice(0, 8).join(', ') : '';
              const yes = window.confirm(String(msg.message) + (files ? ' Files: ' + files : '') + ' Continue?');
              if (yes) {
                setPhase('working');
                setMessage('Updating...');
                ws.send(JSON.stringify({ type: 'app_update', confirmed: true }));
              } else {
                setPhase('idle');
                setMessage('Update cancelled.');
              }
            } else if (msg.restarting) {
              resumedRef.current = false;
              sessionStorage.setItem(RESUME_KEY, JSON.stringify({ wasRunning: runningRef.current, at: Date.now() }));
              setHead(msg.head ?? null);
              setPhase('restarting');
              setMessage(String(msg.message));
            } else {
              setHead(msg.head ?? null);
              setPhase(msg.manual ? 'error' : 'done');
              setMessage(String(msg.message));
            }
          }
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
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

  const click = () => {
    const ws = wsRef.current;
    if (busy) return;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setPhase('error');
      setMessage('Local server unreachable.');
      return;
    }
    setPhase('working');
    setMessage('Checking GitHub...');
    ws.send(JSON.stringify({ type: 'app_update', confirmed: false }));
  };

  const tone = phase === 'error' ? 'text-rose-400' : phase === 'done' ? 'text-emerald-400' : 'text-slate-400';

  return (
    <div className='flex items-center gap-3'>
      {message && <span className={`text-xs max-w-[420px] ${tone}`}>{message}</span>}
      {head && <span className='text-xs text-slate-500' title='Installed version (git commit)'>{head}</span>}
      <button className='btn btn-ghost' onClick={click} disabled={busy} title='Run git pull and restart the local server if needed'>
        <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
        {phase === 'restarting' ? 'Restarting...' : phase === 'working' ? 'Updating...' : 'Update'}
      </button>
    </div>
  );
};
