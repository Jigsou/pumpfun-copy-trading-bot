import assert from 'node:assert/strict';
import { DemoEngine, MAX_SCENARIOS, sanitizeSettings } from '../demo/engine.js';
import { RobustDemoEngine } from '../demo/robust.js';

// Tests the real engine code (no stub of the pricing engine). Run: node tests/scenarios.test.mjs
assert.equal(MAX_SCENARIOS, 10);

const ten = Array.from({ length: 10 }, (_, i) => i * 500);
assert.deepEqual(sanitizeSettings({ delaysMs: ten }).delaysMs, ten);
assert.equal(sanitizeSettings({ delaysMs: Array.from({ length: 12 }, (_, i) => i * 100) }).delaysMs.length, 10);
assert.deepEqual(sanitizeSettings({ delaysMs: '3000,0,1000,1000' }).delaysMs, [0, 1000, 3000]);
assert.deepEqual(sanitizeSettings({ delaysMs: [300] }).delaysMs, [300]);

const engine = new DemoEngine({ appendLog: () => {} });
const opened = [];
engine._open = async (wallet, trade, delayMs) => {
  opened.push({ opId: trade.opId, total: trade.scenarioTotal, delayMs });
};
const wallet = { address: 'W', label: 'Trader', buys: 0, sells: 0 };
const buy = { side: 'buy', mint: 'M', sol: 1, price: 1, venue: 'pump' };

engine.updateSettings({ delaysMs: [300, 2000] });
await engine._handleTrade(wallet, buy, null, 100, 'sig1');
assert.deepEqual(opened.map((o) => o.delayMs), [300, 2000]);
assert.ok(opened.every((o) => o.opId === 'sig1|W' && o.total === 2));

engine.updateSettings({ delaysMs: ten });
opened.length = 0;
await engine._handleTrade(wallet, buy, null, 200, 'sig2');
assert.equal(opened.length, 10);
assert.ok(opened.every((o) => o.opId === 'sig2|W' && o.total === 10));

engine.positions.set('W|M|300', { key: 'W|M|300', opId: 'sig1|W', scenarioTotal: 2, wallet: 'W', label: 'Trader', mint: 'M', delayMs: 300 });
engine.trades = [{ opId: 'sig1|W', delayMs: 2000, pnlSol: 0.01, pnlPct: 5, slipVsTargetPct: 1 }];
const snap = engine.snapshot();
assert.deepEqual(snap.ops, { openOps: 1, openScenarios: 1, closedOps: 1, closedScenarios: 1 });
assert.equal(snap.positions[0].opId, 'sig1|W');

engine.updateSettings({ delaysMs: [300, 2000] });
engine.wallets.set('W', { address: 'W', label: 'Trader', subId: null, buys: 2, sells: 0, lastSeen: null });
engine.trades = [
  { wallet: 'W', opId: 'a', delayMs: 2000, pnlSol: 0.05, pnlPct: 50, slipVsTargetPct: 10 },
  { wallet: 'W', opId: 'b', delayMs: 2000, pnlSol: -0.02, pnlPct: -20, slipVsTargetPct: 30 },
  { wallet: 'W', opId: 'b', delayMs: 300, pnlSol: -0.01, pnlPct: -10, slipVsTargetPct: 5 },
  { wallet: 'X', opId: 'c', delayMs: 2000, pnlSol: 0.01, pnlPct: 10, slipVsTargetPct: 1 },
];
const walletStats = engine.snapshot().wallets.find((x) => x.address === 'W').stats;
assert.equal(walletStats.slowestDelayMs, 2000);
assert.equal(walletStats.closedOps, 2);
assert.equal(walletStats.openOps, 1);
assert.equal(walletStats.n, 2);
assert.equal(walletStats.wins, 1);
assert.ok(Math.abs(walletStats.totalPnlSol - 0.03) < 1e-9);
assert.ok(Math.abs(walletStats.pnlWithoutBest - -0.02) < 1e-9);
assert.equal(walletStats.medianSlipPct, 20);

const m = engine._entryMetrics({ sol: 2, price: 0.000000002, meta: { ageSec: 42 } }, 0.000000003, 1000000000, 100);
assert.ok(Math.abs(m.mcapSol - 3) < 1e-9);
assert.ok(Math.abs(m.traderMcapSol - 2) < 1e-9);
assert.equal(m.ageSec, 42);
assert.equal(m.walletSol, 2);
assert.equal(m.reserveSol, 100);
assert.ok(Math.abs(m.impactPct - 2) < 1e-9);
const empty = engine._entryMetrics({ sol: 1, price: 1 }, 1, null, 0);
assert.equal(empty.mcapSol, null);
assert.equal(empty.impactPct, null);
assert.equal(empty.ageSec, null);
assert.equal(engine._metricFields({ venue: 'amm', mcapSol: 5 }).venue, 'pumpswap');
assert.equal(engine._metricFields({}).venue, 'pump');

const calls = [];
const e2 = new DemoEngine({ appendLog: () => {}, curveAddress: (mint) => `curve-${mint}` });
e2.rpc = async (method) => {
  calls.push(method);
  if (method === 'getTokenSupply') return { value: { uiAmountString: '1000000000' } };
  return [{ blockTime: 1000 }, { blockTime: 900 }, { blockTime: 950 }];
};
assert.equal(await e2._createdAt('M'), 900);
assert.equal(await e2._createdAt('M'), 900);
assert.equal(await e2._supplyUi('M'), 1000000000);
assert.equal(await e2._supplyUi('M'), 1000000000);
assert.deepEqual(calls, ['getSignaturesForAddress', 'getTokenSupply']);

const e3 = new DemoEngine({ appendLog: () => {}, curveAddress: (mint) => `curve-${mint}` });
e3.rpc = async () => Array.from({ length: 1000 }, (_, i) => ({ blockTime: 1000 + i }));
assert.equal(await e3._createdAt('M'), null);

let failing = true;
const e4 = new DemoEngine({ appendLog: () => {}, curveAddress: (mint) => `curve-${mint}` });
e4.rpc = async () => {
  if (failing) throw new Error('boom');
  return [{ blockTime: 500 }];
};
assert.equal(await e4._createdAt('M'), null);
failing = false;
assert.equal(await e4._createdAt('M'), 500);

const robust = new RobustDemoEngine({ appendLog: () => {} });
robust.updateSettings({ delaysMs: [300, 2000] });
robust.trades = [
  ...Array.from({ length: 12 }, (_, i) => ({
    delayMs: 2000,
    pnlSol: i < 4 ? -0.02 : 0.01,
    pnlPct: i < 4 ? -20 : 10,
    impactPct: i + 1,
    mcapSol: i < 6 ? i + 10 : null,
    ageSec: null,
    walletSol: 0.5,
  })),
  { delayMs: 300, pnlSol: 5, pnlPct: 5000, impactPct: 99, mcapSol: 1, ageSec: 1, walletSol: 9 },
];
const report = robust._bucketReport();
assert.equal(report.delayMs, 2000);
assert.equal(report.closed, 12);
const [impact, mcap, age] = report.metrics;
assert.equal(impact.key, 'impactPct');
assert.equal(impact.buckets.length, 3);
assert.deepEqual(impact.buckets.map((b) => b.n), [4, 4, 4]);
assert.equal(impact.buckets[0].winRate, 0);
assert.equal(impact.buckets[1].winRate, 1);
assert.ok(Math.abs(impact.buckets[0].totalPnlSol + 0.08) < 1e-9);
assert.ok(Math.abs(impact.buckets[1].pnlWithoutBest - 0.03) < 1e-9);
assert.equal(mcap.n, 6);
assert.equal(mcap.missing, 6);
assert.equal(mcap.buckets.length, 2);
assert.ok(Math.abs(mcap.buckets[1].winRate - 2 / 3) < 1e-9);
assert.equal(age.n, 0);
assert.equal(age.buckets.length, 0);

console.log('Scenario engine tests passed (real engine.js and robust.js).');
