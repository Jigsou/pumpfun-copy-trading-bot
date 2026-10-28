import React, { useEffect, useState } from 'react';
import { Settings, X } from 'lucide-react';
import '@/settings.css';
import { useDemoServer, useDemoSettings } from '@/hooks/useDemo';
import { settingsEqual, validateForm } from '@/lib/demoStore';
import { PaperSettings } from './PaperSettings';
import type { SectionKey } from './PaperSettings';

export const SettingsMenu: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionKey | null>('connection');
  const settings = useDemoSettings();
  const server = useDemoServer();

  const v = validateForm(settings.form);
  const applied = server.state?.settings;
  const dirty = !!server.state?.running && v.ok && !!v.settings && !!applied && !settingsEqual(v.settings, applied);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const wanted = (e as CustomEvent).detail?.section as SectionKey | null | undefined;
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

  return (
    <>
      <button className='btn btn-ghost relative' onClick={() => setOpen(true)} title='Open the options menu'>
        <Settings className='w-4 h-4' />
        Options
        {dirty && <span className='dot-badge' title='Changes not applied to the running simulation yet' />}
      </button>
      {open && (
        <div className='drawer-root'>
          <button className='drawer-backdrop' aria-label='Close options' onClick={() => setOpen(false)} />
          <aside className='drawer' role='dialog' aria-label='Options'>
            <div className='drawer-head'>
              <div>
                <div className='drawer-title'>Options</div>
                <div className='drawer-sub'>Paper trading (no money, no private key)</div>
              </div>
              <button className='icon-btn' onClick={() => setOpen(false)} title='Close (Esc)'>
                <X className='w-4 h-4' />
              </button>
            </div>
            <PaperSettings server={server} section={section} onSection={setSection} />
          </aside>
        </div>
      )}
    </>
  );
};
