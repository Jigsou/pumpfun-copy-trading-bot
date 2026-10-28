import { DemoEngine } from './engine.js';

export const STALE_AFTER_S = 30;
export const IMPLAUSIBLE_SLIP_PCT = -50;

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pct = (a, p) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};

export function createRpc({ url, fetchImpl = globalThis.fetch, maxConcurrent = 4, minGapMs = 125, maxRetries = 6, baseBackoffMs = 600 } = {}) {
  let active = 0;
  let lastStart = 0;
  let pausedUntil = 0;
  let timer = null;
  const queue = [];

  const pump = () => {
    while (active < maxConcurrent && queue.length) {
      const now = Date.now();
      const wait = Math.max(lastStart + minGapMs - now, pausedUntil - now, 0);
      if (wait > 0) {
        if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            pump();
          }, wait);
        }
        return;
      }
      const job = queue.shift();
      active++;
      lastStart = Date.now();
      job.fn().then(job.resolve, job.reject).finally(() => {
        active--;
        pump();
      });
    }
  };

  const schedule = (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });

  const isRetryable = (out) => {
    if (out.status === 429 || out.status >= 500) return true;
    if (/too many requests|rate limit/i.test(out.text.slice(0, 200))) return true;
    const e = out.json?.error;
    return !!e && (e.code === 429 || e.code === -32429 || /rate limit|too many/i.test(String(e.message)));
  };

  return async function rpc(method, params) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const out = await schedule(async () => {
        const res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        const text = await res.text();
        let json = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
        return { status: res.status, retryAfter: res.headers?.get?.('retry-after'), text, json };
      });
      if (isRetryable(out)) {
        const ra = Number(out.retryAfter);
        const backoff = Number.isFinite(ra) && ra > 0 ? ra * 1000 : baseBackoffMs * 2 ** attempt;
        pausedUntil = Math.max(pausedUntil, Date.now() + backoff + Math.floor(Math.random() * 150));
        continue;
      }
      if (!out.json) throw new Error(`${method}: reponse invalide (HTTP ${out.status}) ${out.text.slice(0, 80)}`);
      if (out.json.error) throw new Error(`${method}: ${out.json.error.message}`);
      return out.json.result;
    }
    throw new Error(`${method}: limite de requetes Helius (429) apres ${maxRetries + 1} essais`);
  };
}

export class RobustDemoEngine extends DemoEngine {
  constructor(deps, opts = {}) {
    super(deps);
    this.staleAfterS = opts.staleAfterS ?? STALE_AFTER_S;
    this.inflight = new Map();
    this.lagSamples = [];
    this.lastCurve = new Map();
    this.rejected = 0;
    this.lastMismatch = null;
    this.slotSeen = new Map();
    this.sigSlot = new Map();
  }

  _connect() {
    super._connect();
    const ws = this.ws;
    ws.on('open', () => this._send({ jsonrpc: '2.0', id: this.nextReq++, method: 'slotSubscribe' }));
  }

  _onMessage(raw) {
    const text = raw.toString();
    if (text.includes('slotNotification')) {
      try {
        const slot = JSON.parse(text).params?.result?.slot;
        if (slot) {
          this.slotSeen.set(slot, Date.now());
          if (this.slotSeen.size > 400) this.slotSeen.delete(this.slotSeen.keys().next().value);
        }
      } catch {
        // ignored message
      }
      return;
    }
    if (text.includes('logsNotification')) {
      try {
        const res = JSON.parse(text).params?.result;
        const sig = res?.value?.signature;
        const slot = res?.context?.slot;
        if (sig && slot) {
          this.sigSlot.set(sig, slot);
          if (this.sigSlot.size > 2000) this.sigSlot.delete(this.sigSlot.keys().next().value);
        }
      } catch {
        // ignored message
      }
    }
    super._onMessage(raw);
  }

  async _getTx(signature) {
    const tx = await super._getTx(signature);
    if (tx && tx.blockTime && Date.now() / 1000 - tx.blockTime > this.staleAfterS) {
      this.skipped++;
      this._changed();
      return null;
    }
    return tx;
  }

  _readCurve(mint) {
    const existing = this.inflight.get(mint);
    if (existing) return existing;
    const p = super
      ._readCurve(mint)
      .then((c) => {
        if (c) this.lastCurve.set(mint, { vToken: c.vToken, vSol: c.vSol, complete: c.complete, readAt: Date.now() });
        if (this.lastCurve.size > 200) this.lastCurve.delete(this.lastCurve.keys().next().value);
        return c;
      })
      .finally(() => this.inflight.delete(mint));
    this.inflight.set(mint, p);
    return p;
  }

  _rejectImplausible(pos) {
    this.positions.delete(pos.key);
    this.rejected++;
    this.lastMismatch = {
      mint: pos.mint,
      delayMs: pos.delayMs,
      botEntryPriceSol: pos.entryPrice,
      walletFillPriceSol: pos.targetPrice,
      differencePct: pos.slipVsTargetPct,
      lastCurveRead: this.lastCurve.get(pos.mint) ?? null,
    };
    this._changed();
  }

  async _open(wallet, trade, delayMs, detectedAt) {
    await super._open(wallet, trade, delayMs, detectedAt);
    const pos = this.positions.get(`${wallet.address}|${trade.mint}|${delayMs}`);
    if (pos && pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT) this._rejectImplausible(pos);
  }

  async _close(pos, reason) {
    if (pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT && this.positions.has(pos.key)) {
      this._rejectImplausible(pos);
      return;
    }
    return super._close(pos, reason);
  }

  _handleTrade(wallet, trade, tx, detectedAt, signature) {
    const slot = this.sigSlot.get(signature);
    const seenAt = slot !== undefined ? this.slotSeen.get(slot) : undefined;
    const slotLagMs = seenAt !== undefined ? detectedAt - seenAt : null;
    const clockLagMs = tx && tx.blockTime ? detectedAt - tx.blockTime * 1000 : null;
    const chainLagMs = slotLagMs ?? (clockLagMs != null && clockLagMs >= 0 ? clockLagMs : null);
    const clockSkewMs = slotLagMs != null && clockLagMs != null ? clockLagMs - slotLagMs : null;
    const p = super._handleTrade(wallet, trade, tx, detectedAt, signature);
    const ev = this.events[0];
    if (ev && ev.signature === signature && ev.wallet === wallet.address) {
      ev.chainLagMs = chainLagMs;
      ev.slotLagMs = slotLagMs;
      ev.clockLagMs = clockLagMs;
      this.lagSamples.push({ chainLagMs, fetchMs: ev.fetchMs, clockSkewMs });
      if (this.lagSamples.length > 500) this.lagSamples.shift();
    }
    return p;
  }

  _latencyStats() {
    const chain = this.lagSamples.map((x) => x.chainLagMs).filter((v) => v != null);
    const fetchMs = this.lagSamples.map((x) => x.fetchMs);
    const skew = this.lagSamples.map((x) => x.clockSkewMs).filter((v) => v != null);
    return {
      samples: this.lagSamples.length,
      avgChainLagMs: avg(chain),
      medianChainLagMs: pct(chain, 0.5),
      p90ChainLagMs: pct(chain, 0.9),
      avgFetchMs: avg(fetchMs),
      medianFetchMs: pct(fetchMs, 0.5),
      medianClockSkewMs: pct(skew, 0.5),
    };
  }

  _coverage() {
    const onAmm = this.events.filter((e) => e.venue !== 'pump').length;
    return {
      walletTrades: this.events.length,
      onCurve: this.events.length - onAmm,
      onAmm,
      skipped: this.skipped,
      unpriced: this.trades.filter((t) => t.pnlSol === null).length,
      rejected: this.rejected,
      lastMismatch: this.lastMismatch,
    };
  }

  snapshot() {
    const s = super.snapshot();
    s.latency = this._latencyStats();
    s.coverage = this._coverage();
    return s;
  }

  reset() {
    super.reset();
    this.lagSamples = [];
    this.rejected = 0;
    this.lastMismatch = null;
  }
}
