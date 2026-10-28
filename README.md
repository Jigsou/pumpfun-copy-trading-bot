# Pumpfun Copy Trading Bot

Fork of [ahk780/pumpfun-copy-trading-bot](https://github.com/ahk780/pumpfun-copy-trading-bot) (MIT). A copy-trading bot for Pump.fun and PumpSwap on Solana with two modes:

| Mode | Purpose | Key needed | Status |
|---|---|---|---|
| **Demo (paper trading)** | Follows wallets and computes what a copy-trader would have paid and earned at several delays. Sends nothing. | No | Working, being validated |
| **Real** | Copies buys with real transactions signed by your wallet. | Yes (private key) | Original code, not validated, not hardened. Do not use yet. |

The plan is simple: finish and validate the demo mode first, then bring the real mode up to the same standard, reusing the same pricing and filtering engine. The real mode will only be considered ready when the demo results justify it and the items in the [roadmap](#roadmap) are done.

## Status

Experimental. Demo results are estimates, not proof of profitability. A few trades prove nothing: wait for at least 50 closed trades per delay before drawing any conclusion, and distrust any positive result until it is stable over several days.

## Demo mode (paper trading)

- Follows several wallets at once through the Helius WebSocket (free plan is enough).
- When a wallet buys, it waits for each configured delay (default 1000, 2000 and 3000 ms), reads the real on-chain price at that moment and computes your fill, including fees and price impact.
- When the wallet sells, it simulates your sell after the same delay. Otherwise the position closes after the max hold time.
- Prices Pump.fun bonding-curve tokens from the curve account, and PumpSwap tokens from the pool reserves identified in the wallet's own transactions.
- Shows results per delay (win rate, total PnL, average PnL, price paid versus the wallet's fill), open and closed simulated positions, and the wallet's live trades.
- Measures detection lag (block seen by the node to trade received by the bot) and processing time.
- Has a `Log` section, closed by default, with a copy button. It contains settings, results, latency, skip reasons, recent errors and diagnostics, and never contains an API key.
- Handles the free-plan rate limit with a request queue and automatic retries, ignores transactions that are too old, and rejects fills that happen later than the planned delay.

## Real mode (original code, not ready)

The second tab is the original bot by ahk780. It uses a CoinVera API key to watch the wallet, asks SolanaPortal for an unsigned transaction, signs it with your private key in the browser, and sends it through Jito. It exits positions on stop loss, take profit or timeout.

Known problems, all still present:

- It signs the transaction returned by a third-party API without checking its instructions. If that service is compromised, your wallet can be drained.
- `Save Config` stores the private key in clear text in the browser's local storage.
- It does not copy the wallet's sells.
- The default slippage is 20 percent, and there is no daily loss limit.
- It does not use the demo engine's pricing, delay handling or filters.

If you test it anyway, use a throwaway wallet with an amount you accept to lose, and never click `Save Config`.

## Roadmap

Before the real mode is considered usable (none of this is done yet):

1. Validate the demo mode: at least 50 closed trades per delay on several wallets over several days, with stable results.
2. Copy sells (and partial sells) in addition to buys.
3. Verify every transaction before signing: allow only the Pump.fun and PumpSwap programs, token and account programs, and the tip account.
4. Build transactions locally instead of trusting a third-party API.
5. Keep the private key out of the browser: environment variable or encrypted file, never local storage.
6. Add risk limits: maximum loss per day, maximum open positions, lower default slippage, automatic stop after a losing streak.
7. Share the pricing, lateness and sanity filters between demo and real mode.
8. Dry-run on devnet or with a very small amount before any real use.

## Quick start (demo mode)

Requirements: Node.js 18 or newer (tested with 24), git, and a free [Helius](https://www.helius.dev) API key.

Windows (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
```

Close and reopen PowerShell, then:

```powershell
cd ~/Documents
git clone https://github.com/Jigsou/pumpfun-copy-trading-bot.git
cd pumpfun-copy-trading-bot
npm.cmd install --ignore-scripts
npm.cmd start
```

Linux or macOS:

```bash
git clone https://github.com/Jigsou/pumpfun-copy-trading-bot.git
cd pumpfun-copy-trading-bot
npm install --ignore-scripts
npm start
```

Open `http://localhost:8080` (not the network address printed by Vite), paste your Helius key, check the followed wallets, and click `Start simulation`.

The simulation runs in the Node server, not in the browser tab, so you can close the tab. Closing the terminal stops it and resets the in-memory statistics.

## Demo settings

| Setting | Meaning | Suggested |
|---|---|---|
| Amount per trade (SOL) | Size of each simulated buy | 0.1 |
| Delays tested (ms) | Scenarios replayed in parallel for every wallet trade | 1000,2000,3000 |
| Max hold (minutes) | Close a position if the wallet never sells | 30 |
| Pump.fun fee (%) | Fee applied on the bonding curve | 1.25 |
| Cost per tx (SOL) | Network, priority and tip costs per transaction | 0.001 |

PumpSwap trades use a fixed fee estimate of 1.25 percent, which is deliberately conservative.

## Reading the results

- A delay is the time between the bot seeing the trade and your transaction landing. Your real delay behind the wallet is roughly the detection lag plus the delay of the row you look at.
- One wallet trade is replayed once per delay, so one trade produces several rows. The number of independent trades is lower than the number of rows.
- If the PnL is positive at a short delay and negative at the realistic one, the edge disappears with real latency.

## Known limitations of the demo mode

- A position is closed entirely on the first sell of the wallet. Wallets that exit in several chunks are not reproduced.
- The buy amount is fixed. Failed transactions, competition for priority, MEV and slippage limits are not simulated.
- Fee values are estimates taken from public documentation and may change.
- PumpSwap pricing depends on identifying the pool from the wallet's transactions. If it cannot be identified, the trade is skipped and the reason appears in the Log.
- Detection lag is measured from the node's own view of the block, so it does not include the time before the node saw it.
- Statistics live in memory. Closed trades are appended to `demo/logs/trades.jsonl`.

## Project layout

| Path | Role |
|---|---|
| `server.js` | Local WebSocket server; hosts the demo engine and relays the real-mode data feed; listens on 127.0.0.1 only |
| `demo/engine.js` | Core simulation engine (wallet tracking, curve pricing, positions, statistics) |
| `demo/robust.js` | Rate-limited RPC client, PumpSwap pricing, lateness and sanity filters, latency, diagnostics |
| `src/components/DemoPanel.tsx` | Demo dashboard |
| `src/components/LogReport.tsx` | Copyable log section |
| `src/modern.css` | Flat dark theme |
| `src/components/*` (other files), `src/hooks/*`, `src/services/*` | Real mode (original code) |
| `paper/` | First terminal-only prototype, superseded by the dashboard; kept for reference |

## Security

- Demo mode never asks for a private key. Your Helius key is stored in your browser's local storage and kept in the server's memory while running.
- The local server accepts connections from `localhost` pages only. Do not expose ports 8080 or 3001 to a network.
- See the real mode section above for its known weaknesses.
- The original `index.html` loaded a remote script (`cdn.gpteng.co`) into the page. It has been removed in this fork.
- Always verify a wallet address on a block explorer before following it: impersonators exist.

## Credits and license

Original project by AHK ([ahk780](https://github.com/ahk780)), MIT license. Demo mode, dashboard and engine changes by Jigsou. See `LICENSE`.

This software is provided as is, for education and research. It is not financial advice, and trading memecoins can lose all of your money.
