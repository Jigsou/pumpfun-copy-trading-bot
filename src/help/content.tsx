import React from 'react';
import { BarChart3, BookMarked, BookOpen, Clock, Coins, FileText, HelpCircle, Lock, Percent, RefreshCw, Rocket, ShieldCheck, SlidersHorizontal, Timer, Wrench, Zap } from 'lucide-react';
import type { HelpSection } from './ui';
import { Badge, Callout, Card, Cards, CodeBlock, Ext, Kbd, Step, Steps, Table } from './ui';

const yes = (t: string) => <span className='hp-yes'>{t}</span>;
const no = (t: string) => <span className='hp-no'>{t}</span>;

const Q: React.FC<{ q: string; children: React.ReactNode }> = ({ q, children }) => (
  <details className='hp-faq'>
    <summary>{q}</summary>
    <div>{children}</div>
  </details>
);

export const HELP_SECTIONS: HelpSection[] = [
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
            You can only copy after the trader. Every delay can make your price worse, so the app tests several scenarios (delays) at the same time, from 1 to 10 of your choice.
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
            When a wallet buys or sells, the app reads the transaction: which token, how much SOL, on which market (Pump.fun curve or PumpSwap). Each buy by the wallet is one operation.
          </Step>
          <Step n={3} title='It replays it with your scenarios'>
            For each scenario (a delay you configured), it waits, reads the real price at that moment from the blockchain, and computes what your entry would have cost, fees included.
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
              Click <Kbd>Options</Kbd> (top right), open <strong>Connection</strong> and paste the key. It is saved in this browser and sent to your local server and to Helius when the simulation starts.
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
              In <strong>Trade size and timing</strong>: 0.1 SOL per trade, three scenarios with delays 300 / 1000 / 3000 ms, fee 1.25 %. In <strong>Entry rules</strong>, leave both values at 0 (off) so you
              see unfiltered results first.
            </p>
          </Step>
          <Step n={5} title='Press Start simulation'>
            <p>
              Keep your computer awake and the terminal window that runs <Kbd>npm start</Kbd> open. If the server restarts (for example after an update), the page tries to start the simulation again
              with your saved options, but the statistics and open simulated positions start again from zero.
            </p>
          </Step>
          <Step n={6} title='Wait, then read the results'>
            <p>
              Give it hours, ideally days. Read <strong>Results by scenario</strong>. Do not conclude anything before at least 50 closed operations per scenario on several different
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
          The selector next to the Update button chooses the code version: Stable (main) changes less often, Test (dev) gets new features first and may contain bugs. Neither channel is a guarantee
          that the results are correct.
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
            ['What it does', 'Replays the wallet trades with your scenarios and fees', 'Buys and sells for real when the wallet buys'],
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
            <strong>Failures.</strong> Real transactions can fail, for example when the price moves more than your slippage allows. A failed transaction can still cost you the network fee and the tip.
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
          Only after paper results are positive at the slowest scenario, over many different tokens and several days. Even then, paper results are estimates, not proof. Use a throwaway wallet that holds only what you can afford to lose.
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
            <div className='hp-mock-box'>Closed operations</div>
            <div className='hp-mock-box'>Open operations</div>
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
                Results by scenario
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
              <strong>Key figures.</strong> Net PnL and win rate are shown for the slowest scenario, which is the closest to a late copy. No scenario has been calibrated against a real bot, so treat them
              as estimates. Detection lag is the estimated time between the trade landing on the blockchain and your server seeing it. Processing time is how long your server needs to read it. Closed and
              open operations show the number of scenarios underneath.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={3} />
            <span>
              <strong>Verdict.</strong> Fewer than 50 closed operations on the scenario with the most data: not enough data. Otherwise negative total PnL at the slowest scenario: copying would lose
              money. Otherwise positive: promising, but keep running for days.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={4} />
            <span>
              <strong>Results by scenario.</strong> One row per scenario (delay): closed trades, win rate, total and average profit, the median price paid compared with the wallet (Paid vs target) and
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
              <strong>Activity tabs.</strong> Latest wallet trades with links to Solscan, simulated positions still open, and closed trades with their exit reason (Target sold or Timeout). The number in
              brackets counts the simulated trades, one per scenario. One buy by the wallet is one operation: it has a single line with an arrow, and the arrow shows each of its scenarios. Scenarios of the
              same operation are alternatives for the same trade, never separate orders, so do not add them together.
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
              <strong>Active settings.</strong> The values the running simulation really uses, including the number of scenarios. If your Options differ, a banner offers Apply now.
            </span>
          </div>
          <div className='hp-legend-item'>
            <Badge n={9} />
            <span>
              <strong>Coverage and skipped trades.</strong> How many wallet trades were seen, on which market, how many were routed through another exchange, how many different tokens, and why some trades
              could not be simulated.
            </span>
          </div>
        </div>
        <Callout kind='tip' title='How long is long enough?'>
          What matters is the number of different tokens, not the number of rows. Several rows can come from the same token. Fifty closed operations per scenario is a minimum for a first look, not a
          guarantee. Aim for many different tokens, over several days and different market conditions.
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
            <strong>Your scenario delay</strong>for example 300, 1000 or 3000 ms, counted from detection
          </div>
          <div className='hp-tl'>
            <i />
            <strong>Your entry</strong>priced at that moment (real mode adds landing time)
          </div>
        </div>
        <p>
          <Clock className='w-4 h-4' style={{ display: 'inline', verticalAlign: '-3px' }} /> The delay starts when your server detects the trade, not when the wallet transaction was executed. A 300 ms
          scenario therefore enters about 300 ms plus the detection lag after the real trade. The longer you wait, the more other traders may have pushed the price. That is why the dashboard compares
          scenarios side by side.
        </p>
      </>
    ),
  },
  {
    id: 'options',
    title: 'Every option explained',
    icon: <SlidersHorizontal className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>
          Open <Kbd>Options</Kbd> at the top right. Everything you type is saved in this browser straight away. In Paper mode, changes reach a running simulation only when you press{' '}
          <strong>Apply now</strong>.
        </p>

        <h3>Paper trading</h3>
        <Table
          head={['Option', 'What it does', 'Allowed values', 'Default']}
          rows={[
            ['Helius API key', 'Lets your local server read the blockchain. Saved in this browser and sent to your local server and to Helius.', 'Your free key', 'Empty'],
            ['Wallets followed', 'The traders whose buys and sells are replayed. Several can be followed at once.', 'Valid Solana addresses', 'One suggested wallet'],
            ['Amount per trade', 'Size of each simulated copy. Bigger sizes move the price more in the calculation.', '0.001 to 1000 SOL', '0.1'],
            ['Max hold', 'Closes a simulated position if the wallet has not sold by then.', '1 to 1440 minutes', '30'],
            ['Scenarios (delays)', 'Each scenario is a waiting time between detecting a trade and your simulated entry. All scenarios of a trade run at the same time. Add or remove them with Add scenario.', '1 to 10 scenarios, each a whole number from 0 to 60000 ms, all different', '3 scenarios: 300, 1000, 3000'],
            ['Pump.fun fee', 'Percentage taken on each simulated buy and sell.', '0 to 20 %', '1.25'],
            ['Cost per transaction', 'Network fee plus tip, subtracted on each side.', '0 to 1 SOL', '0.001'],
            ['Max entry premium', 'Skips an entry that costs more than this percentage above what the wallet paid. 0 turns it off.', '0 to 1000 %', '0 (off)'],
            ['Min wallet buy', 'Ignores wallet buys smaller than this. 0 turns it off.', '0 to 1000 SOL', '0 (off)'],
          ]}
        />
        <Callout kind='note' title='About scenarios'>
          Operations that are already open keep the scenarios they started with: a change only applies to the next wallet buys. More scenarios mean more requests to Helius, so watch the rate-limit counter
          in the Log and avoid delays that are only a few milliseconds apart. If the Log shows many trades skipped as read too long after the planned delay, use fewer scenarios.
        </Callout>
        <Callout kind='tip' title='Start with both rules off'>
          Let the dashboard show the unfiltered results first. The table Results by entry premium then tells you which premium levels lose money, and only then does a cap make sense. Choosing the
          cap that looks best on past data and judging it on the same data would flatter the result.
        </Callout>

        <h3>Real trading</h3>
        <Table
          head={['Option', 'What it does', 'Allowed values', 'Default']}
          rows={[
            ['CoinVera API key', 'Detects the trades of the wallet you copy.', 'Your key', 'Empty'],
            ['Private key', 'Signs your transactions. Not saved unless you tick the box.', 'Base58 text, about 88 characters', 'Empty'],
            ['Your wallet address', 'The public address that matches the private key. The menu warns if they differ.', 'Valid Solana address', 'Empty'],
            ['Wallet to copy', 'The trader whose buys you copy.', 'Valid Solana address', 'Empty'],
            ['Amount per trade', 'SOL spent on each copied buy.', '0.001 to 1000 SOL', '0.1'],
            ['Jito tip', 'Paid on each buy and each sell to help the transaction get included.', '0 to 1 SOL', '0.0005'],
            ['Slippage tolerance', 'Largest price move accepted between the quote and the fill.', '1 to 100 %', '20'],
            ['Stop loss', 'Sells when the price falls this far below your entry.', '0.1 to 100 %', '5'],
            ['Take profit', 'Sells when the price rises this far above your entry.', '0.1 to 1000 %', '10'],
            ['Max hold', 'Sells when this time has passed.', '1 to 1440 minutes', '60'],
            ['Price check delay', 'Time between two price checks of an open position.', '500 to 60000 ms', '2000'],
            ['Solana RPC URL', 'Used to confirm transactions and read balances.', 'Starts with http', 'Public Solana RPC'],
            ['CoinVera WebSocket URL / ping interval', 'Connection to the trade feed.', 'URL starts with ws; ping 1000 to 120000 ms', 'wss://api.coinvera.io / 10000'],
          ]}
        />
        <Callout kind='warn' title='Defaults are starting points, not advice'>
          A 5 % stop loss and a 10 % take profit sit inside the cost of a round trip on some trades. Compare them with the estimated cost shown in the menu before relying on them.
        </Callout>
      </>
    ),
  },
  {
    id: 'costs',
    title: 'Costs and fees',
    icon: <Coins className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>A copy trade is paid for twice, on the way in and on the way out. These costs decide whether a strategy can ever be profitable.</p>
        <Table
          head={['Cost', 'Paper simulation', 'Real mode (estimate)', 'Who gets it']}
          rows={[
            ['Pump.fun fee', '1.25 % per side (editable)', '1.25 % on the bonding curve', 'The protocol and the token creator, taken by the program itself'],
            ['PumpSwap fee', '1.25 % per side (flat)', 'Depends on the token market cap, never more than the curve fee', 'The pool, the protocol and the creator'],
            ['Router fee', 'Not counted', 'About 0.3 % per trade', 'The service that builds the transaction'],
            ['Tip', 'Part of Cost per transaction', 'Jito tip, 0.0005 SOL by default', 'Block builders and validators'],
            ['Network fee', 'Part of Cost per transaction', 'A few thousandths of a cent per transaction', 'Solana validators'],
          ]}
        />
        <h3>Worked example</h3>
        <p>
          You copy with 0.1 SOL and a 0.0005 SOL tip. One side costs roughly 1.25 % + 0.3 % + 0.5 % = about 2.05 %, so a full round trip costs about 4.1 % before the price moves at all.
          The token must rise by more than that between your entry and your exit just to break even.
        </p>
        <Callout kind='note' title='Why the estimates may differ from reality'>
          Fee schedules change and depend on the market. The menu shows an estimate based on the figures above. Treat it as an order of magnitude and check the official fee pages before
          trading real money.
        </Callout>
        <ul className='hp-list'>
          <li>
            <strong>Price impact.</strong> Buying moves the price up a little, selling moves it down. It grows with the amount and shrinks with the size of the pool.
          </li>
          <li>
            <strong>Slippage.</strong> Between the quote and the fill, other trades may move the price. Slippage tolerance only sets how much you accept before the transaction fails.
          </li>
          <li>
            <strong>Entry premium.</strong> Paying more than the wallet did is itself a cost. It shows up in the premium table of the dashboard.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'updates',
    title: 'Updates and versions',
    icon: <RefreshCw className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>The app updates itself from GitHub with one button, and you choose which version you want to follow.</p>
        <Table
          head={['Channel', 'What it is', 'Use it when']}
          rows={[
            ['Stable (main)', 'Versions released only when several improvements are ready. It changes less often, but it is not a guarantee of correct results', 'You want fewer surprises while collecting results'],
            ['Test (dev)', 'The newest work, sometimes unfinished', 'You want to try new features and report what you see'],
          ]}
        />
        <h3>The Update button</h3>
        <Steps>
          <Step n={1} title='It checks GitHub'>
            <p>It compares your copy with the latest version of the channel you are on. If nothing is new, it says so and tells you if the other channel has newer commits.</p>
          </Step>
          <Step n={2} title='It pulls the changes'>
            <p>If you edited a file that the update also changes, it asks to set your edits aside (git stash) first. Nothing is deleted. You can bring them back later.</p>
          </Step>
          <Step n={3} title='It restarts only if needed'>
            <p>
              Interface-only changes need no restart: the page reloads by itself. Server changes restart the local server, and the page then tries to start the simulation again with your saved options.
              The statistics and open simulated positions start again from zero.
            </p>
          </Step>
        </Steps>
        <h3>Switching channel</h3>
        <p>Use the selector next to the version number. The app confirms first, and refuses if switching could overwrite edits you made to tracked files.</p>
        <Callout kind='tip' title='Restore edits that were set aside'>
          In the project folder, run this in PowerShell:
        </Callout>
        <CodeBlock text='git stash pop' />
        <Callout kind='note' title='The launcher itself'>
          If the update changes the launcher (start.js) or the dependencies cannot be installed automatically, the button tells you to stop the server with Ctrl+C and run{' '}
          <Kbd>npm start</Kbd> again.
        </Callout>
      </>
    ),
  },
  {
    id: 'safety',
    title: 'Safety and keys',
    icon: <Lock className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>Paper mode needs only a free read-only key. Real mode needs a private key, which can move money. Treat it like cash.</p>
        <Table
          head={['Secret', 'Needed for', 'Where it is kept', 'If it leaks']}
          rows={[
            ['Helius API key', 'Paper', 'Saved in this browser; sent to your local server and to Helius when the simulation starts', 'Others can use your quota. Create a new key in the Helius dashboard.'],
            ['CoinVera API key', 'Real', 'Saved in this browser; sent through your local server to CoinVera', 'Others can use your quota. Replace it.'],
            ['Private key', 'Real', 'Memory only, unless you tick the remember box', 'Anyone can empty the wallet. Move the funds to a new wallet immediately.'],
          ]}
        />
        <h3>Good practice</h3>
        <ul className='hp-list'>
          <li>
            <strong>Use a throwaway wallet</strong> that holds only what you can afford to lose. Never use the wallet that holds your savings.
          </li>
          <li>
            <strong>Do not remember the private key</strong> in the browser. If an older save left it behind, the Real options show a red banner with an Erase button.
          </li>
          <li>
            <strong>Never paste a private key</strong> into a chat, an email or a support request, and never share a Log that you edited by hand.
          </li>
          <li>
            <strong>Verify the wallet you copy</strong> on Solscan. Impersonator wallets with similar names exist.
          </li>
          <li>
            <strong>Protect the GitHub account</strong> that publishes this project with two-factor authentication. The Update button runs the code that is on GitHub on your computer.
          </li>
          <li>
            <strong>Keep the server local.</strong> It only listens on your own computer, and the update command only accepts requests from the page opened on localhost.
          </li>
        </ul>
        <Callout kind='danger' title='Start small'>
          If you go live, begin with the smallest amount the app allows and watch the first trades one by one before increasing anything.
        </Callout>
      </>
    ),
  },
  {
    id: 'log',
    title: 'The Log and skipped trades',
    icon: <FileText className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>
          The Log at the bottom of the Paper page is a text report of everything that matters. Press <strong>Copy log</strong> and paste it when you ask for help. It contains no API key and no
          private key.
        </p>
        <h3>Why a trade can be skipped</h3>
        <Table
          head={['Reason shown', 'What it means', 'What to do']}
          rows={[
            ['Transaction already too old', 'Your server saw the trade more than 30 seconds after it happened', 'Check your connection and the clock warning'],
            ['Price read too long after the planned delay', 'The price was read more than 0.8 seconds late, so it would be unfair to count it', 'Normal during busy moments. Frequent: check Helius limits and use fewer scenarios'],
            ['Transaction not found', 'The blockchain did not return the transaction in time', 'Rare. Ignore unless it repeats'],
            ['Curve account unavailable', 'The Pump.fun price account could not be read', 'Usually a token that just finished its curve'],
            ['Coin paired with another coin', 'The token is traded against another coin, not SOL, so the SOL price cannot be computed', 'Nothing. These trades are deliberately ignored'],
            ['PumpSwap pool not identified', 'The app could not work out which pool the wallet traded in', 'Share the Log if the number is large'],
            ['PumpSwap pair is not SOL', 'The pool is not a SOL pool', 'Nothing. Deliberately ignored'],
            ['PumpSwap pool unreadable', 'The pool balances could not be read right now', 'Retry later. Share the Log if it repeats'],
            ['Trade routed through another exchange', 'The wallet traded this token through a router or another exchange. Pump.fun or PumpSwap only appeared as a step of the route, so the trade cannot be priced', 'Nothing. These trades are not simulated and are counted once per buy'],
          ]}
        />
        <h3>Sections worth reading first</h3>
        <ul className='hp-list'>
          <li>
            <strong>Operations.</strong> The number of open and closed operations, with the number of scenarios behind them. In the trade lists, the same op= tag marks the scenarios of one operation.
          </li>
          <li>
            <strong>Sample size.</strong> Hours since the last reset, different tokens traded, and tokens with a valid simulated entry.
          </li>
          <li>
            <strong>Latency.</strong> Detection lag and processing time. The clock line is an estimate of how far your computer clock is from the blockchain. It can also reflect network delays, so it does not prove
            by itself that your clock is wrong.
          </li>
          <li>
            <strong>RPC (Helius).</strong> Calls made and how many were refused. Refusals mean you are going too fast for your plan.
          </li>
          <li>
            <strong>Open positions.</strong> Each open simulated position shows its age. A position that stays open for hours may mean the app did not see the wallet sell.
          </li>
          <li>
            <strong>Diagnostics.</strong> The last rejected entry and the raw data behind it. These are mostly useful to whoever debugs the app.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    icon: <Wrench className='w-4 h-4' />,
    body: (
      <>
        <p className='hp-lead'>Find the message you see, then follow the fix.</p>
        <Table
          head={['What you see', 'Likely cause', 'Fix']}
          rows={[
            ['Local server unreachable', 'The terminal running the project was closed or crashed', 'Open PowerShell in the project folder and run npm.cmd start'],
            ['Helius key rejected or RPC unreachable', 'Wrong key, expired key or no internet', 'Re-copy the key from the Helius dashboard and paste it again'],
            ['Helius rate limit (429)', 'Too many requests for your plan', 'Wait a minute. Use fewer wallets or fewer scenarios'],
            ['Many trades skipped as read too long after the planned delay', 'Too many scenarios, or scenarios only a few milliseconds apart, queue up the requests', 'Remove some scenarios or space their delays further apart'],
            ['Your PC clock is behind the blockchain clock', 'Windows clock drift, or a delay in the measurement', 'Open PowerShell as administrator and run w32tm /resync'],
            ['Already up to date, but you expect changes', 'You are on the other channel', 'Check the selector next to the version number'],
            ['Local changes would be overwritten', 'You edited a file that the update changes', 'Accept the offer to set your edits aside'],
            ['The Update button seems to load forever', 'Old button code left over before the first update', 'Refresh the page once. After that it finishes by itself'],
            ['The server did not come back within 90 seconds', 'The restart failed', 'Look at the terminal running npm start, then run it again'],
            ['Not enough data', 'Fewer than 50 closed operations on the busiest scenario', 'Keep the simulation running'],
            ['No wallet trades appear', 'The wallet is idle, or the address is wrong', 'Check the address and its recent activity on Solscan'],
            ['Many Unpriced trades', 'The price could not be read when the simulation closed a position', 'Share the Log if the number grows'],
            ['A simulated position stays open for hours', 'The wallet never sold, or the app did not recognise its sale', 'Check the wallet on Solscan. The position closes at the max hold time. Share the Log if it happens often'],
          ]}
        />
        <Callout kind='tip' title='Nothing in this list?'>
          Copy the Log (Paper page, bottom) and the exact message you see, and send both to whoever supports you.
        </Callout>
      </>
    ),
  },
  {
    id: 'glossary',
    title: 'Glossary',
    icon: <BookMarked className='w-4 h-4' />,
    body: (
      <>
        <Table
          head={['Term', 'Meaning']}
          rows={[
            ['Bonding curve', 'The formula Pump.fun uses to price a new token before it moves to PumpSwap. The more people buy, the higher the price.'],
            ['PumpSwap', 'The exchange where a Pump.fun token trades after it finishes its curve.'],
            ['Lamport', 'The smallest unit of SOL. 1 SOL = 1,000,000,000 lamports.'],
            ['Mint', 'The unique address of a token.'],
            ['Slot', 'A block time window on Solana, about 0.4 seconds.'],
            ['RPC', 'A server that lets programs read the blockchain. Helius is one.'],
            ['WebSocket', 'A live connection that pushes events to you as they happen.'],
            ['Detection lag', 'Estimated time between a trade landing on the blockchain and your server learning about it.'],
            ['Operation', 'One buy by the followed wallet. It has one line in the activity tabs and as many scenarios as you configured.'],
            ['Scenario', 'One simulated way of copying the same trade, defined by a delay. You can run 1 to 10 at once. Scenarios of one operation are alternatives, not separate orders.'],
            ['Delay', 'The waiting time of a scenario, counted from the moment your server detects the trade.'],
            ['Routed trade', 'A trade that went through a router or another exchange, where Pump.fun or PumpSwap was only a step of the route. The app does not simulate it.'],
            ['Landing time', 'Time a real transaction needs to be included in a block. Not measured in Paper mode.'],
            ['Slippage', 'Difference between the price you expected and the price you get.'],
            ['Premium', 'How much more you paid than the wallet did for the same token.'],
            ['PnL', 'Profit and loss.'],
            ['Win rate', 'Share of closed simulated trades that ended in profit.'],
            ['Tip', 'Extra payment that helps a transaction get included quickly.'],
            ['Throwaway wallet', 'A wallet created only for this bot and holding only money you can afford to lose.'],
            ['Branch / channel', 'A line of versions of the code. Stable is main, Test is dev.'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'faq',
    title: 'Frequently asked questions',
    icon: <HelpCircle className='w-4 h-4' />,
    body: (
      <>
        <Q q='Is Paper mode really free?'>
          Yes. It uses a free Helius key and no transaction is ever sent. Heavy use can reach the limits of the free plan, which shows up as rate-limit messages.
        </Q>
        <Q q='How long should I let it run?'>
          Hours to see that it works, days to judge the strategy. You want at least 50 closed operations per scenario across many different tokens, and several different market days. Fifty is a minimum,
          not a guarantee.
        </Q>
        <Q q='How many scenarios can I test?'>
          From 1 to 10, each with its own delay between 0 and 60000 ms, all different. Use Add scenario in Options, Trade size and timing. Each scenario adds requests to Helius, so start with a few.
        </Q>
        <Q q='Why does one trade show several lines?'>
          Each line is a scenario of the same wallet buy. In the activity tabs, the operation has a single line and an arrow that shows its scenarios. They are alternatives for the same trade, so
          do not add their results together.
        </Q>
        <Q q='Why do the scenarios give different results?'>
          The later you buy after the trader, the more the price may have moved. Comparing scenarios shows how fragile the strategy is to being late. A strategy that only works at the fastest
          delay will probably fail in real life.
        </Q>
        <Q q='Why are some wallet trades not simulated?'>
          Some trades go through a router or another exchange, are paired with another coin than SOL, or arrive too late. The box Coverage and skipped trades, and the Log, give the reason and the count.
        </Q>
        <Q q='Can I follow more than one wallet?'>
          Yes. Add them in Options, Wallets followed. Each wallet adds requests, so watch the rate-limit counter in the Log.
        </Q>
        <Q q='Why is my result worse in Real mode than in Paper mode?'>
          Real mode adds landing time, failed transactions, slippage and extra fees such as the router fee. It also exits on stop loss and take profit instead of following the wallet.
        </Q>
        <Q q='Does the app guarantee profits?'>
          No. It measures what would have happened in the past, with simplifications. It cannot predict the future, and most memecoin traders lose money.
        </Q>
        <Q q='Where is my data stored?'>
          Your settings are in this browser. The server keeps results in memory while it runs, plus event files in the project folder under demo/logs, where closed simulated trades are also appended.
          A server restart clears the statistics shown on the page.
        </Q>
        <Q q='Do I need to keep the computer on?'>
          Yes. The simulation runs on your computer. If it sleeps or you close the terminal, the simulation stops.
        </Q>
        <Q q='How do I report a problem?'>
          Copy the Log from the Paper page, add a screenshot of what you see, and describe what you expected. Never include a private key.
        </Q>
        <p>
          Official references: <Ext href='https://pump.fun/docs/fees'>Pump.fun fees</Ext>, <Ext href='https://www.helius.dev'>Helius</Ext>, <Ext href='https://solscan.io'>Solscan</Ext>.
        </p>
      </>
    ),
  },
];
