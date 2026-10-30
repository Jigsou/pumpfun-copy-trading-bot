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
interface ServerRules {
  values: Record<string, number | boolean>;
  refused: Record<string, number>;
  stats?: Record<string, number>;
}
type Form = Record<string, string | boolean>;

const NUM_FIELDS: { key: string; label: string }[] = [
  { key: 'maxImpactPct', label: 'Max his buy / pool SOL (%, 0 = off)' },
  { key: 'minMcapSol', label: 'Min market cap at your entry (SOL, 0 = off)' },
  { key: 'maxMcapSol', label: 'Max market cap at your entry (SOL, 0 = off)' },
  { key: 'minAgeSec', label: 'Min token age at his buy (s, 0 = off, unknown age passes)' },
  { key: 'maxAgeSec', label: 'Max token age at his buy (s, 0 = off, unknown age passes)' },
  { key: 'minBuyVsUsual', label: 'Min his buy vs his usual buy (x, 0 = off, needs 5 buys)' },
  { key: 'maxOpenOps', label: 'Max open operations at once (0 = off)' },
  { key: 'mintCooldownMin', label: 'One buy per wallet and token for (min, 0 = off)' },
  { key: 'minWalletsOnToken', label: 'Min followed wallets on the same token (0 or 1 = off)' },
  { key: 'confluenceWindowSec', label: 'Window for that confluence (s)' },
  { key: 'dailyLossLimitSol', label: 'Stop new entries below -X SOL over 24 h (0 = off)' },
];
const NUM_KEYS = ['takeProfitPct', ...NUM_FIELDS.map((f) => f.key)];
const BOOL_KEYS = ['takeProfitMode', 'allowCurve', 'allowPumpswap'];
const DEFAULT_FORM: Form = {
  takeProfitMode: false,
  takeProfitPct: '30',
  allowCurve: true,
  allowPumpswap: true,
  maxImpactPct: '0',
  minMcapSol: '0',
  maxMcapSol: '0',
  minAgeSec: '0',
  maxAgeSec: '0',
  minBuyVsUsual: '0',
  maxOpenOps: '0',
  mintCooldownMin: '30',
  minWalletsOnToken: '0',
  confluenceWindowSec: '60',
  dailyLossLimitSol: '0',
};

const loadForm = (): Form => {
  try {
    const raw = localStorage.getItem('demoRules');
    return raw ? { ...DEFAULT_FORM, ...(JSON.parse(raw) as Form) } : { ...DEFAULT_FORM };
  } catch {
    return { ...DEFAULT_FORM };
  }
};

const toRules = (form: Form): Record<string, number | boolean> => {
  const out: Record<string, number | boolean> = {};
  for (const k of NUM_KEYS) out[k] = Number(String(form[k]).trim() === '' ? 0 : form[k]);
  for (const k of BOOL_KEYS) out[k] = form[k] === true;
  return out;
};

const pc = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`);
const sol = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(4)}`);
const tone = (v: number | null | undefined) => (v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-400' : 'text-rose-400');

export const StrategyFilters: React.FC = () => {
  const [maxPremium, setMaxPremium] = useState<string>(() => localStorage.getItem('demoMaxPremium') ?? '0');
  const [minBuy, setMinBuy] = useState<string>(() => localStorage.getItem('demoMinBuy') ?? '0');
  const [form, setForm] = useState<Form>(loadForm);
  const [premium, setPremium] = useState<Premium | null>(null);
  const [filtered, setFiltered] = useState<Filtered | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [serverRules, setServerRules] = useState<ServerRules | null>(null);
  const [applied, setApplied] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const syncedRef = useRef(false);
  const valuesRef = useRef({ maxPremium, minBuy, form });

  useEffect(() => {
    valuesRef.current = { maxPremium, minBuy, form };
  }, [maxPremium, minBuy, form]);

  const setField = (key: string, value: string | boolean) => setForm((prev) => ({ ...prev, [key]: value }));

  const push = (ws: WebSocket | null): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(
      JSON.stringify({
        type: 'demo_update_settings',
        settings: {
          maxPremiumPct: Number(valuesRef.current.maxPremium),
          minWalletBuySol: Number(valuesRef.current.minBuy),
          rules: toRules(valuesRef.current.form),
        },
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
          setServerRules((st.rules as ServerRules) ?? null);
          const s = st.settings;
          if (s) {
            setActive({ maxPremiumPct: Number(s.maxPremiumPct ?? 0), minWalletBuySol: Number(s.minWalletBuySol ?? 0) });
            if (!syncedRef.current) {
              syncedRef.current = true;
              const v = valuesRef.current;
              const mine = toRules(v.form);
              const theirs = (st.rules?.values ?? {}) as Record<string, number | boolean>;
              const rulesDiffer = Object.keys(mine).some((k) => theirs[k] !== mine[k]);
              if (Number(v.maxPremium) !== Number(s.maxPremiumPct ?? 0) || Number(v.minBuy) !== Number(s.minWalletBuySol ?? 0) || rulesDiffer) push(ws);
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
    localStorage.setItem('demoRules', JSON.stringify(form));
    if (push(wsRef.current)) {
      setApplied(true);
      setTimeout(() => setApplied(false), 1500);
    }
  };

  const total = premium ? premium.buckets.reduce((a, b) => a + b.n, 0) : 0;
  const refusedList = Object.entries(serverRules?.refused ?? {});
  const tpActive = serverRules?.values?.takeProfitMode === true;

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

        <div className='space-y-3'>
          <h3 className='text-sm font-semibold text-slate-200'>Exit mode</h3>
          <label className='flex items-center gap-2 text-sm text-slate-200'>
            <input type='checkbox' checked={form.takeProfitMode === true} onChange={(e) => setField('takeProfitMode', e.target.checked)} />
            Take profit mode (sell at the take profit, or when the wallet sells if that happens first)
          </label>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            <div className='field'>
              <label htmlFor='takeProfitPct'>Take profit (% net PnL after fees)</label>
              <input id='takeProfitPct' className='input' value={String(form.takeProfitPct)} onChange={(e) => setField('takeProfitPct', e.target.value)} />
            </div>
          </div>
          <p className='text-xs text-slate-400'>
            Unchecked: current mode, you sell when the wallet sells. Checked: you also sell as soon as your simulated PnL reaches the take profit (price checked every 0.5 s,
            then the scenario delay is added before the sale). Active on the server: {tpActive ? `take profit ${serverRules?.values?.takeProfitPct ?? '-'} %` : 'sell when the wallet sells'}
            {serverRules?.stats ? `, take profits triggered: ${serverRules.stats.tpTriggered ?? 0}` : ''}.
          </p>
        </div>

        <div className='space-y-3'>
          <h3 className='text-sm font-semibold text-slate-200'>More entry rules</h3>
          <div className='grid grid-cols-1 md:grid-cols-3 gap-3'>
            {NUM_FIELDS.map((f) => (
              <div className='field' key={f.key}>
                <label htmlFor={f.key}>{f.label}</label>
                <input id={f.key} className='input' value={String(form[f.key])} onChange={(e) => setField(f.key, e.target.value)} />
              </div>
            ))}
          </div>
          <div className='flex flex-wrap items-center gap-6 text-sm text-slate-200'>
            <label className='flex items-center gap-2'>
              <input type='checkbox' checked={form.allowCurve === true} onChange={(e) => setField('allowCurve', e.target.checked)} />
              Follow buys on the bonding curve
            </label>
            <label className='flex items-center gap-2'>
              <input type='checkbox' checked={form.allowPumpswap === true} onChange={(e) => setField('allowPumpswap', e.target.checked)} />
              Follow buys on PumpSwap
            </label>
            <button className='btn btn-primary' onClick={apply}>
              {applied ? 'Applied' : 'Apply rules'}
            </button>
          </div>
          <p className='text-xs text-slate-400'>
            Refused by these rules so far (counted per delay row):{' '}
            {refusedList.length ? refusedList.map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}. A rule that needs a value the bot does not have (for example an unknown token
            age) lets the trade through. Every rule is a hypothesis to test on the closed trades below, not a proven edge.
          </p>
        </div>

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
