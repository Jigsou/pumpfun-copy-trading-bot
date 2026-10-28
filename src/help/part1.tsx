import React from 'react';
import { BarChart3, BookOpen, Clock, Rocket, ShieldCheck, Timer, Zap, Percent } from 'lucide-react';
import type { HelpSection } from './ui';
import { Badge, Callout, Card, Cards, Ext, Kbd, Step, Steps, Table } from './ui';

const yes = (t: string) => <span className='hp-yes'>{t}</span>;
const no = (t: string) => <span className='hp-no'>{t}</span>;

export const PART1: HelpSection[] = [
  {
    id: 'welcome',
    title: 'Welcome',
    icon: <BookOpen className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>
          This app answers one question: would copying a Pump.fun trader make money after delays and fees? It watches the wallet you choose, replays each of its trades the way you
          would really have done them, and adds up the result.
        </p>
        <Cards>
          <Card icon={<ShieldCheck className='w-4 h-4' />} title='Paper mode risks nothing'>
            No private key, no transaction, no money. It only reads public blockchain data through a free Helius key.
          </Card>
          <Card icon={<Timer className='w-4 h-4' />} title='You are always late'>
            You can only copy after the trader. Every delay can make your price worse, so the app tests several delays at the same time.
          </Card>
          <Card icon={<Percent className='w-4 h-4' />} title='Fees are part of the answer'>
            Fees and tips cost a few percent per trade. A strategy has to win more than it costs.
          </Card>
        </Cards>
        <h3>How it works</h3>
        <Steps>
          <Step n={1} title='It listens'>
            Your local server follows the wallets you chose through Helius, a service that streams blockchain activity.
          </Step>
          <Step n={2} title='It reads the trade'>
            When a wallet buys or sells, the app reads the transaction: which token, how much SOL, on which market (Pump.fun curve or PumpSwap).
          </Step>
          <Step n={3} title='It replays it with your delay'>
            For each delay you configured, it waits, reads the real price at that moment from the blockchain, and computes what your entry would have cost, fees included.
          </Step>
          <Step n={4} title='It adds everything up'>
            When the wallet sells (or your maximum hold time passes) it computes your simulated exit and the profit or loss. The dashboard shows totals, win rate and diagnostics.
          </Step>
        </Steps>
        <Callout kind='warn' title='Not financial advice'>
          Memecoin trading can lose everything you put in. This tool is for learning and testing. Past results of a wallet do not promise anything for the future.
        </Callout>
      </>
    ),
  },
  {
    id: 'quick-start',
    title: 'Quick start',
    icon: <Rocket className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>Seven steps, about five minutes. Everything happens in Paper mode, so nothing can go wrong with your money.</p>
        <Steps>
          <Step n={1} title='Get a free Helius API key'>
            <p>
              Create a free account at <Ext href='https://www.helius.dev'>helius.dev</Ext> and copy an API key from the dashboard.
            </p>
          </Step>
          <Step n={2} title='Paste it in the app'>
            <p>
              Click <Kbd>Options</Kbd> (top right), open <strong>Connection</strong> and paste the key. It is stored only in this browser.
            </p>
          </Step>
          <Step n={3} title='Check the wallet to follow'>
            <p>
              Open <strong>Wallets followed</strong>. The default wallet is a suggestion, not a guarantee: impersonator wallets exist, so verify any address on{' '}
              <Ext href='https://solscan.io'>Solscan</Ext> before trusting it. You can add several wallets.
            </p>
          </Step>
          <Step n={4} title='Keep the default settings for the first run'>
            <p>
              In <strong>Trade size and timing</strong>: 0.1 SOL per trade, delays 300 / 1000 / 3000 ms, fee 1.25 %. In <strong>Entry rules</strong>, leave both values at 0 (off) so you
              see unfiltered results first.
            </p>
          </Step>
          <Step n={5} title='Press Start simulation'>
            <p>
              Keep your computer awake and the terminal window that runs <Kbd>npm start</Kbd> open. If the server restarts (for example after an update), the simulation resumes by itself
              but the statistics start again from zero.
            </p>
          </Step>
          <Step n={6} title='Wait, then read the results'>
            <p>
              Give it hours, ideally days. Read <strong>Results by execution delay</strong>. Do not conclude anything before at least 50 closed trades per delay on several different
              tokens.
            </p>
          </Step>
          <Step n={7} title='Share the Log if something looks wrong'>
            <p>
              At the bottom of the page, open <strong>Log</strong> and press <strong>Copy log</strong>. It contains no API key and no private key.
            </p>
          </Step>
        </Steps>
        <Callout kind='tip' title='Stay on the Stable channel unless you are testing'>
          The selector next to the Update button chooses the code version: Stable (main) is the tested one, Test (dev) gets new features first.
        </Callout>
      </>
    ),
  },
  {
    id: 'modes',
    title: 'Paper mode and Real mode',
    icon: <Zap className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>Use the Paper / Real switch at the top left of the page. Paper is where you should spend almost all of your time.</p>
        <Table
          head={['', 'Paper', 'Real']}
          rows={[
            ['Money at risk', yes('None'), no('Yes, real SOL')],
            ['Private key', yes('Never needed'), no('Required (use a throwaway wallet)')],
            ['Services used', 'Helius (free key)', 'CoinVera (detect), SolanaPortal (build the transaction), Jito (send)'],
            ['What it does', 'Replays the wallet trades with your delays and fees', 'Buys and sells for real when the wallet buys'],
            ['Exits', 'When the wallet sells, or after the maximum hold time', 'Stop loss, take profit or maximum hold time'],
            ['Where settings live', 'Options > Paper trading', 'Options > Real trading'],
          ]}
        />
        <h3>What paper mode cannot tell you</h3>
        <ul className='hp-list'>
          <li>
            <strong>Landing time.</strong> A real transaction needs time to be sent and included in a block. Paper mode assumes your trade happens at the price it reads, so real results are
            usually a bit worse.
          </li>
          <li>
            <strong>Failures.</strong> Real transactions can fail or be partially filled because the price moved more than your slippage allows.
          </li>
          <li>
            <strong>Different exits.</strong> Real mode sells on stop loss or take profit, paper mode follows the wallet exits. The two strategies are not the same, so paper results are
            only a rough guide to what Real mode would do.
          </li>
          <li>
            <strong>Your own impact.</strong> The simulation prices your trade on the current reserves, but the market reacts to real orders in ways it cannot predict.
          </li>
        </ul>
        <Callout kind='danger' title='Before using Real mode'>
          Only after paper results are positive at the slowest delay, over many different tokens and several days. Use a throwaway wallet that holds only what you can afford to lose.
          The Real tab asks for an explicit confirmation before it starts.
        </Callout>
      </>
    ),
  },
  {
    id: 'dashboard',
    title: 'Reading the Paper dashboard',
    icon: <BarChart3 className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>The numbered map below matches the explanations under it.</p>
        <div className='hp-mock'>
          <div className='hp-mock-box'>
            <Badge n={1} />
            Status bar: local server, simulation, Helius connection | Start / Stop / Reset stats
          </div>
          <div className='hp-mock-row six'>
            <div className='hp-mock-box'>
              <Badge n={2} />
              Net PnL
            </div>
            <div className='hp-mock-box'>Win rate</div>
            <div className='hp-mock-box'>Closed trades</div>
            <div className='hp-mock-box'>Open positions</div>
            <div className='hp-mock-box'>Detection lag</div>
            <div className='hp-mock-box'>Processing time</div>
          </div>
          <div className='hp-mock-box'>
            <Badge n={3} />
            Verdict banner
          </div>
          <div className='hp-mock-cols'>
            <div className='hp-mock-col'>
              <div className='hp-mock-box tall'>
                <Badge n={4} />
                Results by execution delay
              </div>
              <div className='hp-mock-box tall'>
                <Badge n={5} />
                Results by entry premium
              </div>
              <div className='hp-mock-box tall'>
                <Badge n={6} />
                Wallet trades | Open positions | Closed trades
              </div>
            </div>
            <div className='hp-mock-col'>
              <div className='hp-mock-box tall'>
                <Badge n={7} />
                Followed wallets
              </div>
              <div className='hp-mock-box'>
                <Badge n={8} />
                Active settings
              </div>
              <div className='hp-mock-box tall'>
                <Badge n={9} />
                Coverage and skipped trades
              </div>
            </div>
          </div>
        </div>
        <div className='hp-legend'>
          <div className='hp-legend-item'>
            <Badge n={1} />
            <span>
              <strong>Status bar.</strong> Green dots mean the local server, the simulation and the Helius connection are all fine. Reset stats clears results and open simulated positions.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={2} />
            <span>
              <strong>Key figures.</strong> Net PnL and win rate are shown for the slowest delay, the most realistic one. Detection lag is the time between the trade landing on the
              blockchain and your server seeing it. Processing time is how long your server needs to read it.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={3} />
            <span>
              <strong>Verdict.</strong> Fewer than 50 closed trades on the delay with the most data: not enough data. Otherwise negative total PnL at the slowest delay: copying would lose
              money. Otherwise positive: promising, but keep running for days.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={4} />
            <span>
              <strong>Results by delay.</strong> One row per delay: closed trades, win rate, total and average profit, the median price paid compared with the wallet (Paid vs target) and
              trades that could not be priced (Unpriced).
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={5} />
            <span>
              <strong>Entry premium.</strong> The premium is how much more you paid than the wallet for the same token. The table groups closed trades by premium, so you can see whether
              expensive entries are the losing ones. Use it to choose the Max entry premium rule.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={6} />
            <span>
              <strong>Activity tabs.</strong> Latest wallet trades with links to Solscan, simulated positions still open, and closed trades with their exit reason (Target sold or Timeout).
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={7} />
            <span>
              <strong>Followed wallets.</strong> Counters of buys and sells seen. Use Manage to add or remove wallets without leaving the page.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={8} />
            <span>
              <strong>Active settings.</strong> The values the running simulation really uses. If your Options differ, a banner offers Apply now.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={9} />
            <span>
              <strong>Coverage and skipped trades.</strong> How many wallet trades were seen, on which market, how many different tokens, and why some trades could not be simulated.
            </span>
          </div>
        </div>
        <Callout kind='tip' title='How long is long enough?'>
          What matters is the number of different tokens, not the number of rows. Several rows can come from the same token. Aim for 50 closed trades per delay across many tokens, over
          several days and different market conditions.
        </Callout>
        <h3>Where does the delay come from?</h3>
        <div className='hp-timeline'>
          <div className='hp-tl'>
            <i />
            <strong>Wallet trade</strong>lands on the blockchain
          </div>
          <div className='hp-tl'>
            <i />
            <strong>Detection</strong>your server learns about it (a few hundred ms)
          </div>
          <div className='hp-tl'>
            <i />
            <strong>Your delay</strong>300, 1000 or 3000 ms in the paper test
          </div>
          <div className='hp-tl'>
            <i />
            <strong>Your entry</strong>priced at that moment (real mode adds landing time)
          </div>
        </div>
        <p>
          <Clock className='w-4 h-4' style={{ display: 'inline', verticalAlign: '-3px' }} /> The longer you wait after the trader, the more other traders may have pushed the price. That is
          why the dashboard compares delays side by side.
        </p>
      </>
    ),
  },
];
