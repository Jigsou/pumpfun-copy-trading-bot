// Etape 1 : mesure du prix, regles d'entree, mode de sortie et moyenne a la baisse.
// - lecture du prix des positions ouvertes (PnL simule, MFE / MAE + trajectoire -> demo/logs/paths.jsonl) UNIQUEMENT quand le mode take profit est actif
// - regles d'entree reglables depuis l'interface (Options > Entry rules, Exit mode, Average down)
// - mode de sortie : vendre quand la cible vend (actuel) OU take profit reglable (la premiere condition atteinte gagne)
// - moyenne a la baisse : les achats suivants de la cible sur le meme token ajoutent un achat plus petit a la position ouverte
// - rapports : stats par wallet au delai qui a le plus d'operations (le plus lent en cas d'egalite), Average down par delai, comparaison sur les operations presentes a tous les delais
// Les regles voyagent dans settings.rules (demo_start et demo_update_settings) et reviennent dans settings.rules du snapshot.
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
  scaleInMode: false,
  scaleInPct: 50,
  scaleInMax: 3,
  scaleInWhen: 'below',
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
  scaleInPct: [1, 1000],
  scaleInMax: [1, 20],
};
const RULE_BOOLS = ['takeProfitMode', 'allowCurve', 'allowPumpswap', 'scaleInMode'];
const RULE_ENUMS = { scaleInWhen: ['below', 'any', 'above'] };

export function sanitizeRules(input = {}, base = RULE_DEFAULTS) {
  const out = { ...base };
  for (const [k, [min, max]] of Object.entries(RULE_RANGES)) {
    if (input[k] === undefined || input[k] === '' || input[k] === null) continue;
    const n = Number(input[k]);
    if (Number.isFinite(n) && n >= min && n <= max) out[k] = n;
  }
  for (const k of RULE_BOOLS) if (typeof input[k] === 'boolean') out[k] = input[k];
  for (const [k, allowed] of Object.entries(RULE_ENUMS)) if (allowed.includes(input[k])) out[k] = input[k];
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

const summarize = (list) => {
  const wins = list.filter((t) => t.pnlSol > 0).length;
  const total = list.reduce((a, t) => a + t.pnlSol, 0);
  const best = list.length ? Math.max(...list.map((t) => t.pnlSol)) : null;
  return {
    n: list.length,
    winRate: list.length ? wins / list.length : null,
    avgPnlPct: list.length ? list.reduce((a, t) => a + (t.pnlPct ?? 0), 0) / list.length : null,
    totalPnlSol: total,
    withoutBestSol: best === null ? null : total - best,
    avgAdds: list.length ? list.reduce((a, t) => a + (t.adds ?? 0), 0) / list.length : null,
  };
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
  const stats = { samples: 0, sampleErrors: 0, pathsLogged: 0, skippedBusyRpc: 0, tpTriggered: 0, addsDone: 0 };
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

  const origStart = engine.start.bind(engine);
  engine.start = (arg = {}) => {
    const incoming = arg?.settings?.rules;
    if (incoming && typeof incoming === 'object') rules = sanitizeRules(incoming, rules);
    return origStart(arg);
  };

  const allDelays = () => {
    const set = new Set(engine.settings.delaysMs);
    for (const t of engine.trades) set.add(t.delayMs);
    for (const p of engine.positions.values()) set.add(p.delayMs);
    return [...set].sort((a, b) => a - b);
  };

  const addonReport = () => {
    const delays = allDelays();
    const closedAll = engine.trades.filter((t) => typeof t.pnlSol === 'number');
    const byDelay = {};
    for (const d of delays) {
      const closed = closedAll.filter((t) => t.delayMs === d);
      const withAdds = closed.filter((t) => (t.adds ?? 0) > 0);
      const rows = [];
      for (const p of engine.positions.values()) {
        if (p.delayMs !== d || !(p.adds > 0)) continue;
        rows.push({
          status: 'open',
          label: p.label,
          mint: p.mint,
          adds: p.adds,
          investedSol: p.investedSol ?? p.buySol,
          firstEntryPrice: p.firstEntryPrice ?? null,
          avgEntryPrice: p.entryPrice ?? null,
          pnlPct: null,
          pnlSol: null,
        });
      }
      for (const t of withAdds.slice(0, 8)) {
        rows.push({
          status: 'closed',
          label: t.label,
          mint: t.mint,
          adds: t.adds,
          investedSol: t.investedSol ?? t.buySol,
          firstEntryPrice: t.firstEntryPrice ?? null,
          avgEntryPrice: t.avgEntryPrice ?? null,
          pnlPct: t.pnlPct,
          pnlSol: t.pnlSol,
        });
      }
      byDelay[d] = { delayMs: d, withAdds: summarize(withAdds), without: summarize(closed.filter((t) => !((t.adds ?? 0) > 0))), rows };
    }
    let def = delays.length ? delays[delays.length - 1] : null;
    for (let i = delays.length - 1; i >= 0; i--) {
      const b = byDelay[delays[i]];
      if (b.withAdds.n > 0 || b.rows.length > 0) {
        def = delays[i];
        break;
      }
    }
    const d0 = def !== null ? byDelay[def] : null;
    return {
      enabled: rules.scaleInMode,
      delayMs: def,
      addsDone: stats.addsDone,
      delays,
      byDelay,
      withAdds: d0 ? d0.withAdds : summarize([]),
      without: d0 ? d0.without : summarize([]),
      rows: d0 ? d0.rows : [],
    };
  };

  const commonReport = () => {
    const delays = allDelays();
    const byOp = new Map();
    for (const t of engine.trades) {
      if (typeof t.pnlSol !== 'number' || !t.opId) continue;
      if (!byOp.has(t.opId)) byOp.set(t.opId, new Map());
      byOp.get(t.opId).set(t.delayMs, t);
    }
    const settingsDelays = engine.settings.delaysMs;
    const full = [...byOp.values()].filter((m) => settingsDelays.every((d) => m.has(d)));
    const per = {};
    for (const d of delays) per[d] = summarize(full.filter((m) => m.has(d)).map((m) => m.get(d)));
    return { n: full.length, ops: byOp.size, delays, byDelay: per };
  };

  const walletStatsFor = (address) => {
    const all = engine.trades.filter((t) => t.wallet === address);
    const mine = all.filter((t) => typeof t.pnlSol === 'number');
    const settingsDelays = engine.settings.delaysMs;
    const delays = [...new Set([...settingsDelays, ...all.map((t) => t.delayMs)])].sort((a, b) => a - b);
    let d = null;
    let bestCount = 0;
    for (const x of delays) {
      const c = mine.filter((t) => t.delayMs === x).length;
      if (c > 0 && c >= bestCount) {
        bestCount = c;
        d = x;
      }
    }
    const closedIds = new Set(all.map((t) => t.opId ?? `${t.time}|${t.mint}|${t.delayMs}`));
    const openIds = new Set();
    for (const p of engine.positions.values()) if (p.wallet === address) openIds.add(p.opId ?? p.key);
    const atD = d === null ? [] : mine.filter((t) => t.delayMs === d);
    const sum = summarize(atD);
    return {
      slowestDelayMs: d ?? (settingsDelays.length ? settingsDelays[settingsDelays.length - 1] : null),
      closedOps: closedIds.size,
      openOps: openIds.size,
      n: atD.length,
      unpriced: d === null ? 0 : all.filter((t) => t.delayMs === d && typeof t.pnlSol !== 'number').length,
      wins: atD.filter((t) => t.pnlSol > 0).length,
      winRate: sum.winRate,
      totalPnlSol: sum.totalPnlSol,
      pnlWithoutBest: sum.withoutBestSol,
      avgPnlPct: sum.avgPnlPct,
      medianSlipPct: median(atD.map((t) => t.slipVsTargetPct).filter((v) => typeof v === 'number')),
    };
  };

  const origSnapshot = engine.snapshot.bind(engine);
  engine.snapshot = () => {
    const snap = origSnapshot();
    const positions = (snap.positions ?? []).map((p) => {
      const real = engine.positions.get(p.key);
      if (!real || !(real.adds > 0)) return p;
      return { ...p, label: `${p.label} (+${real.adds} add-on${real.adds > 1 ? 's' : ''})`, adds: real.adds, investedSol: real.investedSol };
    });
    const wallets = (snap.wallets ?? []).map((w) => ({ ...w, stats: walletStatsFor(w.address) }));
    return {
      ...snap,
      positions,
      wallets,
      settings: snap.settings ? { ...snap.settings, rules } : snap.settings,
      premium: snap.premium ? { ...snap.premium, addon: addonReport(), common: commonReport() } : snap.premium,
      rules: { values: rules, refused: { ...refused }, stats: { ...stats } },
    };
  };

  const origReset = engine.reset.bind(engine);
  engine.reset = () => {
    for (const k of Object.keys(refused)) delete refused[k];
    stats.addsDone = 0;
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
    decisions.set(id, why);
    if (decisions.size > 2000) decisions.delete(decisions.keys().next().value);
    return why;
  };

  const origOpen = engine._open.bind(engine);
  const normalOpen = (wallet, trade, delayMs, detectedAt) => {
    if (trade.venue === 'pump' || trade.venue === 'pumpswap') {
      const why = decide(wallet, trade);
      if (why) {
        refuse(why);
        return Promise.resolve();
      }
    }
    return origOpen(wallet, trade, delayMs, detectedAt);
  };

  const handleAddOn = async (wallet, trade, delayMs, detectedAt, key) => {
    let pos = engine.positions.get(key);
    const until = Date.now() + 8000;
    while (!pos && engine.busy.has(key) && Date.now() < until) {
      await sleep(100);
      pos = engine.positions.get(key);
    }
    if (!pos) return normalOpen(wallet, trade, delayMs, detectedAt);
    const r = rules;
    const s = engine.settings;
    if (s.minWalletBuySol > 0 && trade.sol < s.minWalletBuySol) return refuse('addonBelowMinBuy');
    if ((pos.adds ?? 0) >= r.scaleInMax) return refuse('addonMaxReached');
    await engine._waitUntil(detectedAt + delayMs);
    if (pos.closing || !engine.positions.has(key)) return undefined;
    const sellAt = engine.sells.get(`${wallet.address}|${trade.mint}`);
    if (sellAt && sellAt >= detectedAt) return undefined;
    if (r.scaleInWhen === 'below' && !(trade.price < pos.entryPrice)) return refuse('addonNotLower');
    if (r.scaleInWhen === 'above' && trade.price < pos.entryPrice) return refuse('addonSkippedLower');
    const amm = pos.venue === 'amm';
    if ((trade.venue === 'pumpswap') !== amm) return refuse('addonVenueChanged');
    const addSol = s.buySol * (r.scaleInPct / 100);
    let solIn;
    let tokens;
    try {
      if (amm) {
        const st = await engine._readPool(trade.mint);
        const base = st ? st.base - pos.tokensRaw : 0;
        const quote = st ? st.quote + pos.solInLamports : 0;
        if (!(base > 0) || !(quote > 0)) return refuse('addonUnreadable');
        solIn = addSol * 1e9 * (1 - engine.ammFeePct / 100);
        tokens = base - (base * quote) / (quote + solIn);
      } else {
        const curve = await engine._readCurve(trade.mint);
        const vSol = curve ? curve.vSol + pos.solInLamports : 0;
        const vToken = curve ? curve.vToken - pos.tokensRaw : 0;
        if (!curve || curve.complete || curve.quoteIsSol === false || !(vSol > 0) || !(vToken > 0)) return refuse('addonUnreadable');
        solIn = addSol * 1e9 * (1 - s.feePct / 100);
        tokens = vToken - (vSol * vToken) / (vSol + solIn);
      }
    } catch (e) {
      engine._setError(`Add-on : ${e.message}`);
      return refuse('addonUnreadable');
    }
    if (!(tokens > 0)) return refuse('addonUnreadable');
    if (pos.closing || !engine.positions.has(key)) return undefined;
    if ((pos.adds ?? 0) >= r.scaleInMax) return refuse('addonMaxReached');
    const dec = amm ? (pos.decimals ?? 6) : 6;
    if (pos.firstEntryPrice === undefined) pos.firstEntryPrice = pos.entryPrice;
    if (pos.investedSol === undefined) pos.investedSol = pos.buySol;
    pos.tokensRaw += tokens;
    pos.solInLamports += solIn;
    pos.investedSol += addSol;
    pos.buySol += addSol + s.costPerTxSol;
    pos.adds = (pos.adds ?? 0) + 1;
    pos.entryPrice = pos.investedSol / (pos.tokensRaw / 10 ** dec);
    stats.addsDone++;
    engine._changed?.();
    return undefined;
  };

  engine._open = (wallet, trade, delayMs, detectedAt) => {
    if (rules.scaleInMode && (trade.venue === 'pump' || trade.venue === 'pumpswap')) {
      const key = `${wallet.address}|${trade.mint}|${delayMs}`;
      if (engine.positions.has(key) || engine.busy.has(key)) {
        return handleAddOn(wallet, trade, delayMs, detectedAt, key).catch((e) => engine._setError(`Add-on : ${e.message}`));
      }
    }
    return normalOpen(wallet, trade, delayMs, detectedAt);
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
    const k = `${pos.wallet}|${pos.mint}`;
    const prev = firstOp.get(k);
    if (!prev || prev.opId !== pos.opId) {
      firstOp.set(k, { opId: pos.opId, t: Date.now() });
      if (firstOp.size > 2000) firstOp.delete(firstOp.keys().next().value);
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
    if (!rules.takeProfitMode) return;
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
      const every = 500;
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
      if (pos.adds > 0) {
        rec.adds = pos.adds;
        rec.investedSol = pos.investedSol;
        rec.firstEntryPrice = pos.firstEntryPrice;
        rec.avgEntryPrice = pos.entryPrice;
        rec.buySol = pos.investedSol;
        rec.reason = `${rec.reason} - averaged down x${pos.adds}`;
        try {
          engine.deps.appendLog?.('trades', { ...rec, repriced: true });
        } catch {
          stats.sampleErrors++;
        }
      }
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
        adds: pos.adds ?? 0,
        investedSol: pos.investedSol ?? pos.buySol,
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
