import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import WebSocket from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PublicKey } from '@solana/web3.js';
import { DemoEngine, PUMP_PROGRAM } from './demo/engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({
  server,
  verifyClient: ({ origin }) => !origin || LOCAL_ORIGIN.test(origin),
});

app.use(cors({ origin: LOCAL_ORIGIN }));

// ---------- Mode demo (aucune cle privee, aucune transaction) ----------
const PUMP_PK = new PublicKey(PUMP_PROGRAM);
const LOG_DIR = path.join(__dirname, 'demo', 'logs');

const demo = new DemoEngine({
  makeRpc: (apiKey) => async (method, params) => {
    const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`${method}: ${json.error.message}`);
    return json.result;
  },
  makeWs: (apiKey) => new WebSocket(`wss://mainnet.helius-rpc.com/?api-key=${apiKey}`),
  curveAddress: (mint) =>
    PublicKey.findProgramAddressSync([Buffer.from('bonding-curve'), new PublicKey(mint).toBuffer()], PUMP_PK)[0].toBase58(),
  appendLog: (file, obj) => {
    try {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      fs.appendFileSync(path.join(LOG_DIR, `${file}.jsonl`), JSON.stringify(obj) + '\n');
    } catch (e) {
      console.error('Log demo:', e.message);
    }
  },
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

// ---------- Relais CoinVera du bot reel (inchange) ----------
const connections = new Map();

wss.on('connection', (ws) => {
  console.log('New client connected');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      if (typeof data.type === 'string' && data.type.startsWith('demo_')) {
        await handleDemo(ws, data);
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
