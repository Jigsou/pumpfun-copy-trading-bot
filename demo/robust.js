import { DemoEngine, PUMP_PROGRAM, PUMPSWAP_PROGRAM } from './engine.js';

export const STALE_AFTER_S = 30;
export const IMPLAUSIBLE_SLIP_PCT = -50;
export const LATE_TOLERANCE_MS = 800;
export const AMM_FEE_PCT = 1.25;
const WSOL = 'So11111111111111111111111111111111111111112';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  let calls = 0;
  let limited = 0;
  const waits = [];
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
      waits.push(lastStart - job.t);
      if (waits.length > 100) waits.shift();
      job.fn().then(job.resolve, job.reject).finally(() => {
        active--;
        pump();
      });
    }
  };

  const schedule = (fn) =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject, t: Date.now() });
      pump();
    });

  const isRetryable = (out) => {
    if (out.status === 429 || out.status >= 500) return true;
    if (/too many requests|rate limit/i.test(out.text.slice(0, 200))) return true;
    const e = out.json?.error;
    return !!e && (e.code === 429 || e.code === -32429 || /rate limit|too many/i.test(String(e.message)));
  };

  const rpc = async function rpc(method, params) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      calls++;
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
        limited++;
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

  rpc.stats = () => ({
    calls,
    rateLimited: limited,
    queued: queue.length,
    avgQueueWaitMs: avg(waits),
    maxQueueWaitMs: waits.length ? Math.max(...waits) : null,
  });
  return rpc;
}

export class RobustDemoEngine extends DemoEngine {
  constructor(deps, opts = {}) {
    super(deps);
    this.staleAfterS = opts.staleAfterS ?? STALE_AFTER_S;
    this.lateToleranceMs = opts.lateToleranceMs ?? LATE_TOLERANCE_MS;
    this.ammFeePct = opts.ammFeePct ?? AMM_FEE_PCT;
    this.inflight = new Map();
    this.inflightPool = new Map();
    this.lagSamples = [];
    this.lastCurve = new Map();
    this.rejected = 0;
    this.lastMismatch = null;
    this.slotSeen = new Map();
    this.sigSlot = new Map();
    this.pools = new Map();
    this.lastAmm = null;
    this.errorLog = [];
    this.skipReasons = this._emptyReasons();
  }

  _emptyReasons() {
    return { stale: 0, late: 0, curveUnavailable: 0, ammPoolUnknown: 0, ammUnreadable: 0, notATrade: 0 };
  }

  _setError(msg) {
    this.errorLog.unshift({ time: Date.now(), message: String(msg) });
    if (this.errorLog.length > 40) this.errorLog.length = 40;
    super._setError(msg);
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
        const logs = res?.value?.logs;
        if (sig && slot) {
          this.sigSlot.set(sig, slot);
          if (this.sigSlot.size > 2000) this.sigSlot.delete(this.sigSlot.keys().next().value);
        }
        if (Array.isArray(logs) && logs.length) {
          const truncated = logs.some((l) => String(l).includes('Log truncated'));
          const touchesPump = logs.some((l) => String(l).includes(PUMP_PROGRAM) || String(l).includes(PUMPSWAP_PROGRAM));
          if (!truncated && !touchesPump) {
            this.skipReasons.notATrade++;
            return;
          }
        }
      } catch {
        // ignored message
      }
    }
    super._onMessage(raw);
  }

  async _getTx(signature) {
    let tx = null;
    for (let i = 0; i < 10; i++) {
      try {
        tx = await this.rpc('getTransaction', [
          signature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: this.txVersion },
        ]);
      } catch (e) {
        const m = String(e.message).match(/maxSupportedTransactionVersion["']?\s*:\s*(\d+)/);
        if (m && Number(m[1]) > this.txVersion) {
          this.txVersion = Number(m[1]);
          continue;
        }
        throw e;
      }
      if (tx) break;
      await sleep(200);
    }
    if (tx && tx.blockTime && Date.now() / 1000 - tx.blockTime > this.staleAfterS) {
      this.skipped++;
      this.skipReasons.stale++;
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

  _learnPool(tx, mint, traderAddress) {
    try {
      const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
      const byOwner = new Map();
      for (const b of tx.meta?.postTokenBalances ?? []) {
        if (!b.owner || b.owner === traderAddress) continue;
        const o = byOwner.get(b.owner) ?? {};
        if (b.mint === mint) o.base = b;
        else if (b.mint === WSOL && (!o.quote || Number(b.uiTokenAmount.amount) > Number(o.quote.uiTokenAmount.amount))) o.quote = b;
        byOwner.set(b.owner, o);
      }
      const found = [...byOwner.entries()].filter(([, o]) => o.base && o.quote);
      if (!found.length) return;
      found.sort((a, b) => Number(b[1].quote.uiTokenAmount.amount) - Number(a[1].quote.uiTokenAmount.amount));
      const [owner, o] = found[0];
      this.pools.set(mint, {
        owner,
        baseVault: keys[o.base.accountIndex],
        quoteVault: keys[o.quote.accountIndex],
        decimals: o.base.uiTokenAmount.decimals,
      });
      if (this.pools.size > 300) this.pools.delete(this.pools.keys().next().value);
    } catch {
      // pool not identified
    }
  }

  _readPool(mint) {
    const existing = this.inflightPool.get(mint);
    if (existing) return existing;
    const pool = this.pools.get(mint);
    if (!pool) return Promise.resolve(null);
    const p = this.rpc('getMultipleAccounts', [[pool.baseVault, pool.quoteVault], { encoding: 'jsonParsed', commitment: 'confirmed' }])
      .then((r) => {
        const v = r?.value;
        const b = v?.[0]?.data?.parsed?.info?.tokenAmount;
        const q = v?.[1]?.data?.parsed?.info?.tokenAmount;
        if (!b || !q) return null;
        const st = { base: Number(b.amount), quote: Number(q.amount), decimals: b.decimals ?? pool.decimals };
        this.lastAmm = { mint, baseVault: pool.baseVault, quoteVault: pool.quoteVault, baseRaw: st.base, quoteLamports: st.quote, readAt: Date.now() };
        return st;
      })
      .finally(() => this.inflightPool.delete(mint));
    this.inflightPool.set(mint, p);
    return p;
  }

  _rejectImplausible(pos) {
    this.positions.delete(pos.key);
    this.rejected++;
    this.lastMismatch = {
      mint: pos.mint,
      venue: pos.venue ?? 'pump',
      delayMs: pos.delayMs,
      botEntryPriceSol: pos.entryPrice,
      walletFillPriceSol: pos.targetPrice,
      differencePct: pos.slipVsTargetPct,
      lastCurveRead: this.lastCurve.get(pos.mint) ?? null,
      lastPoolRead: this.lastAmm && this.lastAmm.mint === pos.mint ? this.lastAmm : null,
    };
    this._changed();
  }

  async _open(wallet, trade, delayMs, detectedAt) {
    const key = `${wallet.address}|${trade.mint}|${delayMs}`;
    if (trade.venue === 'pumpswap') return this._openAmm(wallet, trade, delayMs, detectedAt, key);
    const before = this.skipped;
    await super._open(wallet, trade, delayMs, detectedAt);
    const pos = this.positions.get(key);
    if (!pos) {
      if (this.skipped > before) this.skipReasons.curveUnavailable++;
      return;
    }
    if (pos.openedAt - (detectedAt + delayMs) > this.lateToleranceMs) {
      this.positions.delete(key);
      this.skipped++;
      this.skipReasons.late++;
      this._changed();
      return;
    }
    if (pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT) this._rejectImplausible(pos);
  }

  async _openAmm(wallet, trade, delayMs, detectedAt, key) {
    if (this.positions.has(key) || this.busy.has(key)) return;
    if (!this.pools.has(trade.mint)) {
      this.skipped++;
      this.skipReasons.ammPoolUnknown++;
      return;
    }
    this.busy.add(key);
    try {
      await this._waitUntil(detectedAt + delayMs);
      const st = await this._readPool(trade.mint);
      if (!st) {
        this.skipped++;
        this.skipReasons.ammUnreadable++;
        return;
      }
      const now = Date.now();
      if (now - (detectedAt + delayMs) > this.lateToleranceMs) {
        this.skipped++;
        this.skipReasons.late++;
        return;
      }
      const s = this.settings;
      const solInNet = s.buySol * 1e9 * (1 - this.ammFeePct / 100);
      const k = st.base * st.quote;
      const tokensRaw = st.base - k / (st.quote + solInNet);
      if (!(tokensRaw > 0)) return;
      const price = s.buySol / (tokensRaw / 10 ** st.decimals);
      const pos = {
        key,
        wallet: wallet.address,
        label: wallet.label,
        mint: trade.mint,
        venue: 'amm',
        decimals: st.decimals,
        delayMs,
        openedAt: now,
        tokensRaw,
        solInLamports: solInNet,
        buySol: s.buySol,
        entryPrice: price,
        targetPrice: trade.price,
        slipVsTargetPct: (price / trade.price - 1) * 100,
        pipelineMs: now - detectedAt,
        closing: false,
      };
      this.positions.set(key, pos);
      this._changed();
      if (pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT) {
        this._rejectImplausible(pos);
        return;
      }
      const sellAt = this.sells.get(`${wallet.address}|${trade.mint}`);
      if (sellAt && sellAt >= detectedAt) {
        await this._waitUntil(sellAt + delayMs);
        await this._close(pos, 'vente de la cible');
      }
    } catch (e) {
      this._setError(`Ouverture simulee (PumpSwap) : ${e.message}`);
    } finally {
      this.busy.delete(key);
    }
  }

  _ammRecord(pos, reason, st, adjustForOwnBuy) {
    const s = this.settings;
    const feeF = 1 - this.ammFeePct / 100;
    const base = {
      time: Date.now(),
      wallet: pos.wallet,
      label: pos.label,
      mint: pos.mint,
      delayMs: pos.delayMs,
      entryPrice: pos.entryPrice,
      targetPrice: pos.targetPrice,
      slipVsTargetPct: pos.slipVsTargetPct,
      pipelineMs: pos.pipelineMs,
      heldSec: Math.round((Date.now() - pos.openedAt) / 1000),
      buySol: pos.buySol,
    };
    if (!st) return { ...base, reason: `${reason} (non evaluable)`, pnlSol: null, pnlPct: null, proceedsSol: null };
    const quote = st.quote + (adjustForOwnBuy ? pos.solInLamports : 0);
    const baseRes = st.base - (adjustForOwnBuy ? pos.tokensRaw : 0);
    if (!(baseRes > 0) || !(quote > 0)) return { ...base, reason: `${reason} (non evaluable)`, pnlSol: null, pnlPct: null, proceedsSol: null };
    const gross = quote - (quote * baseRes) / (baseRes + pos.tokensRaw);
    const proceeds = (gross * feeF) / 1e9 - s.costPerTxSol;
    const cost = pos.buySol + s.costPerTxSol;
    const pnlSol = proceeds - cost;
    return { ...base, reason, proceedsSol: proceeds, pnlSol, pnlPct: (pnlSol / cost) * 100 };
  }

  async _closeAmm(pos, reason) {
    pos.closing = true;
    let rec;
    try {
      const st = await this._readPool(pos.mint);
      rec = this._ammRecord(pos, reason, st, true);
    } catch (e) {
      pos.closing = false;
      throw e;
    }
    this.positions.delete(pos.key);
    this.trades.unshift(rec);
    if (this.trades.length > 300) this.trades.length = 300;
    this.deps.appendLog?.('trades', rec);
    this._changed();
  }

  async _close(pos, reason) {
    if (pos.closing || !this.positions.has(pos.key)) return;
    if (pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT) {
      this._rejectImplausible(pos);
      return;
    }
    if (pos.venue === 'amm') return this._closeAmm(pos, reason);
    await super._close(pos, reason);
    const rec = this.trades[0];
    if (rec && rec.pnlSol === null && rec.mint === pos.mint && rec.delayMs === pos.delayMs && this.pools.has(pos.mint)) {
      const st = await this._readPool(pos.mint).catch(() => null);
      if (st) {
        const priced = this._ammRecord(pos, `${reason} (priced on PumpSwap)`, st, false);
        Object.assign(rec, priced, { time: rec.time });
        this.deps.appendLog?.('trades', { ...rec, repriced: true });
        this._changed();
      }
    }
  }

  _handleTrade(wallet, trade, tx, detectedAt, signature) {
    if (trade.venue === 'pumpswap' && tx) this._learnPool(tx, trade.mint, wallet.address);
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
    s.skipReasons = { ...this.skipReasons };
    s.rpc = typeof this.rpc?.stats === 'function' ? this.rpc.stats() : null;
    s.errorLog = this.errorLog.slice(0, 15);
    s.pools = this.pools.size;
    s.lastAmm = this.lastAmm;
    s.engine = { ammFeePct: this.ammFeePct, lateToleranceMs: this.lateToleranceMs, staleAfterS: this.staleAfterS };
    return s;
  }

  reset() {
    super.reset();
    this.lagSamples = [];
    this.rejected = 0;
    this.lastMismatch = null;
    this.skipReasons = this._emptyReasons();
  }
}
