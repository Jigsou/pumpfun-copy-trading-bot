import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';
const NL = String.fromCharCode(10);

type AnyState = Record<string, any>;
type Version = { head: string | null; branch: string | null } | null;

const ms = (v: unknown) => (typeof v === 'number' ? `${Math.round(v)} ms` : '-');
const sol = (v: unknown) => (typeof v === 'number' ? v.toFixed(4) : '-');
const pc = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '-');
const clock = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString().slice(11, 23) : '-');
const hours = (since: unknown) => (typeof since === 'number' ? ((Date.now() - since) / 3600000).toFixed(1) : '-');

function buildReport(s: AnyState | null, ver: Version): string {
  if (!s) return 'No data yet: the local server has not answered. Start the project with npm.cmd start.';
  const L: string[] = [];
  const st = s.settings ?? {};
  L.push('=== PUMPFUN COPY BOT LOG ===');
  L.push(`generated: ${new Date().toISOString()}`);
  L.push(`version: ${ver?.head ?? 'unknown'} (branch ${ver?.branch ?? 'unknown'})`);
  L.push(`running: ${s.running ? 'yes' : 'no'} | helius websocket: ${s.connected ? 'connected' : 'disconnected'}`);
  L.push(
    `settings: buySol=${st.buySol} delays=${JSON.stringify(st.delaysMs)} curveFee=${st.feePct}% costPerTx=${st.costPerTxSol} maxHoldMin=${st.timeoutMin}`
  );
  L.push(`rules: maxPremiumPct=${st.maxPremiumPct ?? 0} (0=off) minWalletBuySol=${st.minWalletBuySol ?? 0} (0=off)`);
  if (s.engine) L.push(`engine: ammFee=${s.engine.ammFeePct}% lateTolerance=${s.engine.lateToleranceMs}ms staleAfter=${s.engine.staleAfterS}s`);
  L.push('');
  L.push('--- wallets ---');
  for (const w of s.wallets ?? []) L.push(`${w.label} | ${w.address} | buys=${w.buys} sells=${w.sells} last=${clock(w.lastSeen)}`);
  L.push('');
  L.push('--- results by delay ---');
  for (const r of s.stats ?? []) {
    L.push(
      `${r.delayMs} ms: closed=${r.n} unpriced=${r.unpriced} win=${r.winRate == null ? '-' : Math.round(r.winRate * 100) + '%'} pnl=${sol(r.totalPnlSol)} SOL avg=${pc(r.avgPnlPct)} paidVsTarget(median)=${pc(r.medianSlipPct)}`
    );
  }
  L.push('');
  L.push(`--- pnl by entry premium (slowest delay ${s.premium?.delayMs ?? '-'} ms) ---`);
  for (const b of s.premium?.buckets ?? []) {
    L.push(`${b.label}: n=${b.n} win=${b.winRate == null ? '-' : Math.round(b.winRate * 100) + '%'} median=${pc(b.medianPnlPct)} avg=${pc(b.avgPnlPct)} total=${sol(b.totalPnlSol)} SOL`);
  }
  L.push('');
  const lat = s.latency ?? {};
  L.push('--- latency ---');
  L.push(`detection lag: median=${ms(lat.medianChainLagMs)} avg=${ms(lat.avgChainLagMs)} p90=${ms(lat.p90ChainLagMs)}`);
  L.push(`processing time: avg=${ms(lat.avgFetchMs)} median=${ms(lat.medianFetchMs)} samples=${lat.samples ?? 0}`);
  L.push(`pc clock vs chain (median skew): ${ms(lat.medianClockSkewMs)}`);
  const r = s.rpc;
  L.push('');
  L.push('--- rpc (helius) ---');
  L.push(
    r
      ? `calls=${r.calls} rateLimited=${r.rateLimited} queuedNow=${r.queued} queueWait avg=${ms(r.avgQueueWaitMs)} max=${ms(r.maxQueueWaitMs)}`
      : 'not started'
  );
  L.push('');
  const sr = s.skipReasons ?? {};
  const fl = s.filtered ?? {};
  const c = s.coverage ?? {};
  L.push('--- sample size ---');
  L.push(`since reset: ${hours(c.startedAt)} h | distinct tokens traded by wallets=${c.distinctTokens ?? 0} | tokens with at least one valid simulated entry=${c.usableTokens ?? 0}`);
  L.push('');
  L.push('--- skipped / ignored by reason ---');
  L.push(`total skipped counter: ${s.skipped ?? 0}`);
  L.push(
    `stale(too old)=${sr.stale ?? 0} late(read after planned delay)=${sr.late ?? 0} txNotFound=${sr.txNotFound ?? 0} curveUnavailable=${sr.curveUnavailable ?? 0} curveQuoteNotSol=${sr.curveQuoteNotSol ?? 0} pumpswapPoolUnknown=${sr.ammPoolUnknown ?? 0} pumpswapQuoteNotSol=${sr.ammQuoteNotSol ?? 0} pumpswapUnreadable=${sr.ammUnreadable ?? 0} | not a pump trade (ignored before fetch)=${sr.notATrade ?? 0}`
  );
  L.push(`refused by your rules (per delay row): premiumTooHigh=${fl.premiumTooHigh ?? 0} walletBuyTooSmall=${fl.tooSmall ?? 0}`);
  L.push(
    `coverage (cumulative since reset): walletTrades=${c.walletTrades ?? 0} onCurve=${c.onCurve ?? 0} onPumpSwap=${c.onAmm ?? 0} unpricedExits=${c.unpriced ?? 0} rejectedEntries=${c.rejected ?? 0} poolsKnown=${s.pools ?? 0} nonSolPairsSeen=${s.nonSolPools ?? 0}`
  );
  L.push('');
  L.push('--- last errors ---');
  for (const e of (s.errorLog ?? []).slice(0, 10)) L.push(`${clock(e.time)} ${e.message}`);
  if (!(s.errorLog ?? []).length) L.push('none');
  L.push('');
  L.push('--- last wallet trades (newest first) ---');
  for (const e of (s.events ?? []).slice(0, 15)) {
    L.push(
      `${clock(e.time)} ${e.label} ${e.side} ${typeof e.sol === 'number' ? e.sol.toFixed(3) : '-'} SOL ${e.venue} mint=${e.mint} detectionLag=${ms(e.chainLagMs)} processing=${ms(e.fetchMs)}`
    );
  }
  if (!(s.events ?? []).length) L.push('none');
  L.push('');
  L.push('--- last closed simulated trades ---');
  for (const t of (s.trades ?? []).slice(0, 15)) {
    L.push(
      `${clock(t.time)} ${t.label} delay=${t.delayMs}ms mint=${t.mint} vsTarget=${pc(t.slipVsTargetPct)} held=${t.heldSec}s exit='${t.reason}' pnl=${sol(t.pnlSol)} SOL (${pc(t.pnlPct)})`
    );
  }
  if (!(s.trades ?? []).length) L.push('none');
  L.push('');
  L.push('--- open simulated positions ---');
  for (const p of (s.positions ?? []).slice(0, 15)) L.push(`${p.label} delay=${p.delayMs}ms mint=${p.mint} vsTarget=${pc(p.slipVsTargetPct)} openedAt=${clock(p.openedAt)}`);
  if (!(s.positions ?? []).length) L.push('none');
  L.push('');
  L.push('--- diagnostics: last rejected entry ---');
  L.push(c.lastMismatch ? JSON.stringify(c.lastMismatch) : 'none');
  L.push('--- diagnostics: raw bonding-curve accounts of rejected tokens ---');
  for (const d of s.rawDumps ?? []) L.push(JSON.stringify(d));
  if (!(s.rawDumps ?? []).length) L.push('none');
  L.push('--- diagnostics: PumpSwap pool identification ---');
  L.push(`identified from instruction accounts=${s.poolDiag?.ok?.fromInstruction ?? 0} from token balances=${s.poolDiag?.ok?.fromBalances ?? 0}`);
  L.push(`pool account decoded and matching=${s.poolDiag?.layout?.verifiedReads ?? 0} mismatches=${s.poolDiag?.layout?.mismatches ?? 0}`);
  for (const m of s.poolDiag?.layout?.last ?? []) L.push(JSON.stringify(m));
  for (const f of s.poolDiag?.fails ?? []) L.push(JSON.stringify(f));
  if (!(s.poolDiag?.fails ?? []).length) L.push('no identification failure recorded');
  L.push(`last PumpSwap pool read: ${s.lastAmm ? JSON.stringify(s.lastAmm) : 'none'}`);
  return L.join(NL);
}

export const LogReport: React.FC = () => {
  const [state, setState] = useState<AnyState | null>(null);
  const [version, setVersion] = useState<Version>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => {
        ws?.send(JSON.stringify({ type: 'demo_hello' }));
        ws?.send(JSON.stringify({ type: 'app_version' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'demo_state' && msg.state) setState(msg.state as AnyState);
          else if (msg.type === 'app_version') setVersion({ head: msg.head ?? null, branch: msg.branch ?? null });
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    };
  }, []);

  const report = buildReport(state, version);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: select the text manually
    }
  };

  return (
    <details className='panel'>
      <summary className='panel-body cursor-pointer font-semibold text-sm'>Log (copy and paste this to your assistant)</summary>
      <div className='panel-body space-y-3' style={{ paddingTop: 0 }}>
        <div className='flex items-center gap-3'>
          <button className='btn btn-ghost' onClick={copy}>
            {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
            {copied ? 'Copied' : 'Copy log'}
          </button>
          <span className='text-xs text-slate-400'>Contains no API key or private key. Updates live.</span>
        </div>
        <textarea
          readOnly
          value={report}
          className='input'
          style={{ height: 380, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: '0.75rem', whiteSpace: 'pre' }}
        />
      </div>
    </details>
  );
};
