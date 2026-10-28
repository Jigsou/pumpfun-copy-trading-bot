import React from 'react';
import { Play, Settings, ShieldAlert, Square, Trash2 } from 'lucide-react';
import type { BotConfig, LogEntry, Position, Trade } from '@/types/trading';
import { PositionsTable } from './PositionsTable';
import { LiveFeed } from './LiveFeed';
import { LogsPanel } from './LogsPanel';
import { SECTION_OF, checkConfig, costPerSide } from '@/lib/realConfig';
import type { FieldKey } from '@/lib/realConfig';
import { openSettings } from '@/lib/uiEvents';
import { short } from '@/lib/demoShared';

interface Props {
  config: BotConfig;
  isConnected: boolean;
  isBotRunning: boolean;
  positions: Position[];
  trades: Trade[];
  logs: LogEntry[];
  onStart: () => void;
  onStop: () => void;
  onClearHistory: () => void;
  onForceSell: (mint: string) => void;
}

const Stat: React.FC<{ label: string; value: string; sub?: string }> = ({ label, value, sub }) => (
  <div className='stat'>
    <div className='stat-label'>{label}</div>
    <div className='stat-value' style={{ fontSize: '1.25rem' }}>
      {value}
    </div>
    {sub && <div className='stat-sub'>{sub}</div>}
  </div>
);

export const RealPanel: React.FC<Props> = ({ config, isConnected, isBotRunning, positions, trades, logs, onStart, onStop, onClearHistory, onForceSell }) => {
  const check = checkConfig(config);
  const cost = costPerSide(config);
  const exposure = positions.reduce((a, p) => a + p.solSize, 0);

  const handleStart = () => {
    if (!check.ok) {
      const first = Object.keys(check.errors)[0] as FieldKey;
      openSettings(SECTION_OF[first]);
      return;
    }
    const sure = window.confirm(
      `Start the REAL bot? It will sign real transactions from ${short(config.walletAddress)}, buying ${config.buyAmount} SOL per copied trade, with a stop loss of ${config.stopLossPct} % and a take profit of ${config.takeProfitPct} %.`
    );
    if (sure) onStart();
  };

  const step = (done: boolean, text: string) => (
    <li className='flex items-center gap-3 text-sm'>
      <span className={`chip ${done ? 'good' : 'warn'}`}>{done ? 'Done' : 'To do'}</span>
      <span className={done ? 'text-slate-400' : ''}>{text}</span>
      {!done && (
        <button className='btn btn-ghost ml-auto' onClick={() => openSettings('keys')}>
          Open options
        </button>
      )}
    </li>
  );

  return (
    <div className='space-y-5'>
      <div className='alert error flex items-start gap-2'>
        <ShieldAlert className='w-4 h-4 mt-0.5 shrink-0' />
        <span>This mode signs real transactions with your private key. Use a throwaway wallet, and only after paper mode has shown positive results over several days.</span>
      </div>

      <div className='panel'>
        <div className='panel-body flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='chip warn'>Real: signs real transactions</span>
            <span className='pill'>
              <span className={`dot ${isConnected ? 'on' : 'off'}`} />
              {isConnected ? 'CoinVera connected' : 'CoinVera disconnected'}
            </span>
            <span className='pill'>
              <span className={`dot ${isBotRunning ? 'on' : ''}`} />
              {isBotRunning ? 'Bot running' : 'Bot stopped'}
            </span>
          </div>
          <div className='flex flex-wrap gap-2'>
            {!isBotRunning ? (
              <button className='btn btn-primary' onClick={handleStart}>
                <Play className='w-4 h-4' />
                Start bot
              </button>
            ) : (
              <button className='btn btn-stop' onClick={onStop}>
                <Square className='w-4 h-4' />
                Stop bot
              </button>
            )}
            <button className='btn btn-ghost' onClick={onClearHistory}>
              <Trash2 className='w-4 h-4' />
              Clear history
            </button>
          </div>
        </div>
      </div>

      {!check.ok && !isBotRunning && (
        <section className='panel'>
          <header className='panel-head'>
            <div className='flex items-center gap-2 text-slate-200'>
              <Settings className='w-4 h-4 text-slate-400' />
              <h2 className='panel-title'>Get started</h2>
            </div>
          </header>
          <div className='panel-body'>
            <ul className='space-y-3'>
              {step(!check.errors.coinveraApiKey, 'Add your CoinVera API key')}
              {step(!check.errors.privateKey, 'Add the private key of your throwaway wallet')}
              {step(!check.errors.walletAddress, 'Add the matching wallet address')}
              {step(!check.errors.copyWalletAddress, 'Add the wallet you want to copy')}
            </ul>
          </div>
        </section>
      )}

      <div className='grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3'>
        <Stat label='Open positions' value={String(positions.length)} sub={`${exposure.toFixed(3)} SOL at risk`} />
        <Stat label='Trades this session' value={String(trades.length)} sub='Buys and sells' />
        <Stat label='Amount per trade' value={`${config.buyAmount} SOL`} sub={`tip ${config.jitoTip} SOL`} />
        <Stat label='Cost per side' value={`${cost.total.toFixed(2)} %`} sub='Estimate: fees + tip' />
        <Stat label='Stop / take profit' value={`-${config.stopLossPct} / +${config.takeProfitPct} %`} sub={`checked every ${config.priceCheckDelayMs} ms`} />
        <Stat label='Max hold' value={`${Math.round(config.timeoutMs / 60000)} min`} sub='Then sells' />
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-12 gap-5'>
        <div className='lg:col-span-8 space-y-5'>
          <PositionsTable positions={positions} onForceSell={onForceSell} />
          <LiveFeed trades={trades} />
        </div>
        <div className='lg:col-span-4'>
          <LogsPanel logs={logs} />
        </div>
      </div>
    </div>
  );
};
