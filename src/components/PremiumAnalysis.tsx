import React from 'react';
import { Filter } from 'lucide-react';
import type { Premium, ServerSettings } from '@/lib/demoShared';
import { fmtPct, fmtSol, tone } from '@/lib/demoShared';
import { openSettings } from '@/lib/uiEvents';

interface Props {
  premium?: Premium;
  filtered?: { tooSmall: number; premiumTooHigh: number };
  settings?: ServerSettings;
}

interface AddonSide {
  n: number;
  winRate: number | null;
  avgPnlPct: number | null;
  totalPnlSol: number;
  avgAdds: number | null;
}
interface AddonRow {
  status: 'open' | 'closed';
  label: string;
  mint: string;
  adds: number;
  investedSol: number | null;
  firstEntryPrice: number | null;
  avgEntryPrice: number | null;
  pnlPct: number | null;
  pnlSol: number | null;
}
interface AddonReport {
  enabled: boolean;
  delayMs: number | null;
  addsDone: number;
  withAdds: AddonSide;
  without: AddonSide;
  rows: AddonRow[];
}

const fmtPrice = (v: number | null | undefined) => (v == null ? '-' : v.toPrecision(3));
const fmtWin = (v: number | null) => (v == null ? '-' : `${(v * 100).toFixed(0)} %`);

export const PremiumAnalysis: React.FC<Props> = ({ premium, filtered, settings }) => {
  const buckets = premium?.buckets ?? [];
  const total = buckets.reduce((a, b) => a + b.n, 0);
  const cap = settings?.maxPremiumPct ?? 0;
  const min = settings?.minWalletBuySol ?? 0;
  const addon = (premium as unknown as { addon?: AddonReport } | undefined)?.addon;
  const showAddon = !!addon && (addon.enabled || addon.withAdds.n > 0 || addon.rows.length > 0);

  const sideRow = (label: string, s: AddonSide) => (
    <tr>
      <td className='font-semibold'>{label}</td>
      <td>{s.n}</td>
      <td>{s.n ? (s.avgAdds ?? 0).toFixed(1) : '-'}</td>
      <td>{fmtWin(s.winRate)}</td>
      <td className={tone(s.avgPnlPct)}>{fmtPct(s.avgPnlPct)}</td>
      <td className={tone(s.n ? s.totalPnlSol : null)}>{s.n ? fmtSol(s.totalPnlSol) : '-'}</td>
    </tr>
  );

  return (
    <section className='panel'>
      <header className='panel-head'>
        <div className='flex items-center gap-2 text-slate-200'>
          <Filter className='w-4 h-4 text-slate-400' />
          <h2 className='panel-title'>Results by entry premium</h2>
        </div>
        <button className='btn btn-ghost' onClick={() => openSettings('rules')}>
          Entry rules
        </button>
      </header>
      <div className='panel-body space-y-3'>
        <p className='text-xs text-slate-400'>
          The premium is how much more you pay than the wallet did for the same token, known at the moment you enter. Rules now: max premium{' '}
          {cap > 0 ? `${cap} %` : 'off'}, min wallet buy {min > 0 ? `${min} SOL` : 'off'}. Refused so far: {filtered?.premiumTooHigh ?? 0} too expensive,{' '}
          {filtered?.tooSmall ?? 0} too small (counted per delay row).
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
              {buckets.map((b) => (
                <tr key={b.label}>
                  <td className='font-semibold'>{b.label}</td>
                  <td>{b.n}</td>
                  <td>{b.winRate == null ? '-' : `${(b.winRate * 100).toFixed(0)} %`}</td>
                  <td className={tone(b.medianPnlPct)}>{fmtPct(b.medianPnlPct)}</td>
                  <td className={tone(b.avgPnlPct)}>{fmtPct(b.avgPnlPct)}</td>
                  <td className={tone(b.n ? b.totalPnlSol : null)}>{b.n ? fmtSol(b.totalPnlSol) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {total === 0 && <div className='empty'>No closed trade yet at the slowest delay.</div>}
        </div>
        <p className='text-xs text-slate-400'>
          Computed on the slowest delay tested ({premium?.delayMs ?? '-'} ms), {total} closed trades. With fewer than 10 trades per row, read nothing into it.
        </p>

        {showAddon && addon && (
          <div className='space-y-3'>
            <div className='flex items-center justify-between gap-2'>
              <h3 className='text-sm font-semibold text-slate-200'>Average down</h3>
              <button className='btn btn-ghost' onClick={() => openSettings('scale')}>
                Average down options
              </button>
            </div>
            <p className='text-xs text-slate-400'>
              {addon.enabled ? 'On' : 'Off'}. Add-on buys made so far: {addon.addsDone}. Compared on the slowest delay ({addon.delayMs ?? '-'} ms). Operations that were averaged down are
              marked in the Closed trades reason and in the Open positions wallet name.
            </p>
            <div className='panel-scroll'>
              <table className='data-table'>
                <thead>
                  <tr>
                    <th>Operations</th>
                    <th>Closed</th>
                    <th>Avg add-ons</th>
                    <th>Win rate</th>
                    <th>Average PnL</th>
                    <th>Total PnL (SOL)</th>
                  </tr>
                </thead>
                <tbody>
                  {sideRow('With add-ons', addon.withAdds)}
                  {sideRow('Single buy', addon.without)}
                </tbody>
              </table>
            </div>
            {addon.rows.length > 0 && (
              <div className='panel-scroll'>
                <table className='data-table'>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Wallet</th>
                      <th>Token</th>
                      <th>Add-ons</th>
                      <th>Invested (SOL)</th>
                      <th>First price</th>
                      <th>Average price</th>
                      <th>Avg vs first</th>
                      <th>PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {addon.rows.map((r, i) => {
                      const drop = r.firstEntryPrice && r.avgEntryPrice ? (r.avgEntryPrice / r.firstEntryPrice - 1) * 100 : null;
                      return (
                        <tr key={`${r.mint}-${r.status}-${i}`}>
                          <td>{r.status === 'open' ? 'Open' : 'Closed'}</td>
                          <td>{r.label}</td>
                          <td>
                            <a className='link' href={`https://solscan.io/token/${r.mint}`} target='_blank' rel='noopener noreferrer'>
                              {r.mint.slice(0, 4)}...{r.mint.slice(-4)}
                            </a>
                          </td>
                          <td>{r.adds}</td>
                          <td>{r.investedSol == null ? '-' : r.investedSol.toFixed(3)}</td>
                          <td>{fmtPrice(r.firstEntryPrice)}</td>
                          <td>{fmtPrice(r.avgEntryPrice)}</td>
                          <td className={tone(drop == null ? null : -drop)}>{fmtPct(drop)}</td>
                          <td className={tone(r.pnlPct)}>{r.status === 'open' ? '-' : `${fmtPct(r.pnlPct)} (${fmtSol(r.pnlSol)} SOL)`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className='text-xs text-slate-400'>
              Average price: SOL invested divided by tokens held, fees included. A lower average than the first price means the add-ons lowered your entry. With fewer than 10 operations per
              row, read nothing into it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
