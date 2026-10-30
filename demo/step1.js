// Etape 1 : mesure sans changer la logique d'entree/sortie.
// - echantillonne le PnL simule de chaque position ouverte (MFE / MAE + trajectoire)
// - ecrit demo/logs/paths.jsonl une ligne par scenario ferme
// - optionnel : un seul achat copie par wallet et par token (cooldown)
// Desactiver : variable d'environnement STEP1_OFF=1

const DEFAULTS = {
  sampleEveryMs: 1000,
  maxMintsPerTick: 4,
  maxQueued: 3,
  maxSamples: 600,
  oneEntryPerMint: true,
  mintCooldownMs: 30 * 60 * 1000,
  statusEveryMs: 5 * 60 * 1000,
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
  const stats = { dupSkippedScenarios: 0, samples: 0, sampleErrors: 0, pathsLogged: 0, skippedBusyRpc: 0 };
  engine.step1 = stats;

  const firstOp = new Map();
  const origOpen = engine._open.bind(engine);
  engine._open = (wallet, trade, delayMs, detectedAt) => {
    if (o.oneEntryPerMint) {
      const k = `${wallet.address}|${trade.mint}`;
      const prev = firstOp.get(k);
      const now = Date.now();
      if (prev && prev.opId !== trade.opId && now - prev.t < o.mintCooldownMs) {
        stats.dupSkippedScenarios++;
        return Promise.resolve();
      }
      if (!prev || now - prev.t >= o.mintCooldownMs) {
        firstOp.set(k, { opId: trade.opId, t: now });
        if (firstOp.size > 2000) firstOp.delete(firstOp.keys().next().value);
      }
    }
    return origOpen(wallet, trade, delayMs, detectedAt);
  };

  const record = (pos, t, pnl) => {
    const path = pos.step1 ?? (pos.step1 = { t0: pos.openedAt, mfe: -Infinity, mae: Infinity, s: [] });
    if (pnl > path.mfe) path.mfe = pnl;
    if (pnl < path.mae) path.mae = pnl;
    if (path.s.length < o.maxSamples) path.s.push([t - path.t0, Math.round(pnl * 10) / 10]);
    stats.samples++;
  };

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
      const mints = [...byMint.keys()];
      const count = Math.min(mints.length, o.maxMintsPerTick);
      for (let i = 0; i < count; i++) {
        const mint = mints[(rr + i) % mints.length];
        const list = byMint.get(mint);
        const amm = list[0].venue === 'amm';
        const st = amm ? await engine._readPool(mint) : null;
        const curve = amm ? null : await engine._readCurve(mint);
        const t = Date.now();
        for (const p of list) {
          if (p.closing) continue;
          const pnl = amm ? (st ? engine._ammRecord(p, 'sample', st, true).pnlPct : null) : curvePnlPct(p, curve, engine.settings);
          if (typeof pnl === 'number' && Number.isFinite(pnl)) record(p, t, pnl);
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

  const status = setInterval(() => console.log('[step1]', JSON.stringify(stats)), o.statusEveryMs);
  status.unref?.();
  return stats;
}
