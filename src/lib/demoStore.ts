export interface WalletEntry {
  address: string;
  label: string;
}
export interface DemoForm {
  buySol: string;
  delays: string;
  feePct: string;
  costPerTxSol: string;
  timeoutMin: string;
  maxPremium: string;
  minBuy: string;
}
export interface DemoSettingsState {
  apiKey: string;
  wallets: WalletEntry[];
  form: DemoForm;
}
export interface ParsedSettings {
  buySol: number;
  delaysMs: number[];
  feePct: number;
  costPerTxSol: number;
  timeoutMin: number;
  maxPremiumPct: number;
  minWalletBuySol: number;
}
export interface Validation {
  ok: boolean;
  errors: Partial<Record<keyof DemoForm, string>>;
  settings?: ParsedSettings;
}

export const MAX_SCENARIOS = 10;
const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const OLD_DEFAULT_LABEL = 'Cupsey ? (a verifier sur Solscan)';
export const DEFAULT_LABEL = 'Cupsey ? (verify on Solscan)';
export const DEFAULT_WALLETS: WalletEntry[] = [{ address: '6DQAGJT7VZPVBsuG4kn3AvpyHCEi7B2RFFvMZdbqQqqP', label: DEFAULT_LABEL }];
export const DEFAULT_FORM: DemoForm = {
  buySol: '0.1',
  delays: '300,1000,3000',
  feePct: '1.25',
  costPerTxSol: '0.001',
  timeoutMin: '30',
  maxPremium: '0',
  minBuy: '0',
};

export const delaysToList = (delays: string): string[] => delays.split(',').map((s) => s.trim());
export const listToDelays = (list: string[]): string => list.join(',');
export function nextDelay(list: string[]): string {
  const nums = list.map(Number).filter((n) => Number.isFinite(n));
  const base = nums.length ? Math.max(...nums) : 0;
  let next = Math.min(60000, base + 1000);
  while (nums.includes(next)) next = (next + 1) % 60001;
  return String(next);
}

const storage = (): Storage | null => (typeof localStorage !== 'undefined' ? localStorage : null);

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadState(): DemoSettingsState {
  const s = storage();
  const read = (k: string) => (s ? s.getItem(k) : null);
  const savedForm = parseJson<Partial<DemoForm>>(read('demoForm'), {});
  const form: DemoForm = { ...DEFAULT_FORM };
  for (const key of ['buySol', 'delays', 'feePct', 'costPerTxSol', 'timeoutMin'] as const) {
    if (typeof savedForm[key] === 'string') form[key] = savedForm[key] as string;
  }
  form.maxPremium = read('demoMaxPremium') ?? DEFAULT_FORM.maxPremium;
  form.minBuy = read('demoMinBuy') ?? DEFAULT_FORM.minBuy;
  const rawWallets = parseJson<WalletEntry[]>(read('demoWallets'), DEFAULT_WALLETS);
  const wallets = (Array.isArray(rawWallets) ? rawWallets : DEFAULT_WALLETS)
    .filter((w) => w && typeof w.address === 'string' && typeof w.label === 'string')
    .map((w) => (w.label === OLD_DEFAULT_LABEL ? { ...w, label: DEFAULT_LABEL } : w));
  return { apiKey: read('demoHeliusKey') ?? '', wallets, form };
}

function persist(state: DemoSettingsState) {
  const s = storage();
  if (!s) return;
  const { maxPremium, minBuy, ...legacyForm } = state.form;
  s.setItem('demoHeliusKey', state.apiKey);
  s.setItem('demoWallets', JSON.stringify(state.wallets));
  s.setItem('demoForm', JSON.stringify(legacyForm));
  s.setItem('demoMaxPremium', maxPremium);
  s.setItem('demoMinBuy', minBuy);
}

let current: DemoSettingsState = loadState();
const listeners = new Set<() => void>();

export const getSnapshot = () => current;
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

function commit(next: DemoSettingsState) {
  current = next;
  persist(next);
  listeners.forEach((l) => l());
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', () => {
    current = loadState();
    listeners.forEach((l) => l());
  });
}

export const setApiKey = (apiKey: string) => commit({ ...current, apiKey });
export const setForm = (patch: Partial<DemoForm>) => commit({ ...current, form: { ...current.form, ...patch } });
export const resetForm = () => commit({ ...current, form: { ...DEFAULT_FORM } });

export function addWallet(address: string, label: string): string | null {
  const a = address.trim();
  if (!BASE58.test(a)) return 'Invalid Solana address (32 to 44 characters).';
  const name = label.trim() || `${a.slice(0, 4)}...${a.slice(-4)}`;
  commit({ ...current, wallets: [...current.wallets.filter((w) => w.address !== a), { address: a, label: name }] });
  return null;
}
export const removeWallet = (address: string) => commit({ ...current, wallets: current.wallets.filter((w) => w.address !== address) });
export const onlyWallet = (address: string) => commit({ ...current, wallets: current.wallets.filter((w) => w.address === address) });

const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

export function validateForm(form: DemoForm): Validation {
  const errors: Partial<Record<keyof DemoForm, string>> = {};
  const check = (key: keyof DemoForm, min: number, max: number, label: string): number => {
    const n = num(form[key]);
    if (!Number.isFinite(n) || n < min || n > max) {
      errors[key] = `${label} must be a number between ${min} and ${max}.`;
      return 0;
    }
    return n;
  };
  const buySol = check('buySol', 0.001, 1000, 'Amount');
  const feePct = check('feePct', 0, 20, 'Fee');
  const costPerTxSol = check('costPerTxSol', 0, 1, 'Cost per transaction');
  const timeoutMin = check('timeoutMin', 1, 1440, 'Max hold');
  const maxPremiumPct = check('maxPremium', 0, 1000, 'Max premium');
  const minWalletBuySol = check('minBuy', 0, 1000, 'Minimum buy');
  const parts = delaysToList(form.delays);
  const raw = parts.map((s) => (s === '' ? NaN : Number(s)));
  if (parts.length < 1 || parts.length > MAX_SCENARIOS) {
    errors.delays = `Use 1 to ${MAX_SCENARIOS} scenarios.`;
  } else if (raw.some((d) => !Number.isInteger(d) || d < 0 || d > 60000)) {
    errors.delays = 'Each scenario needs a whole number of milliseconds between 0 and 60000.';
  } else if (new Set(raw).size !== raw.length) {
    errors.delays = 'Each scenario needs a different delay.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const delaysMs = [...new Set(raw)].sort((a, b) => a - b);
  return { ok: true, errors, settings: { buySol, delaysMs, feePct, costPerTxSol, timeoutMin, maxPremiumPct, minWalletBuySol } };
}

export function settingsEqual(
  a: ParsedSettings,
  b: { buySol: number; delaysMs: number[]; feePct: number; costPerTxSol: number; timeoutMin: number; maxPremiumPct?: number; minWalletBuySol?: number }
): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  return (
    close(a.buySol, b.buySol) &&
    close(a.feePct, b.feePct) &&
    close(a.costPerTxSol, b.costPerTxSol) &&
    close(a.timeoutMin, b.timeoutMin) &&
    close(a.maxPremiumPct, b.maxPremiumPct ?? 0) &&
    close(a.minWalletBuySol, b.minWalletBuySol ?? 0) &&
    a.delaysMs.length === b.delaysMs.length &&
    a.delaysMs.every((d, i) => d === b.delaysMs[i])
  );
}
