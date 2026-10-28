import React, { useState } from 'react';
import { ChevronRight, Eye, EyeOff, Filter, Key, Plus, SlidersHorizontal, Target, Trash2, Wallet } from 'lucide-react';
import { useDemoSettings } from '@/hooks/useDemo';
import type { DemoServer } from '@/hooks/useDemo';
import { addWallet, onlyWallet, removeWallet, resetForm, setApiKey, setForm, settingsEqual, validateForm } from '@/lib/demoStore';
import type { DemoForm } from '@/lib/demoStore';
import { short } from '@/lib/demoShared';

export type SectionKey = 'connection' | 'wallets' | 'trade' | 'rules';

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
          summary={`${form.buySol} SOL per trade, delays ${delaysText} ms, fee ${form.feePct} %`}
          open={section === 'trade'}
          onToggle={() => toggle('trade')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {field('buySol', 'Amount per trade (SOL)', 'Simulated size of each copy.')}
            {field('timeoutMin', 'Max hold (minutes)', 'Exit if the wallet has not sold by then.')}
            <div className='col-span-2'>{field('delays', 'Delays tested at the same time (ms)', 'Example: 300,1000,3000. Time between detecting the trade and your entry.')}</div>
            {field('feePct', 'Pump.fun fee (%)', '1.25 is the standard fee on the curve.')}
            {field('costPerTxSol', 'Cost per transaction (SOL)', 'Network fee plus tip for each buy or sell.')}
          </div>
        </MenuItem>

        <MenuItem
          icon={<Filter className='w-4 h-4' />}
          title='Entry rules'
          summary={`Max premium ${form.maxPremium === '0' ? 'off' : `${form.maxPremium} %`}, min wallet buy ${form.minBuy === '0' ? 'off' : `${form.minBuy} SOL`}`}
          open={section === 'rules'}
          onToggle={() => toggle('rules')}
        >
          <div className='grid grid-cols-2 gap-3'>
            {field('maxPremium', 'Max entry premium (%)', '0 = off. Skip entries that cost more than this over the wallet fill.')}
            {field('minBuy', 'Min wallet buy (SOL)', '0 = off. Ignore smaller buys from the wallet.')}
          </div>
          <span className='hint'>Rules apply to new trades only. Leave both at 0 for the first run to see the unfiltered results.</span>
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
