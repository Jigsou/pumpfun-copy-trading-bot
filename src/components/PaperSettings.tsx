import React, { useState } from 'react';
import { ChevronRight, Eye, EyeOff, Filter, Key, Plus, SlidersHorizontal, Target, Trash2, TrendingUp, Wallet } from 'lucide-react';
import { useDemoSettings } from '@/hooks/useDemo';
import type { DemoServer } from '@/hooks/useDemo';
import {
  MAX_SCENARIOS,
  addWallet,
  delaysToList,
  listToDelays,
  nextDelay,
  onlyWallet,
  removeWallet,
  resetForm,
  setApiKey,
  setForm,
  settingsEqual,
  validateForm,
} from '@/lib/demoStore';
import type { DemoForm } from '@/lib/demoStore';
import { short } from '@/lib/demoShared';

export type SectionKey = 'connection' | 'wallets' | 'trade' | 'exit' | 'rules';

interface Props {
  server: DemoServer;
  section: string | null;
  onSection: (s: SectionKey | null) => void;
}

interface ItemProps {
  icon: React.ReactNode;
  title: string;
  summary: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const MenuItem: React.FC<ItemProps> = ({ icon, title, summary, badge, open, onToggle, children }) => (
  <div>
    <button className={`menu-item ${open ? 'open' : ''}`} onClick={onToggle} aria-expanded={open}>
      <span className='menu-icon'>{icon}</span>
      <span className='min-w-0 flex-1'>
        <span className='menu-title block'>{title}</span>
        <span className='menu-sub block'>{summary}</span>
      </span>
      {badge && <span className='chip warn'>{badge}</span>}
      <ChevronRight className={`w-4 h-4 menu-chevron ${open ? 'rot' : ''}`} />
    </button>
    {open && <div className='menu-panel'>{children}</div>}
  </div>
);

export const PaperSettings: React.FC<Props> = ({ server, section, onSection }) => {
  const { apiKey, wallets, form } = useDemoSettings();
  const [showKey, setShowKey] = useState(false);
  const [newAddr, setNewAddr] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [walletError, setWalletError] = useState<string | null>(null);

  const running = !!server.state?.running;
  const v = validateForm(form);
  const applied = server.state?.settings;
  const dirty = running && v.ok && !!v.settings && !!applied && !settingsEqual(v.settings, applied);
  const toggle = (k: SectionKey) => onSection(section === k ? null : k);
  const serverRules = (server.state as unknown as { rules?: { refused?: Record<string, number> } } | null)?.rules;
  const refused = Object.entries(serverRules?.refused ?? {});

  const field = (key: keyof DemoForm, label: string, hint?: string) => (
    <div className='field'>
      <label htmlFor={`f-${key}`}>{label}</label>
      <input
        id={`f-${key}`}
        className={`input ${v.errors[key] ? 'invalid' : ''}`}
        value={form[key]}
        onChange={(e) => setForm({ [key]: e.target.value } as Partial<DemoForm>)}
      />
      {v.errors[key] ? <span className='field-error'>{v.errors[key]}</span> : hint ? <span className='hint'>{hint}</span> : null}
    </div>
  );

  const tick = (key: keyof DemoForm, label: string) => (
    <label className='flex items-center gap-2 text-sm'>
      <input type='checkbox' checked={form[key] === '1'} onChange={(e) => setForm({ [key]: e.target.checked ? '1' : '0' } as Partial<DemoForm>)} />
      {label}
    </label>
  );

  const delayRows = delaysToList(form.delays);
  const rowInvalid = (d: string, i: number) => d === '' || !Number.isInteger(Number(d)) || Number(d) > 60000 || delayRows.indexOf(d) !== i;
  const setDelayAt = (i: number, value: string) => {
    const next = [...delayRows];
    next[i] = value.replace(/[^0-9]/g, '');
    setForm({ delays: listToDelays(next) });
  };
  const addDelay = () => {
    if (delayRows.length < MAX_SCENARIOS) setForm({ delays: listToDelays([...delayRows, nextDelay(delayRows)]) });
  };
  const removeDelay = (i: number) => {
    if (delayRows.length > 1) setForm({ delays: listToDelays(delayRows.filter((_, j) => j !== i)) });
  };

  const handleAdd = () => {
    const address = newAddr.trim();
    const label = newLabel.trim() || short(address);
    const err = addWallet(address, newLabel);
    if (err) {
      setWalletError(err);
      return;
    }
    setWalletError(null);
    if (running) server.send({ type: 'demo_add_wallet', address, label });
    setNewAddr('');
    setNewLabel('');
  };

  const handleRemove = (address: string) => {
    removeWallet(address);
    if (running) server.send({ type: 'demo_remove_wallet', address });
  };

  const handleOnly = (address: string) => {
    onlyWallet(address);
    if (running) {
      const keep = wallets.filter((w) => w.address === address);
      server.send({ type: 'demo_set_wallets', wallets: keep });
    }
  };

  const handleApply = () => {
    if (v.ok && v.settings) server.send({ type: 'demo_update_settings', settings: v.settings });
  };

  const delaysText = v.settings ? v.settings.delaysMs.join(' / ') : form.delays;
  const walletNames = wallets.slice(0, 2).map((w) => w.label).join(', ');
  const extraRules =
    [form.maxImpactPct, form.minMcapSol, form.maxMcapSol, form.minAgeSec, form.maxAgeSec, form.minBuyVsUsual, form.maxOpenOps, form.minWalletsOnToken, form.dailyLossLimitSol, form.mintCooldownMin].filter(
      (x) => Number(x) > 0
    ).length +
    (form.allowCurve === '0' ? 1 : 0) +
    (form.allowPumpswap === '0' ? 1 : 0);

  let footText = 'Saved in this browser. Used when you press Start simulation.';
  let footClass = 'text-slate-400';
  if (!v.ok) {
    footText = 'Fix the highlighted fields.';
    footClass = 'text-rose-400';
  } else if (dirty) {
    footText = 'Saved here, but not applied to the running simulation yet.';
    footClass = 'text-amber-300';
  } else if (running) {
    footText = 'Applied to the running simulation.';
    footClass = 'text-emerald-400';
  }

  return (
    <>
      <div className='drawer-body'>
        <div className='menu-group-title'>Paper trading</div>

        <MenuItem
          icon={<Key className='w-4 h-4' />}
          title='Connection'
          summary={apiKey.trim().length >= 8 ? `Helius key saved (ends with ${apiKey.trim().slice(-4)})` : 'Helius API key needed'}
          badge={apiKey.trim().length >= 8 ? undefined : 'Required'}
          open={section === 'connection'}
          onToggle={() => toggle('connection')}
        >
          <div className='field'>
            <label htmlFor='f-helius'>Helius API key</label>
            <div className='flex gap-2'>
              <input
                id='f-helius'
                type={showKey ? 'text' : 'password'}
                className='input'
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder='Paste your Helius key here'
              />
              <button className='icon-btn' title={showKey ? 'Hide the key' : 'Show the key'} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff className='w-4 h-4' /> : <Eye className='w-4 h-4' />}
              </button>
            </div>
            <span className='hint'>
              Free key from{' '}
              <a className='link' href='https://www.helius.dev' target='_blank' rel='noopener noreferrer'>
                helius.dev
              </a>
              . Stored only in this browser, never sent anywhere except to Helius through your local server.
            </span>
          </div>
        </MenuItem>

        <MenuItem
          icon={<Wallet className='w-4 h-4' />}
          title='Wallets followed'
          summary={wallets.length ? `${wallets.length} wallet(s): ${walletNames}` : 'No wallet yet'}
          badge={wallets.length ? undefined : 'Required'}
          open={section === 'wallets'}
          onToggle={() => toggle('wallets')}
        >
          <ul>
            {wallets.map((w) => (
              <li key={w.address} className='wallet-row'>
                <div className='avatar'>{w.label.slice(0, 2).toUpperCase()}</div>
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-medium text-sm'>{w.label}</div>
                  <a className='link text-xs' href={`https://pump.fun/profile/${w.address}`} target='_blank' rel='noopener noreferrer'>
                    {short(w.address)}
                  </a>
                </div>
                <div className='flex gap-1.5'>
                  <button className='icon-btn' title='Follow only this one' onClick={() => handleOnly(w.address)}>
                    <Target className='w-4 h-4' />
                  </button>
                  <button className='icon-btn danger' title='Remove' onClick={() => handleRemove(w.address)}>
                    <Trash2 className='w-4 h-4' />
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {wallets.length === 0 && <div className='empty'>No wallets. Add an address below.</div>}
          <div className='space-y-2'>
            <input className='input' value={newAddr} onChange={(e) => setNewAddr(e.target.value)} placeholder='Address of the wallet to follow' />
            <div className='flex gap-2'>
              <input className='input' value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder='Name (optional)' />
              <button className='btn btn-primary' onClick={handleAdd}>
                <Plus className='w-4 h-4' />
                Add
              </button>
            </div>
            {walletError && <span className='field-error'>{walletError}</span>}
            <span className='hint block'>Wallet changes apply immediately while the simulation runs. Always verify an address on Solscan: impersonators exist.</span>
          </div>
        </MenuItem>

        <MenuItem
          icon={<SlidersHorizontal className='w-4 h-4' />}
          title='Trade size and timing'
          summary={`${form.buySol} SOL per trade, ${delayRows.length} scenario${delayRows.length === 1 ? '' : 's'} (${delaysText} ms), fee ${form.feePct} %`}
          open={section === 'trade'}
          onToggle={() => toggle('trade')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {field('buySol', 'Amount per trade (SOL)', 'Simulated size of each copy.')}
            {field('timeoutMin', 'Max hold (minutes)', 'Exit if the wallet has not sold by then.')}
            <div className='col-span-2'>
              <div className='field'>
                <label>Scenarios: delays tested at the same time</label>
                <div className='space-y-2'>
                  {delayRows.map((d, i) => (
                    <div key={i} className='flex items-center gap-2'>
                      <span className='text-xs text-slate-400' style={{ width: 72 }}>
                        Scenario {i + 1}
                      </span>
                      <input
                        className={`input ${rowInvalid(d, i) ? 'invalid' : ''}`}
                        inputMode='numeric'
                        aria-label={`Delay of scenario ${i + 1} in milliseconds`}
                        value={d}
                        onChange={(e) => setDelayAt(i, e.target.value)}
                      />
                      <span className='text-xs text-slate-400'>ms</span>
                      <button className='icon-btn danger' title='Remove this scenario' disabled={delayRows.length <= 1} onClick={() => removeDelay(i)}>
                        <Trash2 className='w-4 h-4' />
                      </button>
                    </div>
                  ))}
                </div>
                <div className='flex items-center gap-2 mt-2'>
                  <button className='btn btn-ghost' disabled={delayRows.length >= MAX_SCENARIOS} onClick={addDelay}>
                    <Plus className='w-4 h-4' />
                    Add scenario
                  </button>
                  <span className='hint'>
                    {delayRows.length} of {MAX_SCENARIOS} scenarios
                  </span>
                </div>
                {v.errors.delays ? (
                  <span className='field-error'>{v.errors.delays}</span>
                ) : (
                  <span className='hint'>
                    Each scenario is a time between detecting the trade and your simulated entry (0 to 60000 ms, all different). Operations already open keep their original scenarios.
                  </span>
                )}
              </div>
            </div>
            {field('feePct', 'Pump.fun fee (%)', '1.25 is the standard fee on the curve.')}
            {field('costPerTxSol', 'Cost per transaction (SOL)', 'Network fee plus tip for each buy or sell.')}
          </div>
        </MenuItem>

        <MenuItem
          icon={<TrendingUp className='w-4 h-4' />}
          title='Exit mode'
          summary={form.takeProfitMode === '1' ? `Take profit at +${form.takeProfitPct} %, or when the wallet sells first` : 'Sell when the wallet sells'}
          open={section === 'exit'}
          onToggle={() => toggle('exit')}
        >
          <div className='space-y-3'>
            {tick('takeProfitMode', 'Take profit mode')}
            <div className='grid grid-cols-2 gap-3'>
              {field('takeProfitPct', 'Take profit (% net PnL)', 'Net of fees. Checked every 0.5 s, then the scenario delay is added before the sale.')}
            </div>
            <span className='hint block'>
              Unchecked: current mode, you sell when the wallet sells. Checked: you sell as soon as your simulated PnL reaches the take profit, and if the wallet sells before that you sell with it. There is no stop-loss:
              Max hold still applies. Applies to new and open positions.
            </span>
          </div>
        </MenuItem>

        <MenuItem
          icon={<Filter className='w-4 h-4' />}
          title='Entry rules'
          summary={`Max premium ${form.maxPremium === '0' ? 'off' : `${form.maxPremium} %`}, min wallet buy ${form.minBuy === '0' ? 'off' : `${form.minBuy} SOL`}${extraRules ? `, ${extraRules} more rule(s) on` : ''}`}
          open={section === 'rules'}
          onToggle={() => toggle('rules')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {field('maxPremium', 'Max entry premium (%)', '0 = off. Skip entries that cost more than this over the wallet fill.')}
            {field('minBuy', 'Min wallet buy (SOL)', '0 = off. Ignore smaller buys from the wallet.')}
            {field('maxImpactPct', 'Max his buy vs pool (%)', '0 = off. Skip if his buy is more than this share of the pool SOL.')}
            {field('minBuyVsUsual', 'Min buy vs his usual (x)', '0 = off. His buy must be at least X times the median of his last 30 buys (needs 5 buys).')}
            {field('minMcapSol', 'Min market cap (SOL)', '0 = off. Market cap at your entry.')}
            {field('maxMcapSol', 'Max market cap (SOL)', '0 = off. Market cap at your entry.')}
            {field('minAgeSec', 'Min token age (s)', '0 = off. A token with an unknown age passes.')}
            {field('maxAgeSec', 'Max token age (s)', '0 = off. A token with an unknown age passes.')}
            {field('mintCooldownMin', 'One buy per token (min)', '0 = off. After a copied buy, ignore the other buys of the same token by this wallet for X minutes.')}
            {field('maxOpenOps', 'Max open operations', '0 = off. Skip new entries while this many operations are open.')}
            {field('minWalletsOnToken', 'Min wallets on same token', '0 or 1 = off. Needs N followed wallets buying the same token inside the window below.')}
            {field('confluenceWindowSec', 'Confluence window (s)', 'Used only with the rule on the left.')}
            {field('dailyLossLimitSol', 'Daily loss limit (SOL)', '0 = off. Stop new entries when the last 24 h (slowest scenario) lose more than this.')}
          </div>
          <div className='space-y-2 mt-3'>
            {tick('allowCurve', 'Follow buys on the bonding curve')}
            {tick('allowPumpswap', 'Follow buys on PumpSwap')}
          </div>
          <span className='hint block mt-2'>
            Rules apply to new trades only. Leave everything at 0 for the first run to see the unfiltered results. A rule that needs a value the bot does not have yet lets the trade through.
          </span>
          {refused.length > 0 && <span className='hint block mt-2'>Refused so far (per delay row): {refused.map(([k, n]) => `${k} ${n}`).join(', ')}.</span>}
        </MenuItem>
      </div>

      <div className='drawer-foot'>
        <div className={`text-xs ${footClass}`} style={{ maxWidth: 230 }}>
          {footText}
        </div>
        <div className='flex gap-2'>
          <button className='btn btn-ghost' onClick={resetForm} title='Restore the default trade settings and rules (keeps your key and wallets)'>
            Defaults
          </button>
          <button className='btn btn-primary' disabled={!running || !v.ok || !dirty} onClick={handleApply}>
            Apply now
          </button>
        </div>
      </div>
    </>
  );
};
