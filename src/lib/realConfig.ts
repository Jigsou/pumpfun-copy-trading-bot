import type { BotConfig } from '@/types/trading';

export type FieldKey =
  | 'coinveraApiKey'
  | 'privateKey'
  | 'walletAddress'
  | 'copyWalletAddress'
  | 'buyAmount'
  | 'jitoTip'
  | 'slippage'
  | 'stopLossPct'
  | 'takeProfitPct'
  | 'timeoutMs'
  | 'priceCheckDelayMs'
  | 'solanaRpcUrl'
  | 'wsUrl'
  | 'pingIntervalMs';
export type RealSection = 'keys' | 'trade' | 'risk' | 'network';

export const DEFAULT_REAL_CONFIG: BotConfig = {
  solanaRpcUrl: 'https://api.mainnet-beta.solana.com',
  coinveraApiKey: '',
  privateKey: '',
  walletAddress: '',
  copyWalletAddress: '',
  buyAmount: 0.1,
  jitoTip: 0.0005,
  slippage: 20,
  stopLossPct: 5,
  takeProfitPct: 10,
  timeoutMs: 3600000,
  priceCheckDelayMs: 2000,
  websocket: { url: 'wss://api.coinvera.io', pingIntervalMs: 10000 },
};

export const SECTION_OF: Record<FieldKey, RealSection> = {
  coinveraApiKey: 'keys',
  privateKey: 'keys',
  walletAddress: 'keys',
  copyWalletAddress: 'keys',
  buyAmount: 'trade',
  jitoTip: 'trade',
  slippage: 'trade',
  stopLossPct: 'risk',
  takeProfitPct: 'risk',
  timeoutMs: 'risk',
  priceCheckDelayMs: 'risk',
  solanaRpcUrl: 'network',
  wsUrl: 'network',
  pingIntervalMs: 'network',
};

const ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const SECRET = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

export interface ConfigCheck {
  ok: boolean;
  errors: Partial<Record<FieldKey, string>>;
}

export function checkConfig(c: BotConfig): ConfigCheck {
  const errors: Partial<Record<FieldKey, string>> = {};
  if (!c.coinveraApiKey.trim()) errors.coinveraApiKey = 'The CoinVera API key is required.';
  if (!c.privateKey.trim()) errors.privateKey = 'The private key is required.';
  else if (!SECRET.test(c.privateKey.trim())) errors.privateKey = 'A secret key is a base58 text of about 88 characters.';
  if (!c.walletAddress.trim()) errors.walletAddress = 'Your wallet address is required.';
  else if (!ADDRESS.test(c.walletAddress.trim())) errors.walletAddress = 'Invalid Solana address (32 to 44 characters).';
  if (!c.copyWalletAddress.trim()) errors.copyWalletAddress = 'The wallet to copy is required.';
  else if (!ADDRESS.test(c.copyWalletAddress.trim())) errors.copyWalletAddress = 'Invalid Solana address (32 to 44 characters).';
  const range = (key: FieldKey, n: number, min: number, max: number, label: string) => {
    if (!Number.isFinite(n) || n < min || n > max) errors[key] = `${label} must be between ${min} and ${max}.`;
  };
  range('buyAmount', c.buyAmount, 0.001, 1000, 'Amount');
  range('jitoTip', c.jitoTip, 0, 1, 'Tip');
  range('slippage', c.slippage, 1, 100, 'Slippage');
  range('stopLossPct', c.stopLossPct, 0.1, 100, 'Stop loss');
  range('takeProfitPct', c.takeProfitPct, 0.1, 1000, 'Take profit');
  range('timeoutMs', c.timeoutMs, 60000, 86400000, 'Max hold');
  range('priceCheckDelayMs', c.priceCheckDelayMs, 500, 60000, 'Price check delay');
  range('pingIntervalMs', c.websocket.pingIntervalMs, 1000, 120000, 'Ping interval');
  if (!c.solanaRpcUrl.trim().startsWith('http')) errors.solanaRpcUrl = 'The RPC URL must start with http or https.';
  if (!c.websocket.url.trim().startsWith('ws')) errors.wsUrl = 'The WebSocket URL must start with ws or wss.';
  return { ok: Object.keys(errors).length === 0, errors };
}

export const PUMP_FEE_PCT = 1.25;
export const ROUTER_FEE_PCT = 0.3;

export function costPerSide(c: BotConfig) {
  const tip = c.buyAmount > 0 ? (c.jitoTip / c.buyAmount) * 100 : 0;
  return { pump: PUMP_FEE_PCT, router: ROUTER_FEE_PCT, tip, total: PUMP_FEE_PCT + ROUTER_FEE_PCT + tip };
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const CONFIG_KEY = 'tradingBotConfig';
export const REMEMBER_KEY = 'tradingBotRememberKey';

export function saveConfig(c: BotConfig, rememberKey: boolean, s: StorageLike) {
  s.setItem(CONFIG_KEY, JSON.stringify({ ...c, privateKey: rememberKey ? c.privateKey : '' }));
  s.setItem(REMEMBER_KEY, rememberKey ? '1' : '0');
}

export function readSavedState(s: StorageLike) {
  let hasSavedPrivateKey = false;
  try {
    const raw = s.getItem(CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    hasSavedPrivateKey = !!parsed && typeof parsed.privateKey === 'string' && parsed.privateKey.length > 0;
  } catch {
    hasSavedPrivateKey = false;
  }
  return { hasSavedPrivateKey, remember: s.getItem(REMEMBER_KEY) === '1' };
}

export function forgetSavedKey(s: StorageLike) {
  try {
    const raw = s.getItem(CONFIG_KEY);
    if (raw) s.setItem(CONFIG_KEY, JSON.stringify({ ...JSON.parse(raw), privateKey: '' }));
  } catch {
    // unreadable saved config
  }
  s.setItem(REMEMBER_KEY, '0');
}
