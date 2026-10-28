export interface WalletState {
  address: string;
  label: string;
  buys: number;
  sells: number;
  lastSeen: number | null;
  subscribed: boolean;
}
export interface PositionRow {
  key: string;
  wallet: string;
  label: string;
  mint: string;
  delayMs: number;
  openedAt: number;
  entryPrice: number;
  targetPrice: number;
  slipVsTargetPct: number;
  pipelineMs: number;
}
export interface TradeRow {
  time: number;
  wallet: string;
  label: string;
  mint: string;
  delayMs: number;
  slipVsTargetPct: number;
  heldSec: number;
  reason: string;
  pnlSol: number | null;
  pnlPct: number | null;
}
export interface EventRow {
  time: number;
  wallet: string;
  label: string;
  side: 'buy' | 'sell';
  mint: string;
  sol: number;
  venue: string;
  signature: string;
  fetchMs: number;
}
export interface StatRow {
  delayMs: number;
  n: number;
  unpriced: number;
  wins: number;
  winRate: number | null;
  totalPnlSol: number;
  avgPnlPct: number | null;
  medianSlipPct: number | null;
}
export interface Latency {
  samples: number;
  avgChainLagMs: number | null;
  medianChainLagMs: number | null;
  p90ChainLagMs: number | null;
  avgFetchMs: number | null;
  medianFetchMs: number | null;
}
export interface Coverage {
  walletTrades: number;
  onCurve: number;
  onAmm: number;
  skipped: number;
  unpriced: number;
  rejected: number;
  distinctTokens?: number;
  usableTokens?: number;
  startedAt?: number;
  lastMismatch: Record<string, unknown> | null;
}
export interface ServerSettings {
  buySol: number;
  delaysMs: number[];
  feePct: number;
  costPerTxSol: number;
  timeoutMin: number;
  maxPremiumPct?: number;
  minWalletBuySol?: number;
}
export interface PremiumBucket {
  label: string;
  n: number;
  winRate: number | null;
  avgPnlPct: number | null;
  medianPnlPct: number | null;
  totalPnlSol: number;
}
export interface Premium {
  delayMs: number | null;
  buckets: PremiumBucket[];
}
export interface DemoState {
  running: boolean;
  connected: boolean;
  settings?: ServerSettings;
  wallets: WalletState[];
  positions: PositionRow[];
  trades: TradeRow[];
  events: EventRow[];
  stats: StatRow[];
  skipped: number;
  latency?: Latency;
  coverage?: Coverage;
  premium?: Premium;
  filtered?: { tooSmall: number; premiumTooHigh: number };
  skipReasons?: Record<string, number>;
  lastError: { message: string; time: number } | null;
}

const FR_EN: [string, string][] = [
  ['vente de la cible', 'Target sold'],
  ['delai depasse', 'Timeout'],
  ['non evaluable', 'unpriced'],
  ['Adresse Solana invalide (32 a 44 caracteres base58).', 'Invalid Solana address (32 to 44 base58 characters).'],
  ['Adresse invalide', 'Invalid address'],
  ['Cle Helius manquante.', 'Missing Helius key.'],
  ['Ajoute au moins un wallet a suivre.', 'Add at least one wallet to follow.'],
  ['Cle Helius refusee ou RPC injoignable', 'Helius key rejected or RPC unreachable'],
  ['Commande inconnue', 'Unknown command'],
  ['Abonnement refuse', 'Subscription refused'],
  ['Ouverture simulee', 'Simulated open'],
  ['Envoi WebSocket', 'WebSocket send'],
  ['reponse invalide', 'invalid response'],
  ['limite de requetes Helius (429) apres', 'Helius rate limit (429) after'],
  ['essais', 'attempts'],
];

export const translateText = (s: string) => FR_EN.reduce((acc, [fr, en]) => acc.split(fr).join(en), s);
export const short = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;
export const fmtPct = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(1)} %`);
export const fmtSol = (v: number | null | undefined) => (v == null ? '-' : `${v >= 0 ? '+' : ''}${v.toFixed(4)}`);
export const fmtTime = (t: number) => new Date(t).toLocaleTimeString('en-GB');
export const fmtMs = (v: number | null | undefined) => (v == null ? '-' : `${Math.round(v)} ms`);
export const tone = (v: number | null | undefined) => (v == null ? 'text-slate-400' : v >= 0 ? 'text-emerald-400' : 'text-rose-400');
