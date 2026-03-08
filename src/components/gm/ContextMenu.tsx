'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { Box, MapObject } from '@/types';

export interface ContextMenuState {
  open: boolean;
  x: number;
  y: number;
  mapX: number;
  mapY: number;
  box: Box | null;
  token: null;
  object: MapObject | null;
}

interface ContextMenuProps {
  state: ContextMenuState;
  onClose: () => void;
  onAction: (action: string) => void;
}

export default function ContextMenu({ state, onClose, onAction }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (state.open) {
      document.addEventListener('mousedown', handleClickOutside);
      const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [state.open, handleClickOutside, onClose]);

  if (!state.open) return null;

  const left = Math.min(state.x, window.innerWidth - 200);
  const top = Math.min(state.y, window.innerHeight - 380);
  const hasBox = !!state.box;
  const hasObject = !!state.object;

  return (
    <div
      ref={ref}
      className="fixed z-[900] min-w-[170px] rounded-[5px] p-1 shadow-[0_8px_32px_rgba(0,0,0,.6)]"
      style={{
        left,
        top,
        background: '#0c0b13',
        border: '1px solid rgba(200,150,62,.45)',
      }}
    >
      {hasObject ? (
        <>
          <div
            className="px-2 pt-1 pb-0.5 text-[.5rem] uppercase tracking-[.1em]"
            style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
          >
            Object: {state.object!.name}
          </div>

          <CxItem icon="copy" label="Duplicate" shortcut="Ctrl+D" onClick={() => onAction('duplicateObject')} />
          <CxItem icon="edit" label="Rename" onClick={() => onAction('renameObject')} />
          <CxItem icon="ping" label="Ping location" shortcut="P" onClick={() => onAction('ping')} />

          <div className="my-1 h-px" style={{ background: 'rgba(200,150,62,.2)' }} />

          <CxItem icon="arrowUp" label="Bring to Front" onClick={() => onAction('bringToFront')} />
          <CxItem icon="arrowDown" label="Send to Back" onClick={() => onAction('sendToBack')} />
          <CxItem icon="arrowUp" label="Move Up" onClick={() => onAction('moveObjectUp')} />
          <CxItem icon="arrowDown" label="Move Down" onClick={() => onAction('moveObjectDown')} />

          <div className="my-1 h-px" style={{ background: 'rgba(200,150,62,.2)' }} />

          <CxItem
            icon={state.object!.locked ? 'unlock' : 'lock'}
            label={state.object!.locked ? 'Unlock' : 'Lock'}
            onClick={() => onAction('toggleLock')}
          />
          <CxItem
            icon="eye"
            label="Visible to GM"
            checked={state.object!.visible}
            onClick={() => onAction('toggleGmVisible')}
          />
          <CxItem
            icon="eye"
            label="Visible to Players"
            checked={state.object!.playerVisible}
            onClick={() => onAction('togglePlayerVisible')}
          />

          <div className="my-1 h-px" style={{ background: 'rgba(200,150,62,.2)' }} />

          <CxItem icon="delete" label="Delete" red onClick={() => onAction('deleteObject')} />
        </>
      ) : (
        <>
          <div
            className="px-2 pt-1 pb-0.5 text-[.5rem] uppercase tracking-[.1em]"
            style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
          >
            {hasBox ? `Box: ${state.box!.name}` : 'Canvas'}
          </div>

          <CxItem icon="eye" label="Reveal here" shortcut="R" onClick={() => onAction('reveal')} />
          <CxItem icon="eyeOff" label="Hide here" shortcut="H" onClick={() => onAction('hide')} />

          <div className="my-1 h-px" style={{ background: 'rgba(200,150,62,.2)' }} />

          <CxItem icon="ping" label="Ping location" shortcut="P" onClick={() => onAction('ping')} />

          {hasBox && (
            <>
              <div className="my-1 h-px" style={{ background: 'rgba(200,150,62,.2)' }} />
              <div
                className="px-2 pt-1 pb-0.5 text-[.5rem] uppercase tracking-[.1em]"
                style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
              >
                Box
              </div>
              {!state.box!.revealed && (
                <CxItem icon="eye" label="Reveal room" onClick={() => onAction('revealBox')} />
              )}
              {state.box!.revealed && (
                <CxItem icon="eyeOff" label="Hide room" onClick={() => onAction('hideBox')} />
              )}
              <CxItem icon="edit" label="Edit box…" onClick={() => onAction('editBox')} />
              <CxItem icon="delete" label="Delete box" red onClick={() => onAction('deleteBox')} />
            </>
          )}
        </>
      )}
    </div>
  );
}

function CxItem({
  icon,
  label,
  shortcut,
  red,
  checked,
  onClick,
}: {
  icon: string;
  label: string;
  shortcut?: string;
  red?: boolean;
  checked?: boolean;
  onClick: () => void;
}) {
  return (
    <div
      className={`flex cursor-pointer items-center gap-2 rounded px-2.5 py-1.5 text-[.78rem] transition-all ${
        red ? 'hover:text-[#e05c2a]' : 'hover:text-[#c8963e]'
      }`}
      style={{
        color: '#d4c4a0',
        background: 'transparent',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = red
          ? 'rgba(224,92,42,.1)'
          : 'rgba(200,150,62,.1)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'transparent';
      }}
      onClick={onClick}
    >
      <CxIcon type={icon} />
      {checked !== undefined && (
        <span style={{ color: checked ? '#c8963e' : 'rgba(212,196,160,.3)', fontSize: '.7rem' }}>
          {checked ? '✓' : '○'}
        </span>
      )}
      {label}
      {shortcut && (
        <span
          className="ml-auto text-[.48rem] tracking-[.04em]"
          style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
        >
          {shortcut}
        </span>
      )}
    </div>
  );
}

function CxIcon({ type }: { type: string }) {
  const cls = 'w-[13px] h-[13px] opacity-70';
  const props = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, className: cls };

  switch (type) {
    case 'eye':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
        </svg>
      );
    case 'eyeOff':
      return (
        <svg {...props}>
          <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      );
    case 'ping':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'edit':
      return (
        <svg {...props}>
          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      );
    case 'delete':
      return (
        <svg {...props}>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
        </svg>
      );
    case 'copy':
      return (
        <svg {...props}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      );
    case 'arrowUp':
      return (
        <svg {...props}>
          <line x1="12" y1="19" x2="12" y2="5" />
          <polyline points="5 12 12 5 19 12" />
        </svg>
      );
    case 'arrowDown':
      return (
        <svg {...props}>
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...props}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0110 0v4" />
        </svg>
      );
    case 'unlock':
      return (
        <svg {...props}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 019.9-1" />
        </svg>
      );
    default:
      return null;
  }
}
