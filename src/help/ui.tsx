import React, { useState } from 'react';
import { AlertTriangle, Check, Copy, Info, Lightbulb, ShieldAlert } from 'lucide-react';

export interface HelpSection {
  id: string;
  title: string;
  icon: React.ReactNode;
  body: React.ReactNode;
}

type Kind = 'tip' | 'warn' | 'danger' | 'note';

const CALLOUT_ICON: Record<Kind, React.ReactNode> = {
  tip: <Lightbulb className='w-4 h-4' />,
  warn: <AlertTriangle className='w-4 h-4' />,
  danger: <ShieldAlert className='w-4 h-4' />,
  note: <Info className='w-4 h-4' />,
};

export const Callout: React.FC<{ kind?: Kind; title?: string; children: React.ReactNode }> = ({ kind = 'note', title, children }) => (
  <div className={`hp-callout ${kind}`}>
    {CALLOUT_ICON[kind]}
    <div>
      {title && <strong>{title}</strong>}
      {children}
    </div>
  </div>
);

export const Steps: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className='hp-steps'>{children}</div>;

export const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className='hp-step'>
    <div className='hp-step-n'>{n}</div>
    <div>
      <h4>{title}</h4>
      <div className='hp-step-body'>{children}</div>
    </div>
  </div>
);

export const Cards: React.FC<{ children: React.ReactNode }> = ({ children }) => <div className='hp-cards'>{children}</div>;

export const Card: React.FC<{ icon: React.ReactNode; title: string; children: React.ReactNode }> = ({ icon, title, children }) => (
  <div className='hp-card'>
    <div className='hp-card-icon'>{icon}</div>
    <h4>{title}</h4>
    <p>{children}</p>
  </div>
);

export const Table: React.FC<{ head: string[]; rows: React.ReactNode[][] }> = ({ head, rows }) => (
  <div className='hp-table-wrap'>
    <table className='hp-table'>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => <span className='hp-kbd'>{children}</span>;

export const Badge: React.FC<{ n: number }> = ({ n }) => <span className='hp-badge'>{n}</span>;

export const CodeBlock: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // clipboard blocked
    }
  };
  return (
    <div className='hp-code'>
      <code>{text}</code>
      <button className='icon-btn' onClick={copy} title='Copy'>
        {copied ? <Check className='w-4 h-4' /> : <Copy className='w-4 h-4' />}
      </button>
    </div>
  );
};

export const Ext: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <a className='hp-link' href={href} target='_blank' rel='noopener noreferrer'>
    {children}
  </a>
);
