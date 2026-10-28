import React from 'react';
import { ConfigPanel } from './ConfigPanel';
import { LiveFeed } from './LiveFeed';
import { PositionsTable } from './PositionsTable';
import { LogsPanel } from './LogsPanel';
import { BotControls } from './BotControls';
import { StatusIndicator } from './StatusIndicator';
import { DemoPanel } from './DemoPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTradingState } from '@/hooks/useTradingState';
import { useTradingOperations } from '@/hooks/useTradingOperations';
import { useBotControls } from '@/hooks/useBotControls';

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
    <div className='min-h-screen bg-gray-950 text-white p-4'>
      <div className='max-w-7xl mx-auto space-y-6'>
        {/* Header */}
        <div className='flex flex-col md:flex-row items-start md:items-center justify-between gap-4'>
          <div className='space-y-2'>
            <h1 className='text-3xl font-bold text-white'>Pumpfun Copy Trading Bot</h1>
            <p className='text-gray-400 text-sm md:text-base leading-relaxed max-w-2xl'>
              Commence par le mode demo : il simule les trades d'un wallet sans cle privee ni argent reel.
            </p>
          </div>
          <StatusIndicator isConnected={isConnected} isBotRunning={isBotRunning} />
        </div>

        <Tabs defaultValue='demo' className='w-full'>
          <TabsList className='grid w-full grid-cols-2 bg-gray-800'>
            <TabsTrigger value='demo'>Mode demo (sans argent)</TabsTrigger>
            <TabsTrigger value='real'>Bot reel (cle privee requise)</TabsTrigger>
          </TabsList>

          <TabsContent value='demo' className='mt-6'>
            <DemoPanel />
          </TabsContent>

          <TabsContent value='real' className='mt-6 space-y-6'>
            <div className='rounded-md border border-red-600 bg-red-900/20 p-3 text-sm text-red-200'>
              Attention : ce bot signe de vraies transactions avec ta cle privee. N'utilise qu'un wallet jetable, et seulement apres avoir valide le mode demo.
            </div>

            <BotControls
              isBotRunning={isBotRunning}
              onStart={handleStartBot}
              onStop={handleStopBot}
              onClearHistory={handleClearHistory}
            />

            <div className='grid grid-cols-1 lg:grid-cols-3 gap-6'>
              <div className='lg:col-span-2 space-y-6'>
                <Tabs defaultValue='config' className='w-full'>
                  <TabsList className='grid w-full grid-cols-2 bg-gray-800'>
                    <TabsTrigger value='config'>Configuration</TabsTrigger>
                    <TabsTrigger value='feed'>Live Feed</TabsTrigger>
                  </TabsList>
                  <TabsContent value='config'>
                    <ConfigPanel config={config} onConfigChange={setConfig} />
                  </TabsContent>
                  <TabsContent value='feed'>
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
