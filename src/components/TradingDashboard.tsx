import React, { useState } from 'react';
import '@/modern.css';
import { ConfigPanel } from './ConfigPanel';
import { LiveFeed } from './LiveFeed';
import { PositionsTable } from './PositionsTable';
import { LogsPanel } from './LogsPanel';
import { BotControls } from './BotControls';
import { StatusIndicator } from './StatusIndicator';
import { DemoPanel } from './DemoPanel';
import { LogReport } from './LogReport';
import { UpdateButton } from './UpdateButton';
import { SettingsMenu } from './SettingsMenu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingState } from '@/hooks/useTradingState';
import { useTradingOperations } from '@/hooks/useTradingOperations';
import { useBotControls } from '@/hooks/useBotControls';

type Mode = 'paper' | 'real';

const TAB_LIST = 'grid w-full grid-cols-2 h-auto p-1 rounded-lg bg-transparent border border-white/10';
const TAB_TRIGGER = 'rounded-md py-2 text-slate-400 data-[state=active]:text-white data-[state=active]:bg-white/10';

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
            {mode === 'paper' && <SettingsMenu />}
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
          <div className='space-y-6'>
            <div className='alert error'>
              Warning: this bot signs real transactions with your private key. Only use a throwaway wallet, and only after validating paper mode.
            </div>

            <div className='flex flex-wrap items-start gap-4'>
              <div className='flex-1 min-w-[280px]'>
                <BotControls
                  isBotRunning={isBotRunning}
                  onStart={handleStartBot}
                  onStop={handleStopBot}
                  onClearHistory={handleClearHistory}
                />
              </div>
              <StatusIndicator isConnected={isConnected} isBotRunning={isBotRunning} />
            </div>

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              <div className='lg:col-span-2 space-y-6'>
                <Tabs defaultValue='config' className='w-full'>
                  <TabsList className={TAB_LIST}>
                    <TabsTrigger value='config' className={TAB_TRIGGER}>Configuration</TabsTrigger>
                    <TabsTrigger value='feed' className={TAB_TRIGGER}>Live Feed</TabsTrigger>
                  </TabsList>
                  <TabsContent value='config' className='mt-4'>
                    <ConfigPanel config={config} onConfigChange={setConfig} />
                  </TabsContent>
                  <TabsContent value='feed' className='mt-4'>
                    <LiveFeed trades={trades} />
                  </TabsContent>
                </Tabs>

                <PositionsTable positions={positions} onForceSell={handleForceSell} />
              </div>

              <div className='lg:col-span-1'>
                <LogsPanel logs={logs} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
