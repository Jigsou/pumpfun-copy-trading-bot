import React, { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import '@/settings.css';
import { useDemoServer, useDemoSettings } from '@/hooks/useDemo';
import { settingsEqual, validateForm } from '@/lib/demoStore';
import { checkConfig } from '@/lib/realConfig';
import type { BotConfig } from '@/types/trading';
import { PaperSettings } from './PaperSettings';
import type { SectionKey } from './PaperSettings';
import { RealSettings } from './RealSettings';
import type { RealSection } from '@/lib/realConfig';

interface Props {
  mode: 'paper' | 'real';
  realConfig: BotConfig;
  onRealConfigChange: (c: BotConfig) => void;
}

export const SettingsMenu: React.FC<Props> = ({ mode, realConfig, onRealConfigChange }) => {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const settings = useDemoSettings();
  const server = useDemoServer();

  const v = validateForm(settings.form);
  const applied = server.state?.settings;
  const paperDirty = mode === 'paper' && !!server.state?.running && v.ok && !!v.settings && !!applied && !settingsEqual(v.settings, applied);
  const realIncomplete = mode === 'real' && !checkConfig(realConfig).ok;

  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = (e as CustomEvent).detail?.section as string | null | undefined;
      setSection(wanted ?? null);
      setOpen(true);
    };
    window.addEventListener('open-settings', onOpen);
    return () => window.removeEventListener('open-settings', onOpen);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const openMenu = () => {
    setSection(mode === 'paper' ? 'connection' : 'keys');
    setOpen(true);
  };

  return (
    <>
      <button className='btn btn-ghost relative' onClick={openMenu} title='Open the options menu'>
        <Settings className='w-4 h-4' />
        Options
        {(paperDirty || realIncomplete) && (
          <span className='dot-badge' title={paperDirty ? 'Changes not applied to the running simulation yet' : 'The real bot configuration is incomplete'} />
        )}
      </button>
      {open && (
        <div className='drawer-root'>
          <button className='drawer-backdrop' aria-label='Close options' onClick={() => setOpen(false)} />
          <aside className='drawer' role='dialog' aria-label='Options'>
            <div className='drawer-head'>
              <div>
                <div className='drawer-title'>Options</div>
                <div className='drawer-sub'>
                  {mode === 'paper' ? 'Paper trading (no money, no private key)' : 'Real trading (signs real transactions)'}
                </div>
              </div>
              <button className='icon-btn' onClick={() => setOpen(false)} title='Close (Esc)'>
                <X className='w-4 h-4' />
              </button>
            </div>
            {mode === 'paper' ? (
              <PaperSettings server={server} section={section} onSection={(s: SectionKey | null) => setSection(s)} />
            ) : (
              <RealSettings config={realConfig} onChange={onRealConfigChange} section={section} onSection={(s: RealSection | null) => setSection(s)} />
            )}
          </aside>
        </div>
      )}
    </>
  );
};
