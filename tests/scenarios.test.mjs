import assert from 'node:assert/strict';
import { DemoEngine, MAX_SCENARIOS, sanitizeSettings } from '../demo/engine.js';

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

console.log('Scenario engine tests passed (real engine.js).');
