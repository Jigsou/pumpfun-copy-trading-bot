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

export const PremiumAnalysis: React.FC<Props> = ({ premium, filtered, settings }) => {
  const buckets = premium?.buckets ?? [];
  const total = buckets.reduce((a, b) => a + b.n, 0);
  const cap = settings?.maxPremiumPct ?? 0;
  const min = settings?.minWalletBuySol ?? 0;

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
      </div>
    </section>
  );
};
