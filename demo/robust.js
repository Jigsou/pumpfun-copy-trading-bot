import { DemoEngine } from './engine.js';

export const STALE_AFTER_S = 30;

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
    const p = super._readCurve(mint).finally(() => this.inflight.delete(mint));
    this.inflight.set(mint, p);
    return p;
  }
}
