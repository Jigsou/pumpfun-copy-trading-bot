import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Search, X } from 'lucide-react';
import '@/modern.css';
import '@/help.css';
import { HELP_SECTIONS } from '@/help/content';
import { Kbd } from '@/help/ui';

const Help: React.FC = () => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(HELP_SECTIONS[0]?.id ?? '');
  const [hits, setHits] = useState<Record<string, boolean>>({});
  const mainRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = 'Help - Pumpfun Copy Trading Bot';
  }, []);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const next: Record<string, boolean> = {};
    mainRef.current?.querySelectorAll<HTMLElement>('[data-hp-section]').forEach((el) => {
      const hit = !q || (el.textContent ?? '').toLowerCase().includes(q);
      el.hidden = !hit;
      next[el.id] = hit;
    });
    setHits(next);
  }, [query]);

  useEffect(() => {
    const els = Array.from(mainRef.current?.querySelectorAll<HTMLElement>('[data-hp-section]') ?? []);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px' }
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA');
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
        searchRef.current?.blur();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const noMatch = query.trim() !== '' && Object.values(hits).length > 0 && Object.values(hits).every((v) => !v);

  return (
    <div className='modern hp-root'>
      <header className='hp-top'>
        <div className='hp-top-inner'>
          <a className='hp-brand' href='/'>
            <span className='hp-brand-icon'>
              <BookOpen className='w-4 h-4' />
            </span>
            Help center
          </a>
          <div className='hp-search'>
            <Search className='w-4 h-4' />
            <input ref={searchRef} className='input' placeholder='Search the help' value={query} onChange={(e) => setQuery(e.target.value)} aria-label='Search the help' />
            {query ? (
              <button className='icon-btn' style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 24, height: 24 }} onClick={() => setQuery('')} title='Clear'>
                <X className='w-4 h-4' />
              </button>
            ) : (
              <Kbd>/</Kbd>
            )}
          </div>
          <a className='btn btn-ghost' href='/'>
            <ArrowLeft className='w-4 h-4' />
            Back to the app
          </a>
        </div>
      </header>

      <div className='hp-layout'>
        <aside className='hp-side'>
          <nav className='hp-toc' aria-label='Sections'>
            <div className='hp-toc-title'>On this page</div>
            {HELP_SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className={`${active === s.id ? 'active' : ''} ${hits[s.id] === false ? 'dim' : ''}`}>
                {s.icon}
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <main className='hp-main' ref={mainRef}>
          <div className='hp-hero'>
            <h1>Help center</h1>
            <p>
              Everything you need to test a Pump.fun copy-trading idea safely: how to start, how to read the results, what every option does, and what to do when something looks wrong.
            </p>
            <div className='hp-chips'>
              {HELP_SECTIONS.slice(0, 6).map((s) => (
                <a key={s.id} href={`#${s.id}`}>
                  {s.title}
                </a>
              ))}
            </div>
          </div>

          {HELP_SECTIONS.map((s) => (
            <section key={s.id} id={s.id} data-hp-section className='hp-section'>
              <header className='hp-section-head'>
                <span className='hp-section-icon'>{s.icon}</span>
                <h2>{s.title}</h2>
              </header>
              <div className='hp-section-body'>{s.body}</div>
            </section>
          ))}

          {noMatch && <div className='hp-empty'>No section matches your search. Try a shorter word such as delay, fee, key or update.</div>}
        </main>
      </div>
    </div>
  );
};

export default Help;
