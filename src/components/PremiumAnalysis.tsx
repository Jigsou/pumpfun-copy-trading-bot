import React, { useState } from 'react';
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
  withoutBestSol?: number | null;
  avgAdds?: number | null;
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
interface AddonDelay {
  delayMs: number;
  withAdds: AddonSide;
  without: AddonSide;
  rows: AddonRow[];
}
interface AddonReport {
  enabled: boolean;
  delayMs: number | null;
  addsDone: number;
  delays?: number[];
  byDelay?: Record<string, AddonDelay>;
  withAdds: AddonSide;
  without: AddonSide;
  rows: AddonRow[];
}
interface CommonReport {
  n: number;
  ops: number;
  delays: number[];
  byDelay: Record<string, AddonSide>;
}

const ROW_CHOICES = [3, 5, 8];
const MAX_OPEN_ROWS = 10;

const fmtPrice = (v: number | null | undefined) => (v == null ? '-' : v.toPrecision(3));
const fmtWin = (v: number | null) => (v == null ? '-' : `${(v * 100).toFixed(0)} %`);

export const PremiumAnalysis: React.FC<Props> = ({ premium, filtered, settings }) => {
  const [pick, setPick] = useState<string>('auto');
  const [rowsLimit, setRowsLimit] = useState<string>('5');
  const buckets = premium?.buckets ?? [];
  const total = buckets.reduce((a, b) => a + b.n, 0);
  const cap = settings?.maxPremiumPct ?? 0;
  const min = settings?.minWalletBuySol ?? 0;
  const extra = premium as unknown as { addon?: AddonReport; common?: CommonReport } | undefined;
  const addon = extra?.addon;
  const common = extra?.common;
  const showAddon = !!addon && (addon.enabled || addon.withAdds.n > 0 || addon.rows.length > 0);
  const selDelay = pick === 'auto' ? String(addon?.delayMs ?? '') : pick;
  const view: AddonDelay | null = addon
    ? addon.byDelay?.[selDelay] ?? { delayMs: addon.delayMs ?? 0, withAdds: addon.withAdds, without: addon.without, rows: addon.rows }
    : null;
  const openRows = view ? view.rows.filter((r) => r.status === 'open').slice(0, MAX_OPEN_ROWS) : [];
  const closedAll = view ? view.rows.filter((r) => r.status === 'closed') : [];
  const closedRows = closedAll.slice(0, Number(rowsLimit));
  const shownRows = [...openRows, ...closedRows];
  const hiddenRows = closedAll.length - closedRows.length;

  const sideRow = (label: string, s: AddonSide, withAdds: boolean) => (
    <tr>
      <td className='font-semibold'>{label}</td>
      <td>{s.n}</td>
      {withAdds && <td>{s.n ? (s.avgAdds ?? 0).toFixed(1) : '-'}</td>}
      <td>{fmtWin(s.winRate)}</td>
      <td className={tone(s.avgPnlPct)}>{fmtPct(s.avgPnlPct)}</td>
      <td className={tone(s.n ? s.totalPnlSol : null)}>{s.n ? fmtSol(s.totalPnlSol) : '-'}</td>
      {!withAdds && <td className={tone(s.withoutBestSol ?? null)}>{s.n && s.withoutBestSol != null ? fmtSol(s.withoutBestSol) : '-'}</td>}
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

        {common && common.ops > 0 && (
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold text-slate-200'>Same operations at every delay</h3>
            <p className='text-xs text-slate-400'>
              {common.n} of {common.ops} closed operations were opened at every delay. The premium cap and the late rule remove some operations at the slower delays, so the totals by scenario
              compare different operations. This table compares the same ones.
            </p>
            <div className='panel-scroll'>
              <table className='data-table'>
                <thead>
                  <tr>
                    <th>Delay</th>
                    <th>Closed</th>
                    <th>Win rate</th>
                    <th>Average PnL</th>
                    <th>Total PnL (SOL)</th>
                    <th>Without best (SOL)</th>
                  </tr>
                </thead>
                <tbody>
                  {common.delays.map((d) => {
                    const s = common.byDelay[String(d)];
                    return s ? sideRow(`${d} ms`, s, false) : null;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showAddon && addon && view && (
          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <h3 className='text-sm font-semibold text-slate-200'>Average down</h3>
              <div className='flex flex-wrap items-center gap-2'>
                <label className='inline-flex items-center gap-2 text-xs text-slate-400'>
                  Delay shown
                  <select className='input' style={{ width: 'auto' }} value={selDelay} onChange={(e) => setPick(e.target.value)}>
                    {(addon.delays ?? []).map((d) => (
                      <option key={d} value={String(d)}>
                        {d} ms
                      </option>
                    ))}
                  </select>
                </label>
                <label className='inline-flex items-center gap-2 text-xs text-slate-400'>
                  Closed rows shown
                  <select className='input' style={{ width: 'auto' }} value={rowsLimit} onChange={(e) => setRowsLimit(e.target.value)}>
                    {ROW_CHOICES.map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button className='btn btn-ghost' onClick={() => openSettings('scale')}>
                  Average down options
                </button>
              </div>
            </div>
            <p className='text-xs text-slate-400'>
              {addon.enabled ? 'On' : 'Off'}. Add-on buys made so far: {addon.addsDone}. Showing the {view.delayMs} ms scenario. The totals below count every operation since the last reset; the list shows
              the open ones and the most recent closed ones only. Operations that were averaged down are marked in the Closed trades reason and in the Open positions wallet name.
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
                  {sideRow('With add-ons', view.withAdds, true)}
                  {sideRow('Single buy', view.without, true)}
                </tbody>
              </table>
            </div>
            {shownRows.length > 0 && (
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
                    {shownRows.map((r, i) => {
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
            {hiddenRows > 0 && <p className='text-xs text-slate-400'>{hiddenRows} older closed operation(s) with add-ons are not listed. They are still counted in the totals above.</p>}
            <p className='text-xs text-slate-400'>
              Average price: SOL invested divided by tokens held, fees included. A lower average than the first price means the add-ons lowered your entry; a higher one means you averaged up. With
              fewer than 10 operations per row, read nothing into it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
