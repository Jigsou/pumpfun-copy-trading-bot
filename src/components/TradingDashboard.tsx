import React from 'react';
import '@/modern.css';
import { ConfigPanel } from './ConfigPanel';
import { LiveFeed } from './LiveFeed';
import { PositionsTable } from './PositionsTable';
import { LogsPanel } from './LogsPanel';
import { BotControls } from './BotControls';
import { StatusIndicator } from './StatusIndicator';
import { DemoPanel } from './DemoPanel';
import { StrategyFilters } from './StrategyFilters';
import { LogReport } from './LogReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingState } from '@/hooks/useTradingState';
import { useTradingOperations } from '@/hooks/useTradingOperations';
import { useBotControls } from '@/hooks/useBotControls';

const TAB_LIST = 'grid w-full grid-cols-2 h-auto p-1 rounded-lg bg-transparent border border-white/10';
const TAB_TRIGGER = 'rounded-md py-2 text-slate-400 data-[state=active]:text-white data-[state=active]:bg-white/10';

export const TradingDashboard: React.FC = () => {
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
        <div className='max-w-[1400px] mx-auto'>
          <h1 className='text-lg font-semibold leading-tight'>Pumpfun Copy Trading Bot</h1>
          <p className='text-xs text-slate-400'>Simulate first. Risk nothing until the numbers say it works.</p>
        </div>
      </header>

      <div className='max-w-[1400px] mx-auto space-y-5 pb-10'>
        <Tabs defaultValue='demo' className='w-full'>
          <TabsList className={TAB_LIST}>
            <TabsTrigger value='demo' className={TAB_TRIGGER}>Demo mode (no money)</TabsTrigger>
            <TabsTrigger value='real' className={TAB_TRIGGER}>Real bot (private key required)</TabsTrigger>
          </TabsList>

          <TabsContent value='demo' className='mt-5 space-y-5'>
            <DemoPanel />
            <StrategyFilters />
            <LogReport />
          </TabsContent>

          <TabsContent value='real' className='mt-5 space-y-6'>
            <div className='alert error'>
              Warning: this bot signs real transactions with your private key. Only use a throwaway wallet, and only after validating demo mode.
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
