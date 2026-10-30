import React, { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

const WS_URL = 'ws://127.0.0.1:3001';
const NL = String.fromCharCode(10);

type AnyState = Record<string, any>;
type Version = { head: string | null; branch: string | null } | null;

const ms = (v: unknown) => (typeof v === 'number' ? `${Math.round(v)} ms` : '-');
const sol = (v: unknown) => (typeof v === 'number' ? v.toFixed(4) : '-');
const pc = (v: unknown) => (typeof v === 'number' ? `${v.toFixed(1)}%` : '-');
const px = (v: unknown) => (typeof v === 'number' ? v.toPrecision(4) : '-');
const num = (v: unknown, digits = 1) => (typeof v === 'number' ? v.toFixed(digits) : '-');
const clock = (v: unknown) => (typeof v === 'number' ? new Date(v).toISOString().slice(11, 23) : '-');
const hours = (since: unknown) => (typeof since === 'number' ? ((Date.now() - since) / 3600000).toFixed(1) : '-');
const opTag = (v: unknown) => (typeof v === 'string' ? v.slice(0, 8) : '-');
const ageMin = (v: unknown) => (typeof v === 'number' ? `${Math.round((Date.now() - v) / 60000)} min` : '-');
const winPc = (v: unknown) => (typeof v === 'number' ? `${Math.round(v * 100)}%` : '-');

function buildReport(s: AnyState | null, ver: Version): string {
  if (!s) return 'No data yet: the local server has not answered. Start the project with npm.cmd start.';
  const L: string[] = [];
  const st = s.settings ?? {};
  const R: AnyState | null = s.rules?.values ?? st.rules ?? null;
  L.push('=== PUMPFUN COPY BOT LOG ===');
  L.push(`generated: ${new Date().toISOString()}`);
  L.push(`version: ${ver?.head ?? 'unknown'} (branch ${ver?.branch ?? 'unknown'})`);
  L.push(`running: ${s.running ? 'yes' : 'no'} | helius websocket: ${s.connected ? 'connected' : 'disconnected'}`);
  L.push(
    `settings: buySol=${st.buySol} scenarios=${(st.delaysMs ?? []).length} delays=${JSON.stringify(st.delaysMs)} curveFee=${st.feePct}% costPerTx=${st.costPerTxSol} maxHoldMin=${st.timeoutMin}`
  );
  if (s.engine) L.push(`engine: ammFee=${s.engine.ammFeePct}% lateTolerance=${s.engine.lateToleranceMs}ms staleAfter=${s.engine.staleAfterS}s`);
  if (s.ops) L.push(`operations: open=${s.ops.openOps} (${s.ops.openScenarios} scenarios) closed=${s.ops.closedOps} (${s.ops.closedScenarios} scenarios)`);
  L.push('');
  L.push('--- rules (every option, as applied on the server) ---');
  L.push(`entry: maxPremiumPct=${st.maxPremiumPct ?? 0} minWalletBuySol=${st.minWalletBuySol ?? 0} (0=off)`);
  if (R) {
    L.push(
      `entry (more): maxImpactPct=${R.maxImpactPct} minMcapSol=${R.minMcapSol} maxMcapSol=${R.maxMcapSol} minAgeSec=${R.minAgeSec} maxAgeSec=${R.maxAgeSec} minBuyVsUsual=${R.minBuyVsUsual} (0=off, an unknown value passes)`
    );
    L.push(`entry (limits): maxOpenOps=${R.maxOpenOps} dailyLossLimitSol=${R.dailyLossLimitSol} mintCooldownMin=${R.mintCooldownMin} (0=off)`);
    L.push(`entry (confluence): minWalletsOnToken=${R.minWalletsOnToken} confluenceWindowSec=${R.confluenceWindowSec} (0 or 1 = off)`);
    L.push(`venues followed: bondingCurve=${R.allowCurve ? 'on' : 'off'} pumpswap=${R.allowPumpswap ? 'on' : 'off'}`);
    L.push(
      `exit mode: ${R.takeProfitMode ? `take profit ${R.takeProfitPct}% net PnL, or when the wallet sells first` : 'sell when the wallet sells'} | maxHoldMin=${st.timeoutMin} | stop-loss: none`
    );
    L.push(
      `average down: ${R.scaleInMode ? 'on' : 'off'} addOnSize=${R.scaleInPct}% of buySol maxAddOns=${R.scaleInMax} condition=${R.scaleInWhen} (below = wallet new buy lower than my average, any = always, above = skip when lower)`
    );
    const refusedRules = Object.entries(s.rules?.refused ?? {});
    L.push(`refused by the extra rules (per delay row): ${refusedRules.length ? refusedRules.map(([k, n]) => `${k}=${n}`).join(' ') : 'none'}`);
    const rs = s.rules?.stats ?? {};
    L.push(
      `step1 engine: pricesSampled=${rs.samples ?? 0} takeProfitsTriggered=${rs.tpTriggered ?? 0} addOnsDone=${rs.addsDone ?? 0} samplingSkippedRpcBusy=${rs.skippedBusyRpc ?? 0} samplingErrors=${rs.sampleErrors ?? 0} pathsLogged=${rs.pathsLogged ?? 0}`
    );
  } else {
    L.push('extended rules: not reported by the server (update and restart the bot)');
  }
  L.push('');
  L.push('--- wallets ---');
  for (const w of s.wallets ?? []) L.push(`${w.label} | ${w.address} | buys=${w.buys} sells=${w.sells} last=${clock(w.lastSeen)}`);
  L.push('');
  L.push('--- results by scenario (delay) ---');
  L.push('note: scenarios of one operation copy the same wallet trade, they are alternatives and must not be added together');
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
  const ad = s.premium?.addon;
  L.push(`--- average down (slowest delay ${ad?.delayMs ?? '-'} ms) ---`);
  if (ad) {
    L.push(`enabled=${ad.enabled ? 'yes' : 'no'} addOnsDone=${ad.addsDone ?? 0}`);
    L.push(
      `with add-ons: closed=${ad.withAdds?.n ?? 0} avgAddOns=${num(ad.withAdds?.avgAdds)} win=${winPc(ad.withAdds?.winRate)} avg=${pc(ad.withAdds?.avgPnlPct)} total=${sol(ad.withAdds?.totalPnlSol)} SOL`
    );
    L.push(`single buy: closed=${ad.without?.n ?? 0} win=${winPc(ad.without?.winRate)} avg=${pc(ad.without?.avgPnlPct)} total=${sol(ad.without?.totalPnlSol)} SOL`);
    for (const r of ad.rows ?? []) {
      L.push(
        `${r.status} ${r.label} mint=${r.mint} addOns=${r.adds} invested=${sol(r.investedSol)} SOL firstPrice=${px(r.firstEntryPrice)} avgPrice=${px(r.avgEntryPrice)} pnl=${r.status === 'closed' ? `${sol(r.pnlSol)} SOL (${pc(r.pnlPct)})` : 'open'}`
      );
    }
  } else {
    L.push('not reported by the server (update and restart the bot)');
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
    `stale(too old)=${sr.stale ?? 0} late(read after planned delay)=${sr.late ?? 0} txNotFound=${sr.txNotFound ?? 0} curveUnavailable=${sr.curveUnavailable ?? 0} curveQuoteNotSol=${sr.curveQuoteNotSol ?? 0} pumpswapPoolUnknown=${sr.ammPoolUnknown ?? 0} pumpswapQuoteNotSol=${sr.ammQuoteNotSol ?? 0} pumpswapUnreadable=${sr.ammUnreadable ?? 0} | routedThroughOtherExchange(per buy)=${sr.routed ?? 0} | not a pump trade (ignored before fetch)=${sr.notATrade ?? 0}`
  );
  L.push(`refused by your rules (per delay row): premiumTooHigh=${fl.premiumTooHigh ?? 0} walletBuyTooSmall=${fl.tooSmall ?? 0}`);
  L.push(
    `coverage (cumulative since reset): walletTrades=${c.walletTrades ?? 0} onCurve=${c.onCurve ?? 0} onPumpSwap=${c.onAmm ?? 0} routed=${c.routed ?? 0} unpricedExits=${c.unpriced ?? 0} rejectedEntries=${c.rejected ?? 0} poolsKnown=${s.pools ?? 0} nonSolPairsSeen=${s.nonSolPools ?? 0}`
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
  L.push('--- last closed simulated trades (op = same operation) ---');
  for (const t of (s.trades ?? []).slice(0, 15)) {
    const addInfo = (t.adds ?? 0) > 0 ? ` addOns=${t.adds} invested=${sol(t.investedSol)} SOL firstPrice=${px(t.firstEntryPrice)} avgPrice=${px(t.avgEntryPrice)}` : '';
    L.push(
      `${clock(t.time)} ${t.label} op=${opTag(t.opId)} delay=${t.delayMs}ms mint=${t.mint} vsTarget=${pc(t.slipVsTargetPct)} held=${t.heldSec}s exit='${t.reason}' pnl=${sol(t.pnlSol)} SOL (${pc(t.pnlPct)}) mfe=${pc(t.mfePct)} mae=${pc(t.maePct)} venue=${t.venue ?? '-'} walletBuy=${sol(t.walletSol)} SOL impact=${pc(t.impactPct)} mcap=${num(t.mcapSol)} SOL age=${typeof t.ageSec === 'number' ? t.ageSec + 's' : '-'}${addInfo}`
    );
  }
  if (!(s.trades ?? []).length) L.push('none');
  L.push('');
  L.push('--- open simulated positions ---');
  for (const p of (s.positions ?? []).slice(0, 15)) {
    const addInfo = (p.adds ?? 0) > 0 ? ` addOns=${p.adds} invested=${sol(p.investedSol)} SOL` : '';
    L.push(`${p.label} op=${opTag(p.opId)} delay=${p.delayMs}ms mint=${p.mint} vsTarget=${pc(p.slipVsTargetPct)} avgEntryPrice=${px(p.entryPrice)} openedAt=${clock(p.openedAt)} age=${ageMin(p.openedAt)}${addInfo}`);
  }
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
