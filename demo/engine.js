import { EventEmitter } from 'node:events';

export const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WSOL = 'So11111111111111111111111111111111111111112';
const TOKEN_DECIMALS = 6;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export const DEFAULTS = { buySol: 0.1, delaysMs: [1000, 2000, 3000], feePct: 1, costPerTxSol: 0.001, timeoutMin: 30 };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function sanitizeSettings(input = {}, base = DEFAULTS) {
  const out = { ...base, delaysMs: [...base.delaysMs] };
  const num = (v, min, max, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  if (input.buySol !== undefined) out.buySol = num(input.buySol, 0.001, 1000, base.buySol);
  if (input.feePct !== undefined) out.feePct = num(input.feePct, 0, 20, base.feePct);
  if (input.costPerTxSol !== undefined) out.costPerTxSol = num(input.costPerTxSol, 0, 1, base.costPerTxSol);
  if (input.timeoutMin !== undefined) out.timeoutMin = num(input.timeoutMin, 1, 1440, base.timeoutMin);
  if (input.delaysMs !== undefined) {
    const raw = Array.isArray(input.delaysMs) ? input.delaysMs : String(input.delaysMs).split(',');
    const arr = raw.map((x) => Math.round(Number(x))).filter((x) => Number.isFinite(x) && x >= 0 && x <= 60000);
    const uniq = [...new Set(arr)].slice(0, 6).sort((a, b) => a - b);
    if (uniq.length) out.delaysMs = uniq;
  }
  return out;
}

export class DemoEngine extends EventEmitter {
  constructor(deps) {
    super();
    this.deps = deps;
    this.settings = sanitizeSettings({});
    this.wallets = new Map();
    this.positions = new Map();
    this.busy = new Set();
    this.sells = new Map();
    this.trades = [];
    this.events = [];
    this.seen = new Set();
    this.skipped = 0;
    this.lastError = null;
    this.running = false;
    this.connected = false;
    this.ws = null;
    this.rpc = null;
    this.apiKey = null;
    this.txVersion = 0;
    this.nextReq = 1;
    this.pending = new Map();
    this.timer = null;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.notifyTimer = null;
  }

  addWallet(address, label) {
    address = String(address || '').trim();
    if (!BASE58.test(address)) throw new Error('Adresse Solana invalide (32 a 44 caracteres base58).');
    const cleanLabel = String(label || '').trim().slice(0, 40) || `${address.slice(0, 4)}...${address.slice(-4)}`;
    const existing = this.wallets.get(address);
    if (existing) {
      existing.label = cleanLabel;
    } else {
      this.wallets.set(address, { address, label: cleanLabel, subId: null, buys: 0, sells: 0, lastSeen: null });
      if (this.running && this.connected) this._subscribe(address);
    }
    this._changed();
  }

  removeWallet(address) {
    const w = this.wallets.get(address);
    if (!w) return;
    if (w.subId !== null && this.ws && this.connected) this._send({ jsonrpc: '2.0', id: this.nextReq++, method: 'logsUnsubscribe', params: [w.subId] });
    this.wallets.delete(address);
    this._changed();
  }

  setWallets(list) {
    const clean = [];
    for (const w of list || []) {
      const a = String(w.address || '').trim();
      if (!BASE58.test(a)) throw new Error(`Adresse invalide : ${a.slice(0, 12)}`);
      clean.push({ address: a, label: w.label });
    }
    const keep = new Set(clean.map((w) => w.address));
    for (const a of [...this.wallets.keys()]) if (!keep.has(a)) this.removeWallet(a);
    for (const w of clean) this.addWallet(w.address, w.label);
  }

  updateSettings(partial) {
    this.settings = sanitizeSettings(partial, this.settings);
    this._changed();
  }

  async start({ apiKey, settings, wallets }) {
    if (this.running) await this.stop();
    if (!apiKey || String(apiKey).length < 8) throw new Error('Cle Helius manquante.');
    if (settings) this.settings = sanitizeSettings(settings, this.settings);
    if (wallets) this.setWallets(wallets);
    if (!this.wallets.size) throw new Error('Ajoute au moins un wallet a suivre.');
    const rpc = this.deps.makeRpc(apiKey);
    try {
      await rpc('getSlot', []);
    } catch (e) {
      throw new Error(`Cle Helius refusee ou RPC injoignable : ${e.message}`);
    }
    this.rpc = rpc;
    this.apiKey = apiKey;
    this.running = true;
    this.lastError = null;
    this._connect();
    this.timer = setInterval(() => this._checkTimeouts(), 5000);
    this._changed();
  }

  async stop() {
    this.running = false;
    clearInterval(this.timer);
    clearInterval(this.pingTimer);
    clearTimeout(this.reconnectTimer);
    const ws = this.ws;
    this.ws = null;
    this.connected = false;
    for (const w of this.wallets.values()) w.subId = null;
    try {
      ws?.close();
    } catch {}
    this._changed();
  }

  reset() {
    this.trades = [];
    this.events = [];
    this.sells.clear();
    this.skipped = 0;
    for (const w of this.wallets.values()) {
      w.buys = 0;
      w.sells = 0;
    }
    this._changed();
  }

  snapshot() {
    return {
      running: this.running,
      connected: this.connected,
      settings: this.settings,
      wallets: [...this.wallets.values()].map((w) => ({
        address: w.address,
        label: w.label,
        buys: w.buys,
        sells: w.sells,
        lastSeen: w.lastSeen,
        subscribed: w.subId !== null,
      })),
      positions: [...this.positions.values()].map((p) => ({
        key: p.key,
        wallet: p.wallet,
        label: p.label,
        mint: p.mint,
        delayMs: p.delayMs,
        openedAt: p.openedAt,
        entryPrice: p.entryPrice,
        targetPrice: p.targetPrice,
        slipVsTargetPct: p.slipVsTargetPct,
        pipelineMs: p.pipelineMs,
      })),
      trades: this.trades.slice(0, 100),
      events: this.events.slice(0, 40),
      stats: this._stats(),
      skipped: this.skipped,
      lastError: this.lastError,
    };
  }

  _stats() {
    const byDelay = new Map();
    for (const d of this.settings.delaysMs) byDelay.set(d, []);
    for (const t of this.trades) {
      if (!byDelay.has(t.delayMs)) byDelay.set(t.delayMs, []);
      byDelay.get(t.delayMs).push(t);
    }
    return [...byDelay.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([delayMs, list]) => {
        const ok = list.filter((t) => t.pnlSol !== null);
        const wins = ok.filter((t) => t.pnlSol > 0).length;
        return {
          delayMs,
          n: ok.length,
          unpriced: list.length - ok.length,
          wins,
          winRate: ok.length ? wins / ok.length : null,
          totalPnlSol: ok.reduce((a, t) => a + t.pnlSol, 0),
          avgPnlPct: ok.length ? ok.reduce((a, t) => a + t.pnlPct, 0) / ok.length : null,
          medianSlipPct: median(ok.map((t) => t.slipVsTargetPct)),
        };
      });
  }

  _changed() {
    if (this.notifyTimer) return;
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null;
      this.emit('state', this.snapshot());
    }, 250);
  }

  _setError(msg) {
    this.lastError = { message: String(msg), time: Date.now() };
    this._changed();
  }

  _send(obj) {
    try {
      this.ws?.send(JSON.stringify(obj));
    } catch (e) {
      this._setError(`Envoi WebSocket : ${e.message}`);
    }
  }

  _subscribe(address) {
    const id = this.nextReq++;
    this.pending.set(id, address);
    this._send({ jsonrpc: '2.0', id, method: 'logsSubscribe', params: [{ mentions: [address] }, { commitment: 'confirmed' }] });
  }

  _connect() {
    const ws = this.deps.makeWs(this.apiKey);
    this.ws = ws;
    ws.on('open', () => {
      this.connected = true;
      this.pending.clear();
      for (const a of this.wallets.keys()) this._subscribe(a);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        try {
          ws.ping?.();
        } catch {}
      }, 30000);
      this._changed();
    });
    ws.on('message', (raw) => this._onMessage(raw));
    ws.on('error', (e) => this._setError(`WebSocket : ${e.message}`));
    ws.on('close', () => {
      this.connected = false;
      clearInterval(this.pingTimer);
      for (const w of this.wallets.values()) w.subId = null;
      this._changed();
      if (this.running && this.ws === ws) this.reconnectTimer = setTimeout(() => this._connect(), 2000);
    });
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const addr = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      if (typeof msg.result === 'number') {
        const w = this.wallets.get(addr);
        if (w) w.subId = msg.result;
        this._changed();
      } else if (msg.error) {
        this._setError(`Abonnement refuse : ${msg.error.message}`);
      }
      return;
    }
    if (msg.method !== 'logsNotification') return;
    const v = msg.params?.result?.value;
    if (!v || v.err || !v.signature || this.seen.has(v.signature)) return;
    this.seen.add(v.signature);
    if (this.seen.size > 5000) this.seen.clear();
    this._onSignature(v.signature, Date.now()).catch((e) => this._setError(e.message));
  }

  async _getTx(signature) {
    for (let i = 0; i < 8; i++) {
      let tx;
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
      if (tx) return tx;
      await sleep(400);
    }
    return null;
  }

  _parseTrade(tx, keys, target) {
    if (!tx || tx.meta?.err) return null;
    const venue = keys.includes(PUMP_PROGRAM) ? 'pump' : keys.includes(PUMPSWAP_PROGRAM) ? 'pumpswap' : null;
    if (!venue) return null;
    const idx = keys.indexOf(target);
    if (idx < 0) return null;
    const solDelta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9;
    const ui = (b) => Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0);
    const pre = new Map();
    const post = new Map();
    for (const b of tx.meta.preTokenBalances ?? []) if (b.owner === target) pre.set(b.mint, ui(b));
    for (const b of tx.meta.postTokenBalances ?? []) if (b.owner === target) post.set(b.mint, ui(b));
    let best = null;
    for (const mint of new Set([...pre.keys(), ...post.keys()])) {
      if (mint === WSOL) continue;
      const delta = (post.get(mint) ?? 0) - (pre.get(mint) ?? 0);
      if (delta !== 0 && (!best || Math.abs(delta) > Math.abs(best.delta))) best = { mint, delta };
    }
    if (!best) return null;
    const side = best.delta > 0 ? 'buy' : 'sell';
    const tokens = Math.abs(best.delta);
    const sol = Math.abs(solDelta);
    if (sol === 0 || (side === 'buy' && solDelta > 0) || (side === 'sell' && solDelta < 0)) return null;
    return { venue, mint: best.mint, side, tokens, sol, price: sol / tokens };
  }

  async _readCurve(mint) {
    const r = await this.rpc('getAccountInfo', [this.deps.curveAddress(mint), { encoding: 'base64', commitment: 'confirmed' }]);
    const v = r?.value;
    if (!v) return null;
    const d = Buffer.from(v.data[0], 'base64');
    if (d.length < 49) return null;
    return { vToken: Number(d.readBigUInt64LE(8)), vSol: Number(d.readBigUInt64LE(16)), complete: d[48] === 1 };
  }

  async _waitUntil(ts) {
    await sleep(Math.max(0, ts - Date.now()));
  }

  async _onSignature(signature, detectedAt) {
    const tx = await this._getTx(signature);
    if (!tx) return;
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
    const jobs = [];
    for (const wallet of this.wallets.values()) {
      if (!keys.includes(wallet.address)) continue;
      const trade = this._parseTrade(tx, keys, wallet.address);
      if (trade) jobs.push(this._handleTrade(wallet, trade, tx, detectedAt, signature));
    }
    await Promise.all(jobs);
  }

  async _handleTrade(wallet, trade, tx, detectedAt, signature) {
    wallet.lastSeen = Date.now();
    if (trade.side === 'buy') wallet.buys++;
    else wallet.sells++;
    const ev = {
      time: detectedAt,
      wallet: wallet.address,
      label: wallet.label,
      side: trade.side,
      mint: trade.mint,
      sol: trade.sol,
      price: trade.price,
      venue: trade.venue,
      signature,
      fetchMs: Date.now() - detectedAt,
    };
    this.events.unshift(ev);
    if (this.events.length > 200) this.events.length = 200;
    this.deps.appendLog?.('events', ev);
    this._changed();
    const wm = `${wallet.address}|${trade.mint}`;
    if (trade.side === 'buy') {
      this.sells.delete(wm);
      await Promise.all(this.settings.delaysMs.map((d) => this._open(wallet, trade, d, detectedAt)));
    } else {
      this.sells.set(wm, detectedAt);
      if (this.sells.size > 500) this.sells.delete(this.sells.keys().next().value);
      const targets = [...this.positions.values()].filter((p) => p.wallet === wallet.address && p.mint === trade.mint);
      await Promise.all(
        targets.map(async (p) => {
          await this._waitUntil(detectedAt + p.delayMs);
          await this._close(p, 'vente de la cible');
        })
      );
    }
  }

  async _open(wallet, trade, delayMs, detectedAt) {
    if (trade.venue !== 'pump') {
      this.skipped++;
      return;
    }
    const key = `${wallet.address}|${trade.mint}|${delayMs}`;
    if (this.positions.has(key) || this.busy.has(key)) return;
    this.busy.add(key);
    try {
      await this._waitUntil(detectedAt + delayMs);
      const curve = await this._readCurve(trade.mint);
      if (!curve || curve.complete) {
        this.skipped++;
        return;
      }
      const s = this.settings;
      const solInLamports = s.buySol * 1e9 * (1 - s.feePct / 100);
      const k = curve.vSol * curve.vToken;
      const tokensRaw = curve.vToken - k / (curve.vSol + solInLamports);
      if (!(tokensRaw > 0)) return;
      const price = s.buySol / (tokensRaw / 10 ** TOKEN_DECIMALS);
      const pos = {
        key,
        wallet: wallet.address,
        label: wallet.label,
        mint: trade.mint,
        delayMs,
        openedAt: Date.now(),
        tokensRaw,
        solInLamports,
        buySol: s.buySol,
        entryPrice: price,
        targetPrice: trade.price,
        slipVsTargetPct: (price / trade.price - 1) * 100,
        pipelineMs: Date.now() - detectedAt,
        closing: false,
      };
      this.positions.set(key, pos);
      this._changed();
      const sellAt = this.sells.get(`${wallet.address}|${trade.mint}`);
      if (sellAt && sellAt >= detectedAt) {
        await this._waitUntil(sellAt + delayMs);
        await this._close(pos, 'vente de la cible');
      }
    } catch (e) {
      this._setError(`Ouverture simulee : ${e.message}`);
    } finally {
      this.busy.delete(key);
    }
  }

  async _close(pos, reason) {
    if (pos.closing || !this.positions.has(pos.key)) return;
    pos.closing = true;
    const s = this.settings;
    let rec;
    try {
      const curve = await this._readCurve(pos.mint);
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
      const vSol = curve ? curve.vSol + pos.solInLamports : 0;
      const vToken = curve ? curve.vToken - pos.tokensRaw : 0;
      if (!curve || curve.complete || vToken <= 0) {
        rec = { ...base, reason: `${reason} (non evaluable)`, pnlSol: null, pnlPct: null, proceedsSol: null };
      } else {
        const k = vSol * vToken;
        const gross = vSol - k / (vToken + pos.tokensRaw);
        const proceeds = (gross * (1 - s.feePct / 100)) / 1e9 - s.costPerTxSol;
        const cost = pos.buySol + s.costPerTxSol;
        const pnlSol = proceeds - cost;
        rec = { ...base, reason, proceedsSol: proceeds, pnlSol, pnlPct: (pnlSol / cost) * 100 };
      }
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

  _checkTimeouts() {
    const limit = this.settings.timeoutMin * 60000;
    for (const pos of this.positions.values()) {
      if (!pos.closing && Date.now() - pos.openedAt > limit) this._close(pos, 'delai depasse').catch((e) => this._setError(e.message));
    }
  }
}
