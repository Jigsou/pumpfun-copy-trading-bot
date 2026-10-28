import React from 'react';
import { ChevronRight } from 'lucide-react';

interface Props {
  icon: React.ReactNode;
  title: string;
  summary: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export const MenuItem: React.FC<Props> = ({ icon, title, summary, badge, open, onToggle, children }) => (
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
