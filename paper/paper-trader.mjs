import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const API_KEY = process.env.HELIUS_API_KEY;
const TARGET = process.env.TARGET_WALLET;
const BUY_SOL = Number(process.env.BUY_SOL ?? 0.1);
const EXTRA_DELAY_MS = Number(process.env.EXTRA_DELAY_MS ?? 1500);
const FEE_PCT = Number(process.env.FEE_PCT ?? 1) / 100;
const COST_PER_TX_SOL = Number(process.env.COST_PER_TX_SOL ?? 0.001);
const TIMEOUT_MIN = Number(process.env.TIMEOUT_MIN ?? 30);

if (!API_KEY || !TARGET) {
  console.error('Il manque HELIUS_API_KEY ou TARGET_WALLET dans paper/.env');
  process.exit(1);
}

const PUMP_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const PUMPSWAP_PROGRAM = 'pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA';
const WSOL = 'So11111111111111111111111111111111111111112';
const TOKEN_DECIMALS = 6;
const RPC_HTTP = `https://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
const RPC_WS = `wss://mainnet.helius-rpc.com/?api-key=${API_KEY}`;
const PUMP_PK = new PublicKey(PUMP_PROGRAM);

const LOG_DIR = path.join(__dirname, 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });
const EVENTS_FILE = path.join(LOG_DIR, 'events.jsonl');
const TRADES_FILE = path.join(LOG_DIR, 'trades.jsonl');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writeLine = (file, obj) => fs.appendFileSync(file, JSON.stringify(obj) + '\n');
const say = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

async function rpc(method, params) {
  const res = await fetch(RPC_HTTP, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

let txVersion = 0;

async function getTx(signature) {
  for (let i = 0; i < 8; i++) {
    let tx;
    try {
      tx = await rpc('getTransaction', [
        signature,
        { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: txVersion },
      ]);
    } catch (e) {
      const m = String(e.message).match(/maxSupportedTransactionVersion["']?\s*:\s*(\d+)/);
      if (m && Number(m[1]) > txVersion) {
        txVersion = Number(m[1]);
        say(`Version de transaction supportee ajustee a ${txVersion}`);
        continue;
      }
      throw e;
    }
    if (tx) return tx;
    await sleep(400);
  }
  return null;
}

function uiAmount(b) {
  return Number(b.uiTokenAmount.uiAmountString ?? b.uiTokenAmount.uiAmount ?? 0);
}

function parseTrade(tx) {
  if (!tx || tx.meta?.err) return null;
  const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
  const venue = keys.includes(PUMP_PROGRAM) ? 'pump' : keys.includes(PUMPSWAP_PROGRAM) ? 'pumpswap' : null;
  if (!venue) return null;
  const idx = keys.indexOf(TARGET);
  if (idx < 0) return null;
  const solDelta = (tx.meta.postBalances[idx] - tx.meta.preBalances[idx]) / 1e9;

  const pre = new Map();
  const post = new Map();
  for (const b of tx.meta.preTokenBalances ?? []) if (b.owner === TARGET) pre.set(b.mint, uiAmount(b));
  for (const b of tx.meta.postTokenBalances ?? []) if (b.owner === TARGET) post.set(b.mint, uiAmount(b));

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

function curveAddress(mint) {
  return PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()], PUMP_PK)[0].toBase58();
}

async function readCurve(mint) {
  const r = await rpc('getAccountInfo', [curveAddress(mint), { encoding: 'base64', commitment: 'confirmed' }]);
  const v = r?.value;
  if (!v) return null;
  const d = Buffer.from(v.data[0], 'base64');
  if (d.length < 49) return null;
  return { vToken: Number(d.readBigUInt64LE(8)), vSol: Number(d.readBigUInt64LE(16)), complete: d[48] === 1 };
}

function simBuy(curve) {
  const solIn = BUY_SOL * 1e9 * (1 - FEE_PCT);
  const k = curve.vSol * curve.vToken;
  const tokensRaw = curve.vToken - k / (curve.vSol + solIn);
  const tokens = tokensRaw / 10 ** TOKEN_DECIMALS;
  return { tokensRaw, tokens, price: BUY_SOL / tokens };
}

function simSell(curve, tokensRaw) {
  const k = curve.vSol * curve.vToken;
  const gross = curve.vSol - k / (curve.vToken + tokensRaw);
  return (gross * (1 - FEE_PCT)) / 1e9;
}

const positions = new Map();
const busy = new Set();
const closed = [];
const seen = new Set();

async function waitUntilExecution(detectedAt) {
  await sleep(Math.max(0, detectedAt + EXTRA_DELAY_MS - Date.now()));
}

async function openPosition(trade, detectedAt, ingestLagMs) {
  if (trade.venue !== 'pump') return say(`SKIP ${trade.mint.slice(0, 6)}: token deja sur PumpSwap (non simule)`);
  if (positions.has(trade.mint) || busy.has(trade.mint)) return;
  busy.add(trade.mint);
  try {
    await waitUntilExecution(detectedAt);
    const curve = await readCurve(trade.mint);
    if (!curve || curve.complete) return say(`SKIP ${trade.mint.slice(0, 6)}: courbe introuvable ou terminee`);
    const fill = simBuy(curve);
    const slipVsTarget = fill.price / trade.price - 1;
    positions.set(trade.mint, {
      mint: trade.mint,
      openedAt: Date.now(),
      tokensRaw: fill.tokensRaw,
      costSol: BUY_SOL + COST_PER_TX_SOL,
      entryPrice: fill.price,
      targetEntryPrice: trade.price,
      slipVsTarget,
      ingestLagMs,
    });
    say(`BUY simule ${trade.mint.slice(0, 6)}.. prix ${fill.price.toExponential(3)} vs cible ${trade.price.toExponential(3)} (${(slipVsTarget * 100).toFixed(1)} % plus cher)`);
  } finally {
    busy.delete(trade.mint);
  }
}

async function closePosition(mint, reason) {
  const pos = positions.get(mint);
  if (!pos) return;
  const curve = await readCurve(mint);
  let record;
  if (!curve || curve.complete) {
    record = { mint, reason: `${reason}_non_evaluable`, pnlSol: null, pnlPct: null };
  } else {
    const proceeds = simSell(curve, pos.tokensRaw) - COST_PER_TX_SOL;
    const pnlSol = proceeds - pos.costSol;
    record = { mint, reason, proceedsSol: proceeds, costSol: pos.costSol, pnlSol, pnlPct: (pnlSol / pos.costSol) * 100 };
  }
  record.slipVsTarget = pos.slipVsTarget;
  record.ingestLagMs = pos.ingestLagMs;
  record.heldSec = Math.round((Date.now() - pos.openedAt) / 1000);
  positions.delete(mint);
  closed.push(record);
  writeLine(TRADES_FILE, record);
  say(`CLOSE simule ${mint.slice(0, 6)}.. (${reason}) PnL ${record.pnlPct == null ? 'n/a' : record.pnlPct.toFixed(1) + ' %'}`);
}

async function onTargetTx(signature, detectedAt) {
  const tx = await getTx(signature);
  const trade = parseTrade(tx);
  if (!trade) return;
  const ingestLagMs = tx.blockTime ? detectedAt - tx.blockTime * 1000 : null;
  writeLine(EVENTS_FILE, { signature, detectedAt, ingestLagMs, ...trade });
  say(`CIBLE ${trade.side.toUpperCase()} ${trade.mint.slice(0, 6)}.. ${trade.sol.toFixed(3)} SOL (${trade.venue}) retard de reception ~${ingestLagMs ?? '?'} ms`);
  if (trade.side === 'buy') await openPosition(trade, detectedAt, ingestLagMs);
  else if (positions.has(trade.mint)) {
    await waitUntilExecution(detectedAt);
    await closePosition(trade.mint, 'target_sell');
  }
}

function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function summary() {
  const ok = closed.filter((c) => c.pnlSol != null);
  const wins = ok.filter((c) => c.pnlSol > 0).length;
  const total = ok.reduce((a, c) => a + c.pnlSol, 0);
  const lines = [
    '----- RESUME -----',
    `Trades fermes evaluables : ${ok.length} (non evaluables : ${closed.length - ok.length}, encore ouverts : ${positions.size})`,
    `Taux de gain : ${ok.length ? ((wins / ok.length) * 100).toFixed(0) : 'n/a'} %`,
    `PnL total simule : ${total.toFixed(4)} SOL`,
    `PnL moyen par trade : ${ok.length ? ((ok.reduce((a, c) => a + c.pnlPct, 0) / ok.length)).toFixed(1) : 'n/a'} %`,
    `Ecart median vs prix de la cible : ${median(ok.map((c) => c.slipVsTarget * 100))?.toFixed(1) ?? 'n/a'} %`,
    `Retard de reception median : ${median(closed.map((c) => c.ingestLagMs).filter((x) => x != null)) ?? 'n/a'} ms`,
  ];
  console.log(lines.join('\n'));
}

setInterval(() => {
  for (const [mint, pos] of positions) {
    if (Date.now() - pos.openedAt > TIMEOUT_MIN * 60000) closePosition(mint, 'timeout').catch((e) => say(`erreur: ${e.message}`));
  }
}, 5000);

setInterval(summary, 10 * 60000);
process.on('SIGINT', () => {
  summary();
  process.exit(0);
});

function connect() {
  const ws = new WebSocket(RPC_WS);
  let ping;
  ws.on('open', () => {
    say(`Connecte. Surveillance de ${TARGET} (MODE SIMULATION, aucune transaction envoyee)`);
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'logsSubscribe', params: [{ mentions: [TARGET] }, { commitment: 'confirmed' }] }));
    ping = setInterval(() => ws.ping(), 30000);
  });
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.method !== 'logsNotification') return;
    const { signature, err } = msg.params.result.value;
    if (err || seen.has(signature)) return;
    seen.add(signature);
    if (seen.size > 5000) seen.clear();
    onTargetTx(signature, Date.now()).catch((e) => say(`erreur: ${e.message}`));
  });
  ws.on('error', (e) => say(`erreur WebSocket: ${e.message}`));
  ws.on('close', () => {
    clearInterval(ping);
    say('Deconnecte, nouvelle tentative dans 2 s');
    setTimeout(connect, 2000);
  });
}

connect();
