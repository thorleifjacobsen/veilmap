'use client';

import { useCallback } from 'react';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  gmFogOpacity: number;
  onFogOpacityChange: (v: number) => void;
  gridSize: number;
  onGridSizeChange: (v: number) => void;
  prepMessage: string;
  onPrepMessageChange: (v: string) => void;
  sessionName: string;
  onSessionNameChange: (v: string) => void;
  fogStyle: 'solid' | 'animated';
  onFogStyleChange: (v: 'solid' | 'animated') => void;
}

export default function SettingsModal({
  open,
  onClose,
  gmFogOpacity,
  onFogOpacityChange,
  gridSize,
  onGridSizeChange,
  prepMessage,
  onPrepMessageChange,
  sessionName,
  onSessionNameChange,
  fogStyle,
  onFogStyleChange,
}: SettingsModalProps) {
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{
        background: 'rgba(0,0,0,.72)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-[90%] min-w-[320px] max-w-[480px] rounded-md"
        style={{
          background: '#0c0b13',
          border: '1px solid rgba(200,150,62,.45)',
          boxShadow: '0 24px 64px rgba(0,0,0,.7)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid rgba(200,150,62,.2)' }}
        >
          <span
            className="text-[.82rem] tracking-[.1em]"
            style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}
          >
            ⚙ Settings
          </span>
          <button
            className="border-none bg-transparent px-1 py-0.5 text-[.95rem] transition-colors hover:text-[#c8963e]"
            style={{ color: 'rgba(212,196,160,.4)', cursor: 'pointer' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5">
          {/* GM View section */}
          <SettingsSection title="GM View">
            <SliderRow
              label="Fog Opacity"
              value={Math.round(gmFogOpacity * 100)}
              min={0}
              max={88}
              display={`${Math.round(gmFogOpacity * 100)}%`}
              onChange={(v) => onFogOpacityChange(v / 100)}
            />
            <SliderRow
              label="Grid Size"
              value={gridSize}
              min={16}
              max={80}
              display={`${gridSize}px`}
              onChange={onGridSizeChange}
            />
          </SettingsSection>

          <SettingsSection title="Fog Style">
            <div className="flex items-center gap-2">
              {(['solid', 'animated'] as const).map((style) => (
                <button
                  key={style}
                  className="flex-1 rounded border px-3 py-1.5 text-[.62rem] tracking-[.06em] transition-all"
                  style={{
                    fontFamily: "'Cinzel',serif",
                    borderColor: fogStyle === style ? '#c8963e' : 'rgba(200,150,62,.2)',
                    background: fogStyle === style ? 'rgba(200,150,62,.15)' : 'transparent',
                    color: fogStyle === style ? '#c8963e' : 'rgba(212,196,160,.4)',
                    cursor: 'pointer',
                  }}
                  onClick={() => onFogStyleChange(style)}
                >
                  {style === 'solid' ? '▪ Solid' : '≈ Animated'}
                </button>
              ))}
            </div>
            <div
              className="mt-1.5 text-[.52rem]"
              style={{ fontFamily: "'Crimson Pro',serif", color: 'rgba(212,196,160,.3)' }}
            >
              Animated fog adds a slow-moving mist effect. Auto-disables on low performance.
            </div>
          </SettingsSection>

          {/* Prep Mode section */}
          <SettingsSection title="Prep Mode Screen">
            <div className="mb-2.5">
              <label
                className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
                style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
              >
                Message shown to players
              </label>
              <input
                type="text"
                value={prepMessage}
                onChange={(e) => onPrepMessageChange(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-[.82rem] outline-none transition-colors focus:border-[#c8963e]"
                style={{
                  background: 'rgba(0,0,0,.45)',
                  border: '1px solid rgba(200,150,62,.2)',
                  color: '#d4c4a0',
                  fontFamily: "'Crimson Pro',serif",
                }}
              />
            </div>
          </SettingsSection>

          {/* Session section */}
          <SettingsSection title="Session">
            <div className="mb-2.5">
              <label
                className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
                style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
              >
                Session Name
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => onSessionNameChange(e.target.value)}
                className="w-full rounded border px-2 py-1.5 text-[.82rem] outline-none transition-colors focus:border-[#c8963e]"
                style={{
                  background: 'rgba(0,0,0,.45)',
                  border: '1px solid rgba(200,150,62,.2)',
                  color: '#d4c4a0',
                  fontFamily: "'Crimson Pro',serif",
                }}
              />
            </div>
          </SettingsSection>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end px-3.5 py-2"
          style={{ borderTop: '1px solid rgba(200,150,62,.2)' }}
        >
          <button
            className="rounded border px-3 py-1 text-[.56rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.25)]"
            style={{
              fontFamily: "'Cinzel',serif",
              borderColor: '#c8963e',
              color: '#c8963e',
              background: 'rgba(200,150,62,.12)',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <h3
        className="mb-2 border-b pb-1 text-[.6rem] tracking-[.1em]"
        style={{
          fontFamily: "'Cinzel',serif",
          color: '#c8963e',
          borderColor: 'rgba(200,150,62,.2)',
        }}
      >
        {title}
      </h3>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <label
        className="min-w-[78px] text-[.56rem] tracking-[.06em]"
        style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
      >
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="h-[3px] flex-1 appearance-none rounded outline-none"
        style={{ background: 'rgba(200,150,62,.2)' }}
      />
      <span
        className="w-8 text-right text-[.62rem]"
        style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}
      >
        {display}
      </span>
    </div>
  );
}
