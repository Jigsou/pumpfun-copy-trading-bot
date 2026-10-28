import React, { useEffect, useState } from 'react';

const WS_URL = 'ws://127.0.0.1:3001';

interface Latency {
  samples: number;
  avgChainLagMs: number | null;
  medianChainLagMs: number | null;
  p90ChainLagMs: number | null;
  avgFetchMs: number | null;
  medianFetchMs: number | null;
}

interface Coverage {
  walletTrades: number;
  onCurve: number;
  onAmm: number;
  skipped: number;
  unpriced: number;
  rejected: number;
  lastMismatch: Record<string, unknown> | null;
}

const ms = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v)} ms`);

export const LatencyCard: React.FC = () => {
  const [lat, setLat] = useState<Latency | null>(null);
  const [cov, setCov] = useState<Coverage | null>(null);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ws: WebSocket | null = null;
    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => ws?.send(JSON.stringify({ type: 'demo_hello' }));
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'demo_state' && msg.state) {
            if (msg.state.latency) setLat(msg.state.latency as Latency);
            if (msg.state.coverage) setCov(msg.state.coverage as Coverage);
          }
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

  const clockWarning = lat && lat.medianChainLagMs != null && lat.medianChainLagMs < 0;

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 lg:grid-cols-4 gap-4'>
        <div className='stat'>
          <div className='stat-label'>Detection lag (average)</div>
          <div className='stat-value'>{ms(lat?.avgChainLagMs)}</div>
          <div className='stat-sub'>Wallet trade on-chain to seen by the bot</div>
        </div>
        <div className='stat'>
          <div className='stat-label'>Detection lag (median)</div>
          <div className='stat-value'>{ms(lat?.medianChainLagMs)}</div>
          <div className='stat-sub'>90th percentile: {ms(lat?.p90ChainLagMs)}</div>
        </div>
        <div className='stat'>
          <div className='stat-label'>Processing time (average)</div>
          <div className='stat-value'>{ms(lat?.avgFetchMs)}</div>
          <div className='stat-sub'>Seen by the bot to trade decoded</div>
        </div>
        <div className='stat'>
          <div className='stat-label'>Samples</div>
          <div className='stat-value'>{lat?.samples ?? 0}</div>
          <div className='stat-sub'>Trades measured since last reset</div>
        </div>
      </div>
      {clockWarning && (
        <div className='alert warn'>
          Your PC clock is behind the blockchain clock, so the detection lag is understated. Sync it: open PowerShell as administrator and run
          w32tm /resync
        </div>
      )}
      {cov && (cov.walletTrades > 0 || cov.rejected > 0) && (
        <div className='panel'>
          <div className='panel-body text-sm'>
            <div className='font-semibold mb-2'>Why some trades have no profit figure</div>
            <ul className='text-slate-400 space-y-1'>
              <li>
                {cov.walletTrades} wallet trades seen: {cov.onCurve} on the Pump.fun curve (simulated), {cov.onAmm} on PumpSwap (not simulated
                yet, because the token already left the curve).
              </li>
              <li>{cov.unpriced} simulated trades were closed without a price because the token moved to PumpSwap before the exit.</li>
              <li>{cov.rejected} simulated entries were rejected because their price looked impossible compared with the wallet fill.</li>
            </ul>
            {cov.lastMismatch && (
              <details className='mt-3'>
                <summary className='cursor-pointer text-slate-300'>Diagnostic of the last rejected entry</summary>
                <pre className='text-xs text-slate-400 overflow-x-auto mt-2'>{JSON.stringify(cov.lastMismatch, null, 2)}</pre>
              </details>
            )}
          </div>
        </div>
      )}
      <details className='panel help'>
        <summary className='panel-body'>How does this work, and how do I read the results?</summary>
        <div className='panel-body' style={{ paddingTop: 0 }}>
          <ol>
            <li>The bot watches the followed wallet through Helius. It never touches your money and never needs a private key.</li>
            <li>
              When the wallet buys a Pump.fun token, the bot waits for each delay you configured (for example 200, 1000 and 3000 ms), reads the
              real price at that moment and computes what your buy would have cost, fees included.
            </li>
            <li>When the wallet sells, the bot simulates your sell after the same delay. If it never sells, the position is closed after the max hold time.</li>
            <li>
              A delay is the time between the bot seeing the trade and your transaction landing. Real delay behind the wallet is roughly the
              detection lag above plus the delay of the row you look at.
            </li>
            <li>
              200 ms is a theoretical best case that a browser-based bot cannot reach. 1000 ms is an optimized setup. 3000 ms is typical for a
              simple bot. Trust the row that matches your real setup.
            </li>
            <li>
              Read each row top to bottom: if PnL is positive at 200 ms but negative at 1000 and 3000 ms, the edge disappears with realistic
              latency and copying will lose money. You need at least 50 closed trades per row before the numbers mean anything.
            </li>
            <li>
              Each real wallet trade is replayed once per delay, so one trade produces several simulated rows. Wallets often split one exit into
              several sells, which also multiplies the rows.
            </li>
            <li>
              Detection lag has about one second of precision, because the blockchain timestamps blocks in whole seconds. Processing time is
              precise.
            </li>
          </ol>
        </div>
      </details>
    </div>
  );
};
