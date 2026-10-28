import React, { useMemo, useState } from 'react';
import { Eye, EyeOff, Globe, Key, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import type { BotConfig } from '@/types/trading';
import { MenuItem } from './MenuItem';
import { DEFAULT_REAL_CONFIG, checkConfig, costPerSide, forgetSavedKey, readSavedState, saveConfig } from '@/lib/realConfig';
import type { FieldKey, RealSection } from '@/lib/realConfig';
import { short } from '@/lib/demoShared';

interface Props {
  config: BotConfig;
  onChange: (c: BotConfig) => void;
  section: string | null;
  onSection: (s: RealSection | null) => void;
}

type TextKey = 'coinveraApiKey' | 'walletAddress' | 'copyWalletAddress' | 'solanaRpcUrl';

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

export const RealSettings: React.FC<Props> = ({ config, onChange, section, onSection }) => {
  const [showKey, setShowKey] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(() => readSavedState(localStorage));

  const check = checkConfig(config);
  const cost = costPerSide(config);
  const toggle = (k: RealSection) => onSection(section === k ? null : k);
  const missing = (keys: FieldKey[]) => keys.some((k) => !!check.errors[k]);

  const derived = useMemo(() => {
    try {
      const bytes = bs58.decode(config.privateKey.trim());
      return bytes.length === 64 ? Keypair.fromSecretKey(bytes).publicKey.toBase58() : null;
    } catch {
      return null;
    }
  }, [config.privateKey]);

  const commit = (next: BotConfig) => {
    onChange(next);
    saveConfig(next, saved.remember, localStorage);
    setSaved(readSavedState(localStorage));
  };

  const text = (key: TextKey, errKey: FieldKey, label: string, hint?: string, secret = false) => (
    <div className='field'>
      <label htmlFor={`r-${key}`}>{label}</label>
      <input
        id={`r-${key}`}
        type={secret ? 'password' : 'text'}
        className={`input ${check.errors[errKey] ? 'invalid' : ''}`}
        value={config[key]}
        onChange={(e) => commit({ ...config, [key]: e.target.value })}
        autoComplete='off'
      />
      {check.errors[errKey] ? <span className='field-error'>{check.errors[errKey]}</span> : hint ? <span className='hint'>{hint}</span> : null}
    </div>
  );

  const num = (id: string, errKey: FieldKey, label: string, current: number, apply: (n: number) => BotConfig, hint?: string) => (
    <div className='field'>
      <label htmlFor={`r-${id}`}>{label}</label>
      <input
        id={`r-${id}`}
        inputMode='decimal'
        className={`input ${check.errors[errKey] ? 'invalid' : ''}`}
        value={drafts[id] ?? String(current)}
        onChange={(e) => {
          const raw = e.target.value;
          setDrafts({ ...drafts, [id]: raw });
          const n = Number(raw);
          if (raw.trim() !== '' && Number.isFinite(n)) commit(apply(n));
        }}
        onBlur={() => {
          const rest = { ...drafts };
          delete rest[id];
          setDrafts(rest);
        }}
      />
      {check.errors[errKey] ? <span className='field-error'>{check.errors[errKey]}</span> : hint ? <span className='hint'>{hint}</span> : null}
    </div>
  );

  const keyMatches = derived !== null && config.walletAddress.trim() === derived;
  const timeoutMin = config.timeoutMs / 60000;

  return (
    <>
      <div className='drawer-body'>
        <div className='menu-group-title'>Real trading</div>

        <MenuItem
          icon={<Key className='w-4 h-4' />}
          title='Keys and wallets'
          summary={config.copyWalletAddress ? `Copying ${short(config.copyWalletAddress)}` : 'Keys and wallets not set'}
          badge={missing(['coinveraApiKey', 'privateKey', 'walletAddress', 'copyWalletAddress']) ? 'To do' : undefined}
          open={section === 'keys'}
          onToggle={() => toggle('keys')}
        >
          <div className='alert warn text-xs'>
            This mode signs real transactions. Use a throwaway wallet that holds only what you can afford to lose. The private key stays in this browser tab and is
            not saved unless you tick the box below.
          </div>
          {text('coinveraApiKey', 'coinveraApiKey', 'CoinVera API key', 'Used to detect the trades of the wallet you copy.', true)}
          <div className='field'>
            <label htmlFor='r-privateKey'>Private key (base58)</label>
            <div className='flex gap-2'>
              <input
                id='r-privateKey'
                type={showKey ? 'text' : 'password'}
                className={`input ${check.errors.privateKey ? 'invalid' : ''}`}
                value={config.privateKey}
                onChange={(e) => commit({ ...config, privateKey: e.target.value })}
                autoComplete='off'
              />
              <button className='icon-btn' title={showKey ? 'Hide the key' : 'Show the key'} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
              </button>
            </div>
            {check.errors.privateKey ? <span className='field-error'>{check.errors.privateKey}</span> : <span className='hint'>Never share it, never paste it anywhere else.</span>}
          </div>
          {text('walletAddress', 'walletAddress', 'Your wallet address', 'The public address that matches the private key.')}
          {derived && config.walletAddress.trim() && !keyMatches && (
            <div className='alert warn text-xs flex flex-wrap items-center justify-between gap-2'>
              <span>This private key belongs to {short(derived)}, not to the address above.</span>
              <button className='btn btn-ghost' onClick={() => commit({ ...config, walletAddress: derived })}>
                Use {short(derived)}
              </button>
            </div>
          )}
          {derived && !config.walletAddress.trim() && (
            <button className='btn btn-ghost' onClick={() => commit({ ...config, walletAddress: derived })}>
              Fill my address from the key ({short(derived)})
            </button>
          )}
          {keyMatches && <span className='hint'>The key matches your wallet address.</span>}
          {text('copyWalletAddress', 'copyWalletAddress', 'Wallet to copy', 'The trader whose buys you copy. Verify it on Solscan first.')}
          <label className='flex items-start gap-2 text-xs text-slate-400'>
            <input
              type='checkbox'
              checked={saved.remember}
              onChange={(e) => {
                saveConfig(config, e.target.checked, localStorage);
                setSaved(readSavedState(localStorage));
              }}
            />
            <span>Also remember the private key in this browser (not recommended: it would be stored unencrypted).</span>
          </label>
          {saved.hasSavedPrivateKey && (
            <div className='alert error text-xs flex flex-wrap items-center justify-between gap-2'>
              <span>{saved.remember ? 'The private key is stored unencrypted in this browser.' : 'An older save left the private key unencrypted in this browser.'}</span>
              <button
                className='btn btn-ghost'
                onClick={() => {
                  forgetSavedKey(localStorage);
                  setSaved(readSavedState(localStorage));
                }}
              >
                Erase it
              </button>
            </div>
          )}
        </MenuItem>

        <MenuItem
          icon={<SlidersHorizontal className='w-4 h-4' />}
          title='Trade size and costs'
          summary={`${config.buyAmount} SOL, tip ${config.jitoTip} SOL, slippage ${config.slippage} %`}
          badge={missing(['buyAmount', 'jitoTip', 'slippage']) ? 'Fix' : undefined}
          open={section === 'trade'}
          onToggle={() => toggle('trade')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {num('buyAmount', 'buyAmount', 'Amount per trade (SOL)', config.buyAmount, (n) => ({ ...config, buyAmount: n }))}
            {num('jitoTip', 'jitoTip', 'Jito tip (SOL)', config.jitoTip, (n) => ({ ...config, jitoTip: n }), 'Paid on each buy and each sell.')}
            <div className='col-span-2'>
              {num('slippage', 'slippage', 'Slippage tolerance (%)', config.slippage, (n) => ({ ...config, slippage: n }), 'Maximum price move accepted between quote and fill.')}
            </div>
          </div>
          <div className='alert info text-xs'>
            Estimated cost per side: {cost.total.toFixed(2)} % (Pump.fun fee {cost.pump} % + router fee {cost.router} % + tip {cost.tip.toFixed(2)} %), so about{' '}
            {(cost.total * 2).toFixed(1)} % for a full round trip before any price move. Fee figures are estimates.
          </div>
        </MenuItem>

        <MenuItem
          icon={<ShieldAlert className='w-4 h-4' />}
          title='Risk and exits'
          summary={`Stop ${config.stopLossPct} %, take profit ${config.takeProfitPct} %, max hold ${Math.round(timeoutMin)} min`}
          badge={missing(['stopLossPct', 'takeProfitPct', 'timeoutMs', 'priceCheckDelayMs']) ? 'Fix' : undefined}
          open={section === 'risk'}
          onToggle={() => toggle('risk')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {num('stopLossPct', 'stopLossPct', 'Stop loss (%)', config.stopLossPct, (n) => ({ ...config, stopLossPct: n }), 'Sell if the price falls this much.')}
            {num('takeProfitPct', 'takeProfitPct', 'Take profit (%)', config.takeProfitPct, (n) => ({ ...config, takeProfitPct: n }), 'Sell if the price rises this much.')}
            {num('timeoutMin', 'timeoutMs', 'Max hold (minutes)', timeoutMin, (n) => ({ ...config, timeoutMs: Math.round(n * 60000) }), 'Sell when this time has passed.')}
            {num('priceCheckDelayMs', 'priceCheckDelayMs', 'Price check delay (ms)', config.priceCheckDelayMs, (n) => ({ ...config, priceCheckDelayMs: n }), 'Time between two price checks.')}
          </div>
        </MenuItem>

        <MenuItem
          icon={<Globe className='w-4 h-4' />}
          title='Network'
          summary={`RPC ${hostOf(config.solanaRpcUrl)}`}
          badge={missing(['solanaRpcUrl', 'wsUrl', 'pingIntervalMs']) ? 'Fix' : undefined}
          open={section === 'network'}
          onToggle={() => toggle('network')}
        >
          {text('solanaRpcUrl', 'solanaRpcUrl', 'Solana RPC URL', 'Used to confirm transactions and read balances.')}
          <div className='field'>
            <label htmlFor='r-wsUrl'>CoinVera WebSocket URL</label>
            <input
              id='r-wsUrl'
              className={`input ${check.errors.wsUrl ? 'invalid' : ''}`}
              value={config.websocket.url}
              onChange={(e) => commit({ ...config, websocket: { ...config.websocket, url: e.target.value } })}
            />
            {check.errors.wsUrl && <span className='field-error'>{check.errors.wsUrl}</span>}
          </div>
          {num('pingIntervalMs', 'pingIntervalMs', 'Ping interval (ms)', config.websocket.pingIntervalMs, (n) => ({ ...config, websocket: { ...config.websocket, pingIntervalMs: n } }))}
        </MenuItem>
      </div>

      <div className='drawer-foot'>
        <div className={`text-xs ${check.ok ? 'text-emerald-400' : 'text-amber-300'}`} style={{ maxWidth: 240 }}>
          {check.ok ? 'Configuration complete.' : `${Object.keys(check.errors).length} field(s) to fix.`} Saved in this browser; private key{' '}
          {saved.remember ? 'saved' : 'not saved'}.
        </div>
        <button
          className='btn btn-ghost'
          title='Restore the default trade, risk and network values (keeps your keys and wallets)'
          onClick={() =>
            commit({
              ...DEFAULT_REAL_CONFIG,
              coinveraApiKey: config.coinveraApiKey,
              privateKey: config.privateKey,
              walletAddress: config.walletAddress,
              copyWalletAddress: config.copyWalletAddress,
            })
          }
        >
          Defaults
        </button>
      </div>
    </>
  );
};
