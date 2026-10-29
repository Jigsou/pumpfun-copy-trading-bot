import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import { PUMP_PROGRAM } from './demo/engine.js';
import { createRpc } from './demo/robust.js';
import { DiagnosticDemoEngine } from './demo/diagnostic.js';
import { createUpdater } from './demo/updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NL = String.fromCharCode(10);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isLocalOrigin(origin) {
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

const UI_PORT = Number(process.env.UI_PORT || 8080);
const UPDATE_ORIGINS = new Set([`http://localhost:${UI_PORT}`, `http://127.0.0.1:${UI_PORT}`, `http://[::1]:${UI_PORT}`]);

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => !origin || isLocalOrigin(origin),
});

app.use(cors({ origin: (origin, cb) => cb(null, !origin || isLocalOrigin(origin)) }));

// ---------- Mode demo (aucune cle privee, aucune transaction) ----------
const PUMP_PK = new PublicKey(PUMP_PROGRAM);
const LOG_DIR = path.join(__dirname, 'demo', 'logs');

const demo = new DiagnosticDemoEngine({
  makeRpc: (apiKey) => createRpc({ url: `https://mainnet.helius-rpc.com/?api-key=${apiKey}` }),
  makeWs: (apiKey) => new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${apiKey}`),
  curveAddress: (mint) =>
    PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()], PUMP_PK)[0].toBase58(),
  appendLog: (file, obj) => {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(path.join(LOG_DIR, `${file}.jsonl`), JSON.stringify(obj) + NL);
    } catch (e) {
      console.error('Log demo:', e.message);
    }
  },
});

const updater = createUpdater({
  cwd: __dirname,
  isDemoRunning: () => demo.running,
  supervised: process.env.PUMP_SUPERVISED === '1',
  npmExecPath: process.env.npm_execpath || null,
});

const demoClients = new Set();
demo.on('state', (state) => {
  const payload = JSON.stringify({ type: 'demo_state', state });
  for (const c of demoClients) if (c.readyState === WebSocket.OPEN) c.send(payload);
});

async function handleDemo(ws, data) {
  const reply = (obj) => ws.send(JSON.stringify(obj));
  try {
    switch (data.type) {
      case 'demo_hello':
        demoClients.add(ws);
        reply({ type: 'demo_state', state: demo.snapshot() });
        break;
      case 'demo_start':
        demoClients.add(ws);
        await demo.start({ apiKey: data.apiKey, settings: data.settings, wallets: data.wallets });
        break;
      case 'demo_stop':
        await demo.stop();
        break;
      case 'demo_add_wallet':
        demo.addWallet(data.address, data.label);
        break;
      case 'demo_remove_wallet':
        demo.removeWallet(data.address);
        break;
      case 'demo_set_wallets':
        demo.setWallets(data.wallets);
        break;
      case 'demo_update_settings':
        demo.updateSettings(data.settings);
        break;
      case 'demo_reset':
        demo.reset();
        break;
      default:
        reply({ type: 'demo_error', message: `Commande inconnue : ${data.type}` });
    }
  } catch (error) {
    reply({ type: 'demo_error', message: error.message });
  }
}

// ---------- Mise a jour depuis GitHub (git pull, changement de canal, redemarrage si necessaire) ----------
async function handleApp(ws, data) {
  const send = (obj) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  };
  if (data.type === 'app_version') {
    send({ type: 'app_version', ...(await updater.version()) });
    return;
  }
  if (data.type !== 'app_update' && data.type !== 'app_switch') return;
  if (!ws.origin || !UPDATE_ORIGINS.has(ws.origin)) {
    send({
      type: 'app_update_result',
      ok: false,
      message: `Update refused: open the app on http://localhost:${UI_PORT} (current origin: ${ws.origin ?? 'none'}).`,
    });
    return;
  }
  const progress = (message) => send({ type: 'app_update_progress', message });
  const options = { confirmed: data.confirmed === true, stash: data.stash === true };
  const result =
    data.type === 'app_switch'
      ? await updater.switchChannel(String(data.branch ?? ''), options, progress)
      : await updater.run(options, progress);
  send({ type: 'app_update_result', ...result });
  if (result.exitCode) {
    try {
      await demo.stop();
    } catch {
      // closing anyway
    }
    setTimeout(() => process.exit(result.exitCode), 700);
  }
}

// ---------- Relais CoinVera du bot reel (inchange) ----------
const connections = new Map();

wss.on('connection', (ws, req) => {
  ws.origin = req.headers.origin ?? null;
  console.log('New client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (typeof data.type === 'string' && data.type.startsWith('demo_')) {
        await handleDemo(ws, data);
        return;
      }

      if (typeof data.type === 'string' && data.type.startsWith('app_')) {
        await handleApp(ws, data);
        return;
      }

      if (data.type === 'connect') {
        const { config } = data;

        const coinveraWs = new WebSocket(config.websocket.url || 'wss://api.coinvera.io');

        connections.set(ws, {
          config,
          coinveraWs
        });

        coinveraWs.on('open', () => {
          const subscribeMessage = {
            method: 'subscribeTrade',
            apiKey: config.coinveraApiKey,
            tokens: [config.copyWalletAddress]
          };
          coinveraWs.send(JSON.stringify(subscribeMessage));

          const pingInterval = setInterval(() => {
            if (coinveraWs.readyState === WebSocket.OPEN) {
              coinveraWs.ping();
            }
          }, config.websocket.pingIntervalMs || 5000);

          connections.get(ws).pingInterval = pingInterval;

          ws.send(JSON.stringify({ type: 'connected' }));
        });

        coinveraWs.on('message', (data) => {
          ws.send(data.toString());
        });

        coinveraWs.on('error', (error) => {
          console.error('Coinvera WebSocket error:', error);
          ws.send(JSON.stringify({ type: 'error', message: 'Coinvera connection error' }));
        });

        coinveraWs.on('close', () => {
          ws.send(JSON.stringify({ type: 'disconnected' }));
        });

        coinveraWs.on('pong', () => {
          console.log('Pong received from Coinvera');
        });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      ws.send(JSON.stringify({ type: 'error', message: error.message }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    demoClients.delete(ws);
    const connection = connections.get(ws);
    if (connection) {
      if (connection.pingInterval) {
        clearInterval(connection.pingInterval);
      }
      if (connection.coinveraWs) {
        connection.coinveraWs.close();
      }
    }
    connections.delete(ws);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Server is running on 127.0.0.1:${PORT}`);
});
