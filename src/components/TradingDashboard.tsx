import React, { useState } from 'react';
import '@/modern.css';
import { DemoPanel } from './DemoPanel';
import { RealPanel } from './RealPanel';
import { LogReport } from './LogReport';
import { UpdateButton } from './UpdateButton';
import { SettingsMenu } from './SettingsMenu';
import { useTradingState } from '@/hooks/useTradingState';
import { useTradingOperations } from '@/hooks/useTradingOperations';
import { useBotControls } from '@/hooks/useBotControls';

type Mode = 'paper' | 'real';

const readMode = (): Mode => {
  try {
    return localStorage.getItem('uiMode') === 'real' ? 'real' : 'paper';
  } catch {
    return 'paper';
  }
};

export const TradingDashboard: React.FC = () => {
  const [mode, setModeState] = useState<Mode>(readMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem('uiMode', m);
    } catch {
      // storage unavailable
    }
  };

  const {
    config,
    setConfig,
    isConnected,
    setIsConnected,
    isBotRunning,
    setIsBotRunning,
    positions,
    setPositions,
    trades,
    setTrades,
    logs,
    seenBuys,
    setSeenBuys,
    addLog,
    handleClearHistory
  } = useTradingState();

  const { handleSellPosition, handleBuySignal, getTokenPrice } = useTradingOperations({
    config,
    addLog,
    setPositions,
    setTrades
  });

  const { handleStartBot, handleStopBot, handleForceSell } = useBotControls({
    config,
    isBotRunning,
    setIsBotRunning,
    positions,
    setPositions,
    addLog,
    setIsConnected,
    setSeenBuys,
    handleBuySignal,
    handleSellPosition,
    getTokenPrice,
    seenBuys
  });

  return (
    <div className='modern p-4'>
      <header className='app-header'>
        <div className='max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-3'>
          <div className='flex flex-wrap items-center gap-4'>
            <div>
              <h1 className='text-lg font-semibold leading-tight'>Pumpfun Copy Trading Bot</h1>
              <p className='text-xs text-slate-400'>
                {mode === 'paper' ? 'Paper trading: simulate first, risk nothing until the numbers say it works.' : 'Real trading: signs real transactions with your private key.'}
              </p>
            </div>
            <div className='seg' role='group' aria-label='Mode'>
              <button className={mode === 'paper' ? 'active' : ''} onClick={() => setMode('paper')} title='Simulation: no money, no private key'>
                Paper
              </button>
              <button className={mode === 'real' ? 'active' : ''} onClick={() => setMode('real')} title='Real bot: private key required'>
                Real
              </button>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            <SettingsMenu mode={mode} realConfig={config} onRealConfigChange={setConfig} />
            <UpdateButton />
          </div>
        </div>
      </header>

      <div className='max-w-[1400px] mx-auto space-y-5 pb-10'>
        {mode === 'paper' && (
          <div className='space-y-5'>
            <DemoPanel />
            <LogReport />
          </div>
        )}

        {mode === 'real' && (
          <RealPanel
            config={config}
            isConnected={isConnected}
            isBotRunning={isBotRunning}
            positions={positions}
            trades={trades}
            logs={logs}
            onStart={handleStartBot}
            onStop={handleStopBot}
            onClearHistory={handleClearHistory}
            onForceSell={handleForceSell}
          />
        )}
      </div>
    </div>
  );
};
