'use client';

import type { ToolType } from './GMCanvas';

interface ToolbarProps {
  activeTool: ToolType;
  brushSize: number;
  showGrid: boolean;
  onSetTool: (tool: ToolType) => void;
  onSetBrush: (size: number) => void;
  onToggleGrid: () => void;
  onResetFog: () => void;
}

const BRUSH_SIZES = [
  { size: 15, px: 6 },
  { size: 36, px: 11 },
  { size: 70, px: 17 },
  { size: 130, px: 24 },
];

export default function Toolbar({
  activeTool,
  brushSize,
  showGrid,
  onSetTool,
  onSetBrush,
  onToggleGrid,
  onResetFog,
}: ToolbarProps) {
  return (
    <div
      className="flex w-[54px] flex-shrink-0 flex-col items-center gap-[1px] py-[6px]"
      style={{
        background: 'var(--panel)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* Fog group */}
      <ToolGroup label="Fog">
        <ToolButton
          active={activeTool === 'reveal'}
          shortcut="R"
          label="Reveal"
          onClick={() => onSetTool('reveal')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="4" />
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
            </svg>
          }
        />
        <ToolButton
          active={activeTool === 'hide'}
          shortcut="H"
          label="Hide"
          onClick={() => onSetTool('hide')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          }
        />
        <ToolButton
          label="Reset"
          onClick={onResetFog}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          }
        />
      </ToolGroup>

      {/* Size group */}
      <ToolGroup label="Size">
        <div className="flex flex-col items-center gap-1">
          {BRUSH_SIZES.map((b) => (
            <div
              key={b.size}
              className="cursor-pointer rounded-full transition-all duration-150"
              style={{
                width: b.px,
                height: b.px,
                background: brushSize === b.size ? 'var(--gold)' : 'var(--text)',
                opacity: brushSize === b.size ? 1 : 0.3,
                border: brushSize === b.size ? '1.5px solid var(--gold)' : '1.5px solid transparent',
                flexShrink: 0,
              }}
              onClick={() => onSetBrush(b.size)}
            />
          ))}
        </div>
      </ToolGroup>

      {/* Boxes group */}
      <ToolGroup label="Boxes">
        <ToolButton
          active={activeTool === 'box'}
          shortcut="B"
          label="Draw"
          onClick={() => onSetTool('box')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="1" />
              <line x1="3" y1="9" x2="21" y2="9" />
            </svg>
          }
        />
        <ToolButton
          active={activeTool === 'select'}
          shortcut="S"
          label="Select"
          onClick={() => onSetTool('select')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l7 19 3-7 7-3L3 3z" />
            </svg>
          }
        />
      </ToolGroup>

      {/* Place group */}
      <ToolGroup label="Place">
        <ToolButton
          active={activeTool === 'token'}
          shortcut="T"
          label="Token"
          onClick={() => onSetTool('token')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="8" r="4" />
              <path d="M6 20v-2a6 6 0 0112 0v2" />
            </svg>
          }
        />
        <ToolButton
          active={activeTool === 'torch'}
          label="Torch"
          onClick={() => onSetTool('torch')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8.5 14.5A2.5 2.5 0 0011 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 11-14 0" />
            </svg>
          }
        />
        <ToolButton
          active={activeTool === 'ping'}
          shortcut="P"
          label="Ping"
          onClick={() => onSetTool('ping')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        />
      </ToolGroup>

      {/* View group */}
      <ToolGroup label="View" noBorder>
        <ToolButton
          active={activeTool === 'measure'}
          shortcut="M"
          label="Ruler"
          onClick={() => onSetTool('measure')}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4" />
            </svg>
          }
        />
        <ToolButton
          active={showGrid}
          shortcut="G"
          label="Grid"
          onClick={onToggleGrid}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          }
        />
      </ToolGroup>
    </div>
  );
}

function ToolGroup({ label, children, noBorder }: { label: string; children: React.ReactNode; noBorder?: boolean }) {
  return (
    <div
      className="flex w-full flex-col items-center gap-[2px] py-[5px]"
      style={{ borderBottom: noBorder ? 'none' : '1px solid var(--border)' }}
    >
      <div
        className="uppercase tracking-[0.1em]"
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '0.37rem',
          color: 'var(--dim)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function ToolButton({
  active,
  shortcut,
  label,
  icon,
  onClick,
}: {
  active?: boolean;
  shortcut?: string;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`relative flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-[1px] rounded border transition-all duration-150 ${
        active
          ? 'border-[var(--gold)] bg-[rgba(200,150,62,0.15)] text-[var(--gold)]'
          : 'border-transparent bg-transparent hover:border-[var(--border)] hover:bg-[rgba(200,150,62,0.08)]'
      }`}
      style={{ color: active ? 'var(--gold)' : 'var(--text)' }}
      onClick={onClick}
    >
      <div className="h-4 w-4">{icon}</div>
      <span
        className="opacity-65"
        style={{ fontSize: '0.35rem', fontFamily: "'Cinzel', serif", letterSpacing: '0.04em' }}
      >
        {label}
      </span>
      {shortcut && (
        <span
          className="absolute right-[3px] top-[2px]"
          style={{
            fontSize: '0.35rem',
            color: 'var(--dim)',
            fontFamily: "'Cinzel', serif",
          }}
        >
          {shortcut}
        </span>
      )}
    </button>
  );
}
