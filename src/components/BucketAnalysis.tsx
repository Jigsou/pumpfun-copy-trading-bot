import React from 'react';
import { fmtPct, fmtSol, tone } from '@/lib/demoShared';

export interface BucketRow {
  lo: number;
  hi: number;
  n: number;
  winRate: number | null;
  medianPnlPct: number | null;
  avgPnlPct: number | null;
  totalPnlSol: number;
  pnlWithoutBest: number;
}
export interface BucketMetric {
  key: string;
  label: string;
  n: number;
  missing: number;
  buckets: BucketRow[];
}
export interface BucketReport {
  delayMs: number | null;
  closed: number;
  metrics: BucketMetric[];
}

const fmtAge = (sec: number): string => {
  if (sec < 60) return `${Math.round(sec)} s`;
  if (sec < 3600) return `${Math.round(sec / 60)} min`;
  return `${(sec / 3600).toFixed(1)} h`;
};

const fmtValue = (key: string, v: number): string => {
  if (key === 'impactPct') return `${v.toFixed(v < 1 ? 2 : 1)} %`;
  if (key === 'ageSec') return fmtAge(v);
  if (key === 'mcapSol') return `${v.toFixed(v < 10 ? 2 : 0)} SOL`;
  return `${v.toFixed(v < 1 ? 3 : 2)} SOL`;
};

interface Props {
  report?: BucketReport;
}

export const BucketAnalysis: React.FC<Props> = ({ report }) => (
  <details className='panel'>
    <summary className='panel-body cursor-pointer font-semibold text-sm'>Results by trade characteristics (market cap, token age, trade size, trader impact)</summary>
    <div className='panel-body space-y-5' style={{ paddingTop: 0 }}>
      {!report ? (
        <div className='empty'>Waiting for data from the server. If this stays empty, press Update to get the latest version.</div>
      ) : (
        <>
          <p className='text-xs text-slate-400'>
            Computed on the slowest scenario ({report.delayMs ?? '-'} ms), {report.closed} closed trades, one per operation. Each row holds the same number of trades, sorted from the lowest to the
            highest value. These groups describe the data you have, they are not rules. Read nothing from a row under 10 trades, and do not pick a threshold on the same trades that you then use to
            judge it.
          </p>
          {report.metrics.map((m) => (
            <div key={m.key}>
              <h3 className='text-sm font-semibold text-slate-200 mb-2'>
                {m.label} <span className='text-xs text-slate-400 font-normal'>({m.n} trades with a value{m.missing > 0 ? `, ${m.missing} without` : ''})</span>
              </h3>
              {m.buckets.length === 0 ? (
                <div className='empty'>Not enough data: at least 6 closed trades with this value are needed.</div>
              ) : (
                <div className='panel-scroll'>
                  <table className='data-table'>
                    <thead>
                      <tr>
                        <th>Range</th>
                        <th>Trades</th>
                        <th>Win rate</th>
                        <th>Median PnL</th>
                        <th>Average PnL</th>
                        <th>Total PnL (SOL)</th>
                        <th>Without best trade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.buckets.map((b, i) => (
                        <tr key={`${m.key}-${i}`}>
                          <td className='font-semibold'>
                            {fmtValue(m.key, b.lo)} to {fmtValue(m.key, b.hi)}
                          </td>
                          <td>{b.n}</td>
                          <td>{b.winRate == null ? '-' : `${Math.round(b.winRate * 100)} %`}</td>
                          <td className={tone(b.medianPnlPct)}>{fmtPct(b.medianPnlPct)}</td>
                          <td className={tone(b.avgPnlPct)}>{fmtPct(b.avgPnlPct)}</td>
                          <td className={tone(b.totalPnlSol)}>{fmtSol(b.totalPnlSol)}</td>
                          <td className={tone(b.pnlWithoutBest)}>{fmtSol(b.pnlWithoutBest)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  </details>
);
