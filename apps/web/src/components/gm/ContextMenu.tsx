'use client';

import { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  mapX: number;
  mapY: number;
  boxId: string | null;
  boxName: string | null;
  boxRevealed: boolean;
  tokenId: string | null;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onAction: (action: string) => void;
  onClose: () => void;
}

export default function ContextMenu({ state, onAction, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (state.open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [state.open, handleClickOutside]);

  if (!state.open) return null;

  const hasBox = !!state.boxId;
  const hasToken = !!state.tokenId;

  const left = Math.min(state.x, (typeof window !== 'undefined' ? window.innerWidth : 800) - 190);
  const top = Math.min(state.y, (typeof window !== 'undefined' ? window.innerHeight : 600) - 300);

  const fire = (action: string) => {
    onAction(action);
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-[900] min-w-[170px] rounded-[5px] p-1 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
      style={{
        left,
        top,
        background: 'var(--panel2)',
        border: '1px solid var(--borderh)',
      }}
    >
      {/* Label */}
      <div
        className="px-2 pt-[3px] pb-[1px] uppercase tracking-[0.1em]"
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '0.5rem',
          color: 'var(--dim)',
        }}
      >
        {hasBox ? `Box: ${state.boxName}` : 'Canvas'}
      </div>

      {/* Reveal here */}
      <CtxItem icon="reveal" label="Reveal here" shortcut="R" onClick={() => fire('reveal')} />
      <CtxItem icon="hide" label="Hide here" shortcut="H" onClick={() => fire('hide')} />

      <div className="mx-0 my-[3px] h-px" style={{ background: 'var(--border)' }} />

      <CtxItem icon="ping" label="Ping location" shortcut="P" onClick={() => fire('ping')} />
      <CtxItem icon="torch" label="Place torch" onClick={() => fire('torch')} />

      {/* Box actions */}
      {hasBox && (
        <>
          <div className="mx-0 my-[3px] h-px" style={{ background: 'var(--border)' }} />
          <div
            className="px-2 pt-[3px] pb-[1px] uppercase tracking-[0.1em]"
            style={{ fontFamily: "'Cinzel', serif", fontSize: '0.5rem', color: 'var(--dim)' }}
          >
            Box
          </div>
          {!state.boxRevealed && (
            <CtxItem icon="reveal" label="Reveal room" onClick={() => fire('revealBox')} />
          )}
          {state.boxRevealed && (
            <CtxItem icon="hide" label="Hide room" onClick={() => fire('hideBox')} />
          )}
          <CtxItem icon="edit" label="Edit box…" onClick={() => fire('editBox')} />
          <CtxItem icon="delete" label="Delete box" red onClick={() => fire('deleteBox')} />
        </>
      )}

      {/* Token actions */}
      {hasToken && (
        <>
          <div className="mx-0 my-[3px] h-px" style={{ background: 'var(--border)' }} />
          <CtxItem icon="delete" label="Remove token" red onClick={() => fire('deleteToken')} />
        </>
      )}
    </div>
  );
}

/* ── SVG icons ────────────────────────────────── */

const icons: Record<string, React.ReactNode> = {
  reveal: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <circle cx="12" cy="12" r="4" />
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
    </svg>
  ),
  hide: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ),
  ping: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ),
  torch: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0" />
    </svg>
  ),
  edit: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  ),
  delete: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-[13px] w-[13px] opacity-70">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14H6L5 6" />
    </svg>
  ),
};

function CtxItem({
  icon,
  label,
  shortcut,
  red,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  red?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded-[3px] px-[10px] py-[5px] text-[0.78rem] transition-all duration-[120ms] ${
        red
          ? 'hover:text-[var(--ember)] hover:bg-[rgba(224,92,42,0.1)]'
          : 'hover:text-[var(--gold)] hover:bg-[rgba(200,150,62,0.1)]'
      }`}
      style={{ color: 'var(--text)' }}
      onClick={onClick}
    >
      {icons[icon]}
      {label}
      {shortcut && (
        <span
          className="ml-auto tracking-[0.04em]"
          style={{ fontFamily: "'Cinzel', serif", fontSize: '0.48rem', color: 'var(--dim)' }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}
