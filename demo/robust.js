import { DemoEngine, PUMP_PROGRAM, PUMPSWAP_PROGRAM } from './engine.js';
import { WSOL, decodeBondingCurve, decodePool } from './layouts.js';

export const STALE_AFTER_S = 30;
export const IMPLAUSIBLE_SLIP_PCT = -50;
export const IMPLAUSIBLE_HIGH_PCT = 1000;
export const LATE_TOLERANCE_MS = 800;
export const AMM_FEE_PCT = 1.25;
const MAX_TRADES = 5000;

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
    this.nonSolPools = new Map();
    this.lastAmm = null;
    this.errorLog = [];
    this.skipReasons = this._emptyReasons();
    this.counts = { walletTrades: 0, onCurve: 0, onAmm: 0 };
    this.filtered = { tooSmall: 0, premiumTooHigh: 0 };
    this.rawDumps = [];
    this.dumpedMints = new Set();
    this.poolFails = [];
    this.poolOk = { fromInstruction: 0, fromBalances: 0 };
    this.poolLayout = { verifiedReads: 0, mismatches: 0, last: [] };
    this.mintsSeen = new Set();
    this.mintsUsable = new Set();
    this.startedAt = Date.now();
  }

  _emptyReasons() {
    return {
      stale: 0,
      late: 0,
      curveUnavailable: 0,
      curveQuoteNotSol: 0,
      ammPoolUnknown: 0,
      ammQuoteNotSol: 0,
      ammUnreadable: 0,
      txNotFound: 0,
      notATrade: 0,
    };
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
        const m = String(e.message).match(/maxSupportedTransactionVersion[^0-9]*([0-9]+)/);
        if (m && Number(m[1]) > this.txVersion) {
          this.txVersion = Number(m[1]);
          continue;
        }
        throw e;
      }
      if (tx) break;
      await sleep(200);
    }
    if (!tx) {
      this.skipReasons.txNotFound++;
      this._changed();
      return null;
    }
    if (tx.blockTime && Date.now() / 1000 - tx.blockTime > this.staleAfterS) {
      this.skipped++;
      this.skipReasons.stale++;
      this._changed();
      return null;
    }
    return tx;
  }

  async _fetchCurve(mint) {
    const r = await this.rpc('getAccountInfo', [this.deps.curveAddress(mint), { encoding: 'base64', commitment: 'confirmed' }]);
    const v = r?.value;
    if (!v) return null;
    return decodeBondingCurve(Buffer.from(v.data[0], 'base64'));
  }

  _readCurve(mint) {
    const existing = this.inflight.get(mint);
    if (existing) return existing;
    const p = this._fetchCurve(mint)
      .then((c) => {
        if (c) {
          this.lastCurve.set(mint, {
            vToken: c.vToken,
            vSol: c.vSol,
            complete: c.complete,
            quoteIsSol: c.quoteIsSol,
            quoteMint: c.quoteMint,
            readAt: Date.now(),
          });
        }
        if (this.lastCurve.size > 200) this.lastCurve.delete(this.lastCurve.keys().next().value);
        return c;
      })
      .finally(() => this.inflight.delete(mint));
    this.inflight.set(mint, p);
    return p;
  }

  _skipCurve() {
    super._skipCurve();
    this.skipReasons.curveUnavailable++;
  }

  _trimPools() {
    if (this.pools.size > 300) this.pools.delete(this.pools.keys().next().value);
  }

  _markNonSol(mint, otherMint) {
    this.nonSolPools.set(mint, otherMint);
    if (this.nonSolPools.size > 300) this.nonSolPools.delete(this.nonSolPools.keys().next().value);
    this.pools.delete(mint);
  }

  _allInstructions(tx) {
    const outer = tx?.transaction?.message?.instructions ?? [];
    const inner = (tx?.meta?.innerInstructions ?? []).flatMap((i) => i.instructions ?? []);
    return [...outer, ...inner];
  }

  _programIds(tx) {
    return [...new Set(this._allInstructions(tx).map((ix) => ix.programId).filter(Boolean))].slice(0, 12);
  }

  _pumpswapInstructions(tx) {
    const out = [];
    for (const ix of this._allInstructions(tx)) {
      if (ix.programId === PUMPSWAP_PROGRAM && Array.isArray(ix.accounts)) {
        out.push(ix.accounts.map((a) => (typeof a === 'string' ? a : (a?.pubkey ?? String(a)))));
      }
    }
    return out;
  }

  _learnPool(tx, mint, traderAddress) {
    const known = this.pools.has(mint);
    const signature = tx?.transaction?.signatures?.[0] ?? null;
    const fail = (reason, extra = {}) => {
      if (known) return;
      this.poolFails.unshift({ time: Date.now(), mint, signature, reason, ...extra });
      if (this.poolFails.length > 8) this.poolFails.length = 8;
    };
    try {
      const ixs = this._pumpswapInstructions(tx);
      for (const acc of ixs) {
        if (acc.length > 4 && acc[4] !== WSOL && (acc[3] === mint || acc[4] === mint)) {
          this._markNonSol(mint, acc[4] === mint ? acc[3] : acc[4]);
          return;
        }
      }
      if (this.nonSolPools.has(mint)) return;
      const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
      const post = tx.meta?.postTokenBalances ?? [];
      if (!post.length) return fail('no token balances in the transaction');
      const byKey = new Map();
      for (const b of post) byKey.set(keys[b.accountIndex], b);
      for (const acc of ixs) {
        const base = byKey.get(acc[7]);
        const quote = byKey.get(acc[8]);
        if (base && quote && base.mint === mint && quote.mint === WSOL) {
          this.pools.set(mint, {
            owner: base.owner,
            poolAddress: acc[0],
            baseVault: acc[7],
            quoteVault: acc[8],
            decimals: base.uiTokenAmount.decimals,
          });
          this._trimPools();
          this.poolOk.fromInstruction++;
          return;
        }
      }
      const byOwner = new Map();
      for (const b of post) {
        if (!b.owner || b.owner === traderAddress) continue;
        const o = byOwner.get(b.owner) ?? {};
        if (b.mint === mint) o.base = b;
        else if (b.mint === WSOL && (!o.quote || Number(b.uiTokenAmount.amount) > Number(o.quote.uiTokenAmount.amount))) o.quote = b;
        byOwner.set(b.owner, o);
      }
      const found = [...byOwner.entries()].filter(([, o]) => o.base && o.quote);
      if (!found.length) {
        return fail('no pool account holds both the token and WSOL', {
          pumpswapInstructions: ixs.length,
          pumpswapAccounts: ixs[0] ? ixs[0].slice(0, 12) : null,
          programs: this._programIds(tx),
          balances: post.slice(0, 10).map((b) => ({ index: b.accountIndex, mint: b.mint, owner: b.owner, amount: b.uiTokenAmount?.amount })),
        });
      }
      found.sort((a, b) => Number(b[1].quote.uiTokenAmount.amount) - Number(a[1].quote.uiTokenAmount.amount));
      const [owner, o] = found[0];
      this.pools.set(mint, {
        owner,
        poolAddress: owner,
        baseVault: keys[o.base.accountIndex],
        quoteVault: keys[o.quote.accountIndex],
        decimals: o.base.uiTokenAmount.decimals,
      });
      this._trimPools();
      this.poolOk.fromBalances++;
    } catch (e) {
      fail('exception: ' + e.message);
    }
  }

  _layoutMismatch(mint, reason, extra = {}) {
    this.poolLayout.mismatches++;
    if (this.poolLayout.last.length < 3) this.poolLayout.last.push({ time: Date.now(), mint, reason, ...extra });
    return { virtualQuote: 0, ok: false };
  }

  _poolMeta(pool, mint, acct) {
    const data = acct?.data;
    if (!Array.isArray(data) || typeof data[0] !== 'string') return this._layoutMismatch(mint, 'pool account not returned as base64');
    let d = null;
    try {
      d = decodePool(Buffer.from(data[0], 'base64'));
    } catch {
      d = null;
    }
    if (!d) return this._layoutMismatch(mint, 'pool account too short');
    if (d.baseMint !== mint || d.baseVault !== pool.baseVault || d.quoteVault !== pool.quoteVault) {
      return this._layoutMismatch(mint, 'decoded pool does not match the instruction accounts', {
        decoded: { baseMint: d.baseMint, quoteMint: d.quoteMint, baseVault: d.baseVault, quoteVault: d.quoteVault },
      });
    }
    if (d.quoteMint !== WSOL) {
      this._markNonSol(mint, d.quoteMint);
      return { virtualQuote: 0, ok: false, nonSol: true };
    }
    this.poolLayout.verifiedReads++;
    return { virtualQuote: Number(d.virtualQuote), ok: true };
  }

  _readPool(mint) {
    const existing = this.inflightPool.get(mint);
    if (existing) return existing;
    const pool = this.pools.get(mint);
    if (!pool) return Promise.resolve(null);
    const p = this.rpc('getMultipleAccounts', [[pool.poolAddress, pool.baseVault, pool.quoteVault], { encoding: 'jsonParsed', commitment: 'confirmed' }])
      .then((r) => {
        const v = r?.value;
        const b = v?.[1]?.data?.parsed?.info?.tokenAmount;
        const q = v?.[2]?.data?.parsed?.info?.tokenAmount;
        if (!b || !q) return null;
        const meta = this._poolMeta(pool, mint, v?.[0]);
        if (meta.nonSol) return null;
        const vaultQuote = Number(q.amount);
        const effective = vaultQuote + meta.virtualQuote;
        if (!(effective > 0)) return null;
        const st = { base: Number(b.amount), quote: effective, decimals: b.decimals ?? pool.decimals };
        this.lastAmm = {
          mint,
          baseVault: pool.baseVault,
          quoteVault: pool.quoteVault,
          baseRaw: st.base,
          quoteVaultLamports: vaultQuote,
          virtualQuote: meta.virtualQuote,
          effectiveQuoteLamports: effective,
          layoutVerified: meta.ok,
          readAt: Date.now(),
        };
        return st;
      })
      .finally(() => this.inflightPool.delete(mint));
    this.inflightPool.set(mint, p);
    return p;
  }

  async _dumpCurveAccount(mint) {
    if (this.dumpedMints.has(mint) || this.rawDumps.length >= 6) return;
    this.dumpedMints.add(mint);
    const addr = this.deps.curveAddress(mint);
    const r = await this.rpc('getAccountInfo', [addr, { encoding: 'base64', commitment: 'confirmed' }]);
    const v = r?.value;
    if (!v) {
      this.rawDumps.unshift({ mint, addr, missing: true, readAt: Date.now() });
      return;
    }
    const d = Buffer.from(v.data[0], 'base64');
    const dec = decodeBondingCurve(d);
    this.rawDumps.unshift({
      mint,
      addr,
      owner: v.owner,
      lamports: v.lamports,
      length: d.length,
      quoteMint: dec ? dec.quoteMint : null,
      quoteIsSol: dec ? dec.quoteIsSol : null,
      hexHead: d.subarray(0, 96).toString('hex'),
      readAt: Date.now(),
    });
    this._changed();
  }

  _recordRejection(pos, reason) {
    this.rejected++;
    this.lastMismatch = {
      reason,
      mint: pos.mint,
      venue: pos.venue ?? 'pump',
      delayMs: pos.delayMs,
      botEntryPriceSol: pos.entryPrice,
      walletFillPriceSol: pos.targetPrice,
      differencePct: pos.slipVsTargetPct,
      lastCurveRead: this.lastCurve.get(pos.mint) ?? null,
      lastPoolRead: this.lastAmm && this.lastAmm.mint === pos.mint ? this.lastAmm : null,
    };
    if ((pos.venue ?? 'pump') === 'pump') {
      this._dumpCurveAccount(pos.mint).catch((e) => this._setError('Curve dump: ' + e.message));
    }
    this._changed();
  }

  _acceptEntry(pos, trade, detectedAt, delayMs) {
    const venue = pos.venue ?? 'pump';
    if (venue === 'pump') {
      const meta = this.lastCurve.get(pos.mint);
      if (meta && meta.quoteIsSol === false) {
        this.skipped++;
        this.skipReasons.curveQuoteNotSol++;
        this._changed();
        return false;
      }
    }
    if (pos.openedAt - (detectedAt + delayMs) > this.lateToleranceMs) {
      this.skipped++;
      this.skipReasons.late++;
      this._changed();
      return false;
    }
    if (pos.slipVsTargetPct < IMPLAUSIBLE_SLIP_PCT) {
      this._recordRejection(pos, 'entry far cheaper than the wallet fill');
      return false;
    }
    if (pos.slipVsTargetPct > IMPLAUSIBLE_HIGH_PCT) {
      this._recordRejection(pos, 'entry far more expensive than the wallet fill');
      return false;
    }
    const cap = this.settings.maxPremiumPct;
    if (cap > 0 && pos.slipVsTargetPct > cap) {
      this.filtered.premiumTooHigh++;
      this._changed();
      return false;
    }
    this.mintsUsable.add(pos.mint);
    return true;
  }

  async _open(wallet, trade, delayMs, detectedAt) {
    const min = this.settings.minWalletBuySol;
    if (min > 0 && trade.sol < min) {
      this.filtered.tooSmall++;
      return;
    }
    const key = `${wallet.address}|${trade.mint}|${delayMs}`;
    if (trade.venue === 'pumpswap') return this._openAmm(wallet, trade, delayMs, detectedAt, key);
    return super._open(wallet, trade, delayMs, detectedAt);
  }

  async _openAmm(wallet, trade, delayMs, detectedAt, key) {
    if (this.positions.has(key) || this.busy.has(key)) return;
    if (this.nonSolPools.has(trade.mint)) {
      this.skipped++;
      this.skipReasons.ammQuoteNotSol++;
      return;
    }
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
        if (this.nonSolPools.has(trade.mint)) this.skipReasons.ammQuoteNotSol++;
        else this.skipReasons.ammUnreadable++;
        return;
      }
      const now = Date.now();
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
      if (!this._acceptEntry(pos, trade, detectedAt, delayMs)) return;
      this.positions.set(key, pos);
      this._changed();
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
    if (this.trades.length > MAX_TRADES) this.trades.length = MAX_TRADES;
    this.deps.appendLog?.('trades', rec);
    this._changed();
  }

  async _close(pos, reason) {
    if (pos.closing || !this.positions.has(pos.key)) return;
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
    this.counts.walletTrades++;
    if (trade.venue === 'pump') this.counts.onCurve++;
    else this.counts.onAmm++;
    this.mintsSeen.add(trade.mint);
    if (this.mintsSeen.size > 20000) this.mintsSeen.clear();
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

  _premiumBuckets() {
    const delays = this.settings.delaysMs;
    const slow = delays[delays.length - 1];
    const rows = this.trades.filter((t) => t.delayMs === slow && t.pnlSol !== null && typeof t.slipVsTargetPct === 'number');
    const defs = [
      ['< 10 %', -Infinity, 10],
      ['10 to 25 %', 10, 25],
      ['25 to 50 %', 25, 50],
      ['> 50 %', 50, Infinity],
    ];
    return {
      delayMs: slow ?? null,
      buckets: defs.map(([label, lo, hi]) => {
        const r = rows.filter((t) => t.slipVsTargetPct >= lo && t.slipVsTargetPct < hi);
        const wins = r.filter((t) => t.pnlSol > 0).length;
        return {
          label,
          n: r.length,
          winRate: r.length ? wins / r.length : null,
          avgPnlPct: avg(r.map((t) => t.pnlPct)),
          medianPnlPct: pct(r.map((t) => t.pnlPct), 0.5),
          totalPnlSol: r.reduce((a, t) => a + t.pnlSol, 0),
        };
      }),
    };
  }

  _coverage() {
    return {
      startedAt: this.startedAt,
      walletTrades: this.counts.walletTrades,
      onCurve: this.counts.onCurve,
      onAmm: this.counts.onAmm,
      distinctTokens: this.mintsSeen.size,
      usableTokens: this.mintsUsable.size,
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
    s.filtered = { ...this.filtered };
    s.premium = this._premiumBuckets();
    s.rawDumps = this.rawDumps.slice(0, 4);
    s.poolDiag = {
      ok: { ...this.poolOk },
      fails: this.poolFails.slice(0, 3),
      layout: { verifiedReads: this.poolLayout.verifiedReads, mismatches: this.poolLayout.mismatches, last: this.poolLayout.last.slice(0, 3) },
    };
    s.rpc = typeof this.rpc?.stats === 'function' ? this.rpc.stats() : null;
    s.errorLog = this.errorLog.slice(0, 15);
    s.pools = this.pools.size;
    s.nonSolPools = this.nonSolPools.size;
    s.lastAmm = this.lastAmm;
    s.engine = { ammFeePct: this.ammFeePct, lateToleranceMs: this.lateToleranceMs, staleAfterS: this.staleAfterS };
    return s;
  }

  reset() {
    super.reset();
    this.positions.clear();
    this.lagSamples = [];
    this.rejected = 0;
    this.lastMismatch = null;
    this.skipReasons = this._emptyReasons();
    this.counts = { walletTrades: 0, onCurve: 0, onAmm: 0 };
    this.filtered = { tooSmall: 0, premiumTooHigh: 0 };
    this.mintsSeen = new Set();
    this.mintsUsable = new Set();
    this.poolLayout = { verifiedReads: 0, mismatches: 0, last: [] };
    this.startedAt = Date.now();
  }
}
