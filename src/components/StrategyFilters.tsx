import React, { useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';

interface Bucket {
  label: string;
  n: number;
  winRate: number | null;
  avgPnlPct: number | null;
  medianPnlPct: number | null;
  totalPnlSol: number;
}
interface Premium {
  delayMs: number | null;
  buckets: Bucket[];
}
interface Filtered {
  tooSmall: number;
  premiumTooHigh: number;
}
interface Active {
  maxPremiumPct: number;
  minWalletBuySol: number;
}

const pc = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`);
const sol = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(4)}`);
const tone = (v: number | null | undefined) => (v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-400' : 'text-rose-400');

export const StrategyFilters: React.FC = () => {
  const [maxPremium, setMaxPremium] = useState<string>(() => localStorage.getItem('demoMaxPremium') ?? '0');
  const [minBuy, setMinBuy] = useState<string>(() => localStorage.getItem('demoMinBuy') ?? '0');
  const [premium, setPremium] = useState<Premium | null>(null);
  const [filtered, setFiltered] = useState<Filtered | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [applied, setApplied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const syncedRef = useRef(false);
  const valuesRef = useRef({ maxPremium, minBuy });

  useEffect(() => {
    valuesRef.current = { maxPremium, minBuy };
  }, [maxPremium, minBuy]);

  const push = (ws: WebSocket | null): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(
      JSON.stringify({
        type: 'demo_update_settings',
        settings: { maxPremiumPct: Number(valuesRef.current.maxPremium), minWalletBuySol: Number(valuesRef.current.minBuy) },
      })
    );
    return true;
  };

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'demo_hello' }));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type !== 'demo_state' || !msg.state) return;
          const st = msg.state;
          setPremium((st.premium as Premium) ?? null);
          setFiltered((st.filtered as Filtered) ?? null);
          const s = st.settings;
          if (s) {
            setActive({ maxPremiumPct: Number(s.maxPremiumPct ?? 0), minWalletBuySol: Number(s.minWalletBuySol ?? 0) });
            if (!syncedRef.current) {
              syncedRef.current = true;
              const v = valuesRef.current;
              if (Number(v.maxPremium) !== Number(s.maxPremiumPct ?? 0) || Number(v.minBuy) !== Number(s.minWalletBuySol ?? 0)) push(ws);
            }
          }
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
        syncedRef.current = false;
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

  const apply = () => {
    localStorage.setItem('demoMaxPremium', maxPremium);
    localStorage.setItem('demoMinBuy', minBuy);
    if (push(wsRef.current)) {
      setApplied(true);
      setTimeout(() => setApplied(false), 1500);
    }
  };

  const total = premium ? premium.buckets.reduce((a, b) => a + b.n, 0) : 0;

  return (
    <section className='panel'>
      <header className='panel-head'>
        <div className='flex items-center gap-2 text-slate-200'>
          <SlidersHorizontal className='w-4 h-4 text-slate-400' />
          <h2 className='panel-title'>Entry rules and premium analysis</h2>
        </div>
      </header>
      <div className='panel-body space-y-4'>
        <div className='grid grid-cols-1 md:grid-cols-3 gap-3 items-end'>
          <div className='field'>
            <label htmlFor='maxPremium'>Max entry premium vs wallet fill (%, 0 = off)</label>
            <input id='maxPremium' className='input' value={maxPremium} onChange={(e) => setMaxPremium(e.target.value)} />
          </div>
          <div className='field'>
            <label htmlFor='minBuy'>Min wallet buy size (SOL, 0 = off)</label>
            <input id='minBuy' className='input' value={minBuy} onChange={(e) => setMinBuy(e.target.value)} />
          </div>
          <button className='btn btn-primary' onClick={apply}>
            {applied ? 'Applied' : 'Apply rules'}
          </button>
        </div>
        <p className='text-xs text-slate-400'>
          The premium is how much more you pay than the wallet did for the same token. It is known at the moment you enter, so a cap on it is a rule a
          real bot could follow. Active on the server: max premium {active ? `${active.maxPremiumPct} %` : '-'}, min wallet buy{' '}
          {active ? `${active.minWalletBuySol} SOL` : '-'}. Entries refused by these rules so far: {filtered?.premiumTooHigh ?? 0} too expensive,{' '}
          {filtered?.tooSmall ?? 0} too small (counted per delay row). Rules apply to new trades only.
        </p>
        <div className='panel-scroll'>
          <table className='data-table'>
            <thead>
              <tr>
                <th>Entry premium</th>
                <th>Closed</th>
                <th>Win rate</th>
                <th>Median PnL</th>
                <th>Average PnL</th>
                <th>Total PnL (SOL)</th>
              </tr>
            </thead>
            <tbody>
              {(premium?.buckets ?? []).map((b) => (
                <tr key={b.label}>
                  <td className='font-semibold'>{b.label}</td>
                  <td>{b.n}</td>
                  <td>{b.winRate == null ? '-' : `${(b.winRate * 100).toFixed(0)} %`}</td>
                  <td className={tone(b.medianPnlPct)}>{pc(b.medianPnlPct)}</td>
                  <td className={tone(b.avgPnlPct)}>{pc(b.avgPnlPct)}</td>
                  <td className={tone(b.n ? b.totalPnlSol : null)}>{b.n ? sol(b.totalPnlSol) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <div className='empty'>No closed trade yet at the slowest delay.</div>}
        </div>
        <p className='text-xs text-slate-400'>
          Computed on the slowest delay tested ({premium?.delayMs ?? '-'} ms), {total} closed trades. With fewer than 10 trades per row, read nothing
          into it. Several rows can come from the same token traded repeatedly.
        </p>
      </div>
    </section>
  );
};
