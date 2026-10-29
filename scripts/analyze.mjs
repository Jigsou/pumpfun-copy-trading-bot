import fs from 'node:fs';

// Offline analysis of demo/logs/trades.jsonl with a chronological training / validation split.
// Usage: node scripts/analyze.mjs [file] [--delay MS] [--split 0.5] [--parts 3]
const NL = String.fromCharCode(10);
const argv = process.argv.slice(2);
let file = 'demo/logs/trades.jsonl';
let delay = null;
let split = 0.5;
let parts = 3;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--delay') delay = Number(argv[++i]);
  else if (argv[i] === '--split') split = Number(argv[++i]);
  else if (argv[i] === '--parts') parts = Number(argv[++i]);
  else file = argv[i];
}
if (!(split > 0 && split < 1) || !Number.isInteger(parts) || parts < 2 || parts > 6) {
  console.error('Usage: node scripts/analyze.mjs [file] [--delay MS] [--split 0.5] [--parts 3]');
  process.exit(1);
}
if (!fs.existsSync(file)) {
  console.error(`File not found: ${file}`);
  process.exit(1);
}

const METRICS = [
  ['impactPct', 'Trader impact (his buy / pool SOL, in %)'],
  ['mcapSol', 'Market cap at your entry (SOL)'],
  ['ageSec', 'Token age at his buy (seconds)'],
  ['walletSol', 'His buy size (SOL)'],
];

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
const fmt = (v, d = 1) => (v == null ? '-' : v.toFixed(d));

function summarize(list) {
  const pnl = list.map((t) => t.pnlSol);
  const total = sum(pnl);
  return {
    n: list.length,
    win: list.length ? (list.filter((t) => t.pnlSol > 0).length / list.length) * 100 : null,
    median: median(list.map((t) => t.pnlPct)),
    total,
    without: list.length ? total - Math.max(...pnl) : null,
  };
}

function line(label, s) {
  return `  ${label.padEnd(30)} n=${String(s.n).padStart(3)}  win=${fmt(s.win, 0).padStart(4)}%  medianPnl=${fmt(s.median).padStart(7)}%  total=${fmt(s.total, 4).padStart(8)} SOL  withoutBest=${fmt(s.without, 4).padStart(8)} SOL`;
}

const latest = new Map();
for (const text of fs.readFileSync(file, 'utf8').split(NL)) {
  if (!text.trim()) continue;
  let t;
  try {
    t = JSON.parse(text);
  } catch {
    continue;
  }
  if (typeof t.pnlSol !== 'number' || typeof t.pnlPct !== 'number') continue;
  latest.set(`${t.opId ?? t.time}|${t.mint}|${t.delayMs}`, t);
}

let rows = [...latest.values()];
const delays = [...new Set(rows.map((t) => t.delayMs))].sort((a, b) => a - b);
if (!delays.length) {
  console.log('No closed priced trades in this file yet.');
  process.exit(0);
}
const chosen = delay ?? delays[delays.length - 1];
rows = rows.filter((t) => t.delayMs === chosen).sort((a, b) => a.time - b.time);
const cut = Math.floor(rows.length * split);
const train = rows.slice(0, cut);
const test = rows.slice(cut);

console.log(`File: ${file}`);
console.log(`Scenario: ${chosen} ms (available: ${delays.join(', ')}). One row per operation, duplicates from repricing removed.`);
console.log(`Trades: ${rows.length} (training ${train.length}, validation ${test.length}). Chronological split at ${Math.round(split * 100)} %.`);
if (rows.length < 40) console.log('WARNING: fewer than 40 trades. Nothing below can be trusted yet.');

for (const [key, label] of METRICS) {
  const values = train
    .map((t) => t[key])
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  console.log(NL + label);
  if (values.length < parts * 3) {
    console.log(`  Not enough training trades with a value (${values.length}).`);
    continue;
  }
  const edges = [];
  for (let i = 1; i < parts; i++) edges.push(values[Math.floor((i * values.length) / parts)]);
  const bucketOf = (t) => {
    const v = t[key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return -1;
    let b = 0;
    while (b < edges.length && v >= edges[b]) b++;
    return b;
  };
  const names = [];
  for (let b = 0; b < parts; b++) {
    const lo = b === 0 ? '-inf' : fmt(edges[b - 1], 4);
    const hi = b === parts - 1 ? '+inf' : fmt(edges[b], 4);
    names.push(`[${lo}, ${hi})`);
  }
  for (const [name, list] of [
    ['TRAINING (thresholds are computed here)', train],
    ['VALIDATION (same thresholds, unseen trades)', test],
  ]) {
    console.log(`  ${name}`);
    for (let b = 0; b < parts; b++) console.log(`  ${line(names[b], summarize(list.filter((t) => bucketOf(t) === b)))}`);
    const missing = list.filter((t) => bucketOf(t) === -1);
    if (missing.length) console.log(`  ${line('(no value)', summarize(missing))}`);
  }
}

console.log(NL + 'How to read this: a threshold is only worth keeping if the VALIDATION rows show the same direction as the TRAINING rows,');
console.log('with at least 10 trades per row. If they disagree, the pattern was noise.');
