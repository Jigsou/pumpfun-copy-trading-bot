import React from 'react';
import { Coins, FileText, HelpCircle, LifeBuoy, Lock, RefreshCw, SlidersHorizontal, Wrench, BookMarked } from 'lucide-react';
import type { HelpSection } from './ui';
import { Callout, CodeBlock, Ext, Kbd, Step, Steps, Table } from './ui';

const Q: React.FC<{ q: string; children: React.ReactNode }> = ({ q, children }) => (
  <details className='hp-faq'>
    <summary>{q}</summary>
    <div>{children}</div>
  </details>
);

export const PART2: HelpSection[] = [
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
            ['Helius API key', 'Lets your local server read the blockchain. Stored only in this browser.', 'Your free key', 'Empty'],
            ['Wallets followed', 'The traders whose buys and sells are replayed. Several can be followed at once.', 'Valid Solana addresses', 'One suggested wallet'],
            ['Amount per trade', 'Size of each simulated copy. Bigger sizes move the price more in the calculation.', '0.001 to 1000 SOL', '0.1'],
            ['Max hold', 'Closes a simulated position if the wallet has not sold by then.', '1 to 1440 minutes', '30'],
            ['Delays tested', 'Waiting times between detecting a trade and your simulated entry. All are tested at once.', '1 to 6 whole numbers, 0 to 60000 ms, separated by commas', '300,1000,3000'],
            ['Pump.fun fee', 'Percentage taken on each simulated buy and sell.', '0 to 20 %', '1.25'],
            ['Cost per transaction', 'Network fee plus tip, subtracted on each side.', '0 to 1 SOL', '0.001'],
            ['Max entry premium', 'Skips an entry that costs more than this percentage above what the wallet paid. 0 turns it off.', '0 to 1000 %', '0 (off)'],
            ['Min wallet buy', 'Ignores wallet buys smaller than this. 0 turns it off.', '0 to 1000 SOL', '0 (off)'],
          ]}
        />
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
            ['Stable (main)', 'Tested versions, released only when several improvements are ready', 'You want the app to work and to collect reliable results'],
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
              Interface-only changes need no restart: the page reloads by itself. Server changes restart the local server, and a running simulation resumes automatically with statistics
              starting again from zero.
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
            ['Helius API key', 'Paper', 'This browser only', 'Others can use your quota. Create a new key in the Helius dashboard.'],
            ['CoinVera API key', 'Real', 'This browser only', 'Others can use your quota. Replace it.'],
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
            ['Price read too long after the planned delay', 'The price was read more than 0.8 seconds late, so it would be unfair to count it', 'Normal during busy moments. Frequent: check Helius limits'],
            ['Transaction not found', 'The blockchain did not return the transaction in time', 'Rare. Ignore unless it repeats'],
            ['Curve account unavailable', 'The Pump.fun price account could not be read', 'Usually a token that just finished its curve'],
            ['Coin paired with another coin', 'The token is traded against another coin, not SOL, so the SOL price cannot be computed', 'Nothing. These trades are deliberately ignored'],
            ['PumpSwap pool not identified', 'The app could not work out which pool the wallet traded in', 'Share the Log if the number is large'],
            ['PumpSwap pair is not SOL', 'The pool is not a SOL pool', 'Nothing. Deliberately ignored'],
            ['PumpSwap pool unreadable', 'The pool balances could not be read right now', 'Retry later. Share the Log if it repeats'],
          ]}
        />
        <h3>Sections worth reading first</h3>
        <ul className='hp-list'>
          <li>
            <strong>Sample size.</strong> Hours since the last reset, different tokens traded, and tokens with a valid simulated entry.
          </li>
          <li>
            <strong>Latency.</strong> Detection lag and processing time. The clock line shows how far your computer clock is from the blockchain.
          </li>
          <li>
            <strong>RPC (Helius).</strong> Calls made and how many were refused. Refusals mean you are going too fast for your plan.
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
            ['Helius rate limit (429)', 'Too many requests for your plan', 'Wait a minute. Use fewer wallets or fewer delays'],
            ['Your PC clock is behind the blockchain clock', 'Windows clock drift', 'Open PowerShell as administrator and run w32tm /resync'],
            ['Already up to date, but you expect changes', 'You are on the other channel', 'Check the selector next to the version number'],
            ['Local changes would be overwritten', 'You edited a file that the update changes', 'Accept the offer to set your edits aside'],
            ['The Update button seems to load forever', 'Old button code left over before the first update', 'Refresh the page once. After that it finishes by itself'],
            ['The server did not come back within 90 seconds', 'The restart failed', 'Look at the terminal running npm start, then run it again'],
            ['Not enough data', 'Fewer than 50 closed trades on the busiest delay', 'Keep the simulation running'],
            ['No wallet trades appear', 'The wallet is idle, or the address is wrong', 'Check the address and its recent activity on Solscan'],
            ['Many Unpriced trades', 'The price could not be read when the simulation closed a position', 'Share the Log if the number grows'],
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
            ['Detection lag', 'Time between a trade landing on the blockchain and your server learning about it.'],
            ['Delay', 'The waiting time you add after detecting a trade before your simulated entry.'],
            ['Landing time', 'Time a real transaction needs to be included in a block. Not measured in Paper mode.'],
            ['Slippage', 'Difference between the price you expected and the price you get.'],
            ['Premium', 'How much more you paid than the wallet did for the same token.'],
            ['PnL', 'Profit and loss.'],
            ['Win rate', 'Share of closed trades that ended in profit.'],
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
          Hours to see that it works, days to judge the strategy. You want at least 50 closed trades per delay across many different tokens, and several different market days.
        </Q>
        <Q q='Why do the three delays give different results?'>
          The later you buy after the trader, the more the price may have moved. Comparing delays shows how fragile the strategy is to being late. A strategy that only works at the fastest
          delay will probably fail in real life.
        </Q>
        <Q q='Can I follow more than one wallet?'>
          Yes. Add them in Options, Wallets followed. Each wallet adds requests, so watch the rate-limit counter in the Log.
        </Q>
        <Q q='Why is my result worse in Real mode than in Paper mode?'>
          Real mode adds landing time, failed transactions, slippage and extra fees such as the router fee. It also exits on stop loss and take profit instead of following the wallet.
        </Q>
        <Q q='Does the app guarantee profits?'>
          No. It measures what would have happened in the past. It cannot predict the future, and most memecoin traders lose money.
        </Q>
        <Q q='Where is my data stored?'>
          Your settings are in this browser. The server keeps results in memory while it runs, plus event files in the project folder under demo/logs. A server restart clears the statistics.
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

export const SupportIcon = LifeBuoy;
