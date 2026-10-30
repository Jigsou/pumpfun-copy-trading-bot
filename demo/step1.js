// Etape 1 : mesure du prix, regles d'entree supplementaires et mode de sortie.
// - echantillonne le PnL simule de chaque position ouverte (MFE / MAE + trajectoire) -> demo/logs/paths.jsonl
// - regles d'entree reglables depuis l'interface (panneau Entry rules), toutes desactivees par defaut sauf le cooldown par token
// - mode de sortie : vendre quand la cible vend (actuel) OU take profit reglable (la premiere condition atteinte gagne)
// Desactiver tout : variable d'environnement STEP1_OFF=1

const DEFAULTS = {
  sampleEveryMs: 500,
  maxMintsPerTick: 3,
  maxQueued: 3,
  maxSamples: 600,
  statusEveryMs: 5 * 60 * 1000,
};

export const RULE_DEFAULTS = {
  takeProfitMode: false,
  takeProfitPct: 30,
  allowCurve: true,
  allowPumpswap: true,
  maxImpactPct: 0,
  minMcapSol: 0,
  maxMcapSol: 0,
  minAgeSec: 0,
  maxAgeSec: 0,
  minBuyVsUsual: 0,
  maxOpenOps: 0,
  mintCooldownMin: 30,
  minWalletsOnToken: 0,
  confluenceWindowSec: 60,
  dailyLossLimitSol: 0,
};

const RULE_RANGES = {
  takeProfitPct: [1, 10000],
  maxImpactPct: [0, 1000],
  minMcapSol: [0, 1e7],
  maxMcapSol: [0, 1e7],
  minAgeSec: [0, 1e8],
  maxAgeSec: [0, 1e8],
  minBuyVsUsual: [0, 100],
  maxOpenOps: [0, 100],
  mintCooldownMin: [0, 1440],
  minWalletsOnToken: [0, 10],
  confluenceWindowSec: [1, 3600],
  dailyLossLimitSol: [0, 1000],
};
const RULE_BOOLS = ['takeProfitMode', 'allowCurve', 'allowPumpswap'];

export function sanitizeRules(input = {}, base = RULE_DEFAULTS) {
  const out = { ...base };
  for (const [k, [min, max]] of Object.entries(RULE_RANGES)) {
    if (input[k] === undefined || input[k] === '' || input[k] === null) continue;
    const n = Number(input[k]);
    if (Number.isFinite(n) && n >= min && n <= max) out[k] = n;
  }
  for (const k of RULE_BOOLS) if (typeof input[k] === 'boolean') out[k] = input[k];
  return out;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function curvePnlPct(pos, curve, s) {
  if (!curve || curve.complete) return null;
  const vSol = curve.vSol + pos.solInLamports;
  const vToken = curve.vToken - pos.tokensRaw;
  if (!(vToken > 0)) return null;
  const gross = vSol - (vSol * vToken) / (vToken + pos.tokensRaw);
  const proceeds = (gross * (1 - s.feePct / 100)) / 1e9 - s.costPerTxSol;
  const cost = pos.buySol + s.costPerTxSol;
  return ((proceeds - cost) / cost) * 100;
}

export function installStep1(engine, opts = {}) {
  if (process.env.STEP1_OFF === '1') return null;
  const o = { ...DEFAULTS, ...opts };
  let rules = sanitizeRules(opts.rules ?? {});
  const refused = {};
  const stats = { samples: 0, sampleErrors: 0, pathsLogged: 0, skippedBusyRpc: 0, tpTriggered: 0 };
  engine.step1 = stats;
  const refuse = (why) => {
    refused[why] = (refused[why] ?? 0) + 1;
    engine._changed?.();
  };

  const origUpdate = engine.updateSettings.bind(engine);
  engine.updateSettings = (partial) => {
    const { rules: incoming, ...rest } = partial ?? {};
    if (incoming && typeof incoming === 'object') rules = sanitizeRules(incoming, rules);
    origUpdate(rest);
  };

  const origSnapshot = engine.snapshot.bind(engine);
  engine.snapshot = () => ({ ...origSnapshot(), rules: { values: rules, refused: { ...refused }, stats: { ...stats } } });

  const origReset = engine.reset.bind(engine);
  engine.reset = () => {
    for (const k of Object.keys(refused)) delete refused[k];
    origReset();
  };

  const decisions = new Map();
  const firstOp = new Map();
  const buyHist = new Map();
  const recentBuys = new Map();

  const decide = (wallet, trade) => {
    const id = trade.opId;
    if (decisions.has(id)) return decisions.get(id);
    const r = rules;
    const now = Date.now();
    const w = wallet.address;
    const hist = buyHist.get(w) ?? [];
    buyHist.set(w, hist);
    const usual = hist.length >= 5 ? median(hist) : null;
    hist.push(trade.sol);
    if (hist.length > 30) hist.shift();
    const seen = recentBuys.get(trade.mint) ?? new Map();
    recentBuys.set(trade.mint, seen);
    seen.set(w, now);
    if (recentBuys.size > 500) recentBuys.delete(recentBuys.keys().next().value);

    const key = `${w}|${trade.mint}`;
    const prev = firstOp.get(key);
    const slow = engine.settings.delaysMs[engine.settings.delaysMs.length - 1];
    let why = null;
    if (trade.venue === 'pump' && !r.allowCurve) why = 'venueCurve';
    else if (trade.venue === 'pumpswap' && !r.allowPumpswap) why = 'venuePumpswap';
    else if (r.minBuyVsUsual > 0 && usual !== null && trade.sol < usual * r.minBuyVsUsual) why = 'buyBelowUsual';
    else if (r.mintCooldownMin > 0 && prev && prev.opId !== id && now - prev.t < r.mintCooldownMin * 60000) why = 'sameTokenCooldown';
    else if (r.minWalletsOnToken > 1) {
      let n = 0;
      for (const t of seen.values()) if (now - t <= r.confluenceWindowSec * 1000) n++;
      if (n < r.minWalletsOnToken) why = 'noConfluence';
    }
    if (!why && r.maxOpenOps > 0) {
      const open = new Set();
      for (const p of engine.positions.values()) open.add(p.opId ?? p.key);
      if (open.size >= r.maxOpenOps) why = 'tooManyOpen';
    }
    if (!why && r.dailyLossLimitSol > 0) {
      let pnl = 0;
      for (const t of engine.trades) {
        if (now - t.time > 86400000) break;
        if (t.delayMs === slow && typeof t.pnlSol === 'number') pnl += t.pnlSol;
      }
      if (pnl <= -r.dailyLossLimitSol) why = 'dailyLossLimit';
    }
    if (!why && (!prev || now - prev.t >= r.mintCooldownMin * 60000)) {
      firstOp.set(key, { opId: id, t: now });
      if (firstOp.size > 2000) firstOp.delete(firstOp.keys().next().value);
    }
    decisions.set(id, why);
    if (decisions.size > 2000) decisions.delete(decisions.keys().next().value);
    return why;
  };

  const origOpen = engine._open.bind(engine);
  engine._open = (wallet, trade, delayMs, detectedAt) => {
    if (trade.venue === 'pump' || trade.venue === 'pumpswap') {
      const why = decide(wallet, trade);
      if (why) {
        refuse(why);
        return Promise.resolve();
      }
    }
    return origOpen(wallet, trade, delayMs, detectedAt);
  };

  const origAccept = engine._acceptEntry.bind(engine);
  engine._acceptEntry = (pos, trade, detectedAt, delayMs) => {
    if (!origAccept(pos, trade, detectedAt, delayMs)) return false;
    const r = rules;
    let why = null;
    if (r.maxImpactPct > 0 && pos.impactPct != null && pos.impactPct > r.maxImpactPct) why = 'impactTooHigh';
    else if (r.minMcapSol > 0 && pos.mcapSol != null && pos.mcapSol < r.minMcapSol) why = 'mcapTooLow';
    else if (r.maxMcapSol > 0 && pos.mcapSol != null && pos.mcapSol > r.maxMcapSol) why = 'mcapTooHigh';
    else if (r.minAgeSec > 0 && pos.ageSec != null && pos.ageSec < r.minAgeSec) why = 'tokenTooYoung';
    else if (r.maxAgeSec > 0 && pos.ageSec != null && pos.ageSec > r.maxAgeSec) why = 'tokenTooOld';
    if (why) {
      refuse(why);
      return false;
    }
    return true;
  };

  const record = (pos, t, pnl) => {
    const path = pos.step1 ?? (pos.step1 = { t0: pos.openedAt, mfe: -Infinity, mae: Infinity, s: [] });
    if (pnl > path.mfe) path.mfe = pnl;
    if (pnl < path.mae) path.mae = pnl;
    if (path.s.length < o.maxSamples) path.s.push([t - path.t0, Math.round(pnl * 10) / 10]);
    stats.samples++;
  };

  const lastSample = new Map();
  let busy = false;
  let rr = 0;
  const sampler = setInterval(async () => {
    if (busy || !engine.running || !engine.rpc) return;
    const queued = engine.rpc.stats?.().queued ?? 0;
    if (queued > o.maxQueued) {
      stats.skippedBusyRpc++;
      return;
    }
    busy = true;
    try {
      const byMint = new Map();
      for (const p of engine.positions.values()) {
        if (p.closing) continue;
        if (!byMint.has(p.mint)) byMint.set(p.mint, []);
        byMint.get(p.mint).push(p);
      }
      for (const m of lastSample.keys()) if (!byMint.has(m)) lastSample.delete(m);
      const every = rules.takeProfitMode ? 500 : 1000;
      const now = Date.now();
      const due = [...byMint.keys()].filter((m) => now - (lastSample.get(m) ?? 0) >= every);
      const count = Math.min(due.length, o.maxMintsPerTick);
      for (let i = 0; i < count; i++) {
        const mint = due[(rr + i) % due.length];
        const list = byMint.get(mint);
        const amm = list[0].venue === 'amm';
        const st = amm ? await engine._readPool(mint) : null;
        const curve = amm ? null : await engine._readCurve(mint);
        const t = Date.now();
        lastSample.set(mint, t);
        for (const p of list) {
          if (p.closing) continue;
          const pnl = amm ? (st ? engine._ammRecord(p, 'sample', st, true).pnlPct : null) : curvePnlPct(p, curve, engine.settings);
          if (typeof pnl !== 'number' || !Number.isFinite(pnl)) continue;
          record(p, t, pnl);
          if (rules.takeProfitMode && !p.tpPending && pnl >= rules.takeProfitPct) {
            p.tpPending = true;
            stats.tpTriggered++;
            const tp = rules.takeProfitPct;
            engine
              ._waitUntil(Date.now() + p.delayMs)
              .then(() => engine._close(p, `take profit (${tp} %)`))
              .catch((e) => engine._setError(`Take profit : ${e.message}`));
          }
        }
      }
      rr += count;
    } catch {
      stats.sampleErrors++;
    } finally {
      busy = false;
    }
  }, o.sampleEveryMs);
  sampler.unref?.();

  const origClose = engine._close.bind(engine);
  engine._close = async (pos, reason) => {
    await origClose(pos, reason);
    if (pos.step1Logged || engine.positions.has(pos.key)) return;
    pos.step1Logged = true;
    const rec = engine.trades[0];
    const same = rec && rec.opId === pos.opId && rec.delayMs === pos.delayMs && rec.mint === pos.mint;
    const path = pos.step1;
    const mfePct = path && Number.isFinite(path.mfe) ? path.mfe : null;
    const maePct = path && Number.isFinite(path.mae) ? path.mae : null;
    if (same) {
      rec.mfePct = mfePct;
      rec.maePct = maePct;
    }
    try {
      engine.deps.appendLog?.('paths', {
        opId: pos.opId,
        wallet: pos.wallet,
        label: pos.label,
        mint: pos.mint,
        venue: pos.venue ?? 'pump',
        delayMs: pos.delayMs,
        slipVsTargetPct: pos.slipVsTargetPct,
        reason: same ? rec.reason : reason,
        pnlPct: same ? rec.pnlPct : null,
        heldSec: same ? rec.heldSec : null,
        mfePct,
        maePct,
        samples: path ? path.s : [],
      });
      stats.pathsLogged++;
    } catch {
      stats.sampleErrors++;
    }
  };

  const status = setInterval(() => console.log('[step1]', JSON.stringify({ ...stats, refused })), o.statusEveryMs);
  status.unref?.();
  return stats;
}
