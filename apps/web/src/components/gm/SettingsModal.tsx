'use client';

import { useState, useRef, useCallback } from 'react';

interface SettingsModalProps {
  open: boolean;
  gmFogOpacity: number;
  gridSize: number;
  showBoxesGM: boolean;
  showBoxesPlayer: boolean;
  prepMessage: string;
  sessionName: string;
  onChangeGmFogOpacity: (v: number) => void;
  onChangeGridSize: (v: number) => void;
  onChangeShowBoxesGM: (v: boolean) => void;
  onChangeShowBoxesPlayer: (v: boolean) => void;
  onChangePrepMessage: (v: string) => void;
  onChangeSessionName: (v: string) => void;
  onClose: () => void;
}

export default function SettingsModal({
  open,
  gmFogOpacity,
  gridSize,
  showBoxesGM,
  showBoxesPlayer,
  prepMessage,
  sessionName,
  onChangeGmFogOpacity,
  onChangeGridSize,
  onChangeShowBoxesGM,
  onChangeShowBoxesPlayer,
  onChangePrepMessage,
  onChangeSessionName,
  onClose,
}: SettingsModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)' }}
      onClick={handleOverlayClick}
    >
      <div
        className="w-[90%] min-w-[320px] max-w-[480px] rounded-[6px]"
        style={{
          background: 'var(--panel2)',
          border: '1px solid var(--borderh)',
          boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-[15px] py-[11px]"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span
            className="tracking-[0.1em]"
            style={{ fontFamily: "'Cinzel', serif", fontSize: '0.82rem', color: 'var(--gold)' }}
          >
            ⚙ Settings
          </span>
          <button
            className="cursor-pointer border-none bg-transparent px-[5px] py-[2px] text-[0.95rem] transition-colors duration-150 hover:text-[var(--gold)]"
            style={{ color: 'var(--dim)' }}
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-[14px]">
          {/* GM View */}
          <SettingsSection title="GM View">
            <SliderRow
              label="Fog Opacity"
              value={Math.round(gmFogOpacity * 100)}
              min={0}
              max={88}
              suffix="%"
              onChange={(v) => onChangeGmFogOpacity(v / 100)}
            />
            <SliderRow
              label="Grid Size"
              value={gridSize}
              min={16}
              max={80}
              suffix="px"
              onChange={onChangeGridSize}
            />
          </SettingsSection>

          {/* Box Display */}
          <SettingsSection title="Box Display">
            <CheckboxRow
              label="Show boxes in GM view"
              checked={showBoxesGM}
              onChange={onChangeShowBoxesGM}
            />
            <CheckboxRow
              label="Show box outlines on player display"
              checked={showBoxesPlayer}
              onChange={onChangeShowBoxesPlayer}
            />
          </SettingsSection>

          {/* Prep Mode Screen */}
          <SettingsSection title="Prep Mode Screen">
            <div className="mb-[10px]">
              <label
                className="mb-[3px] block uppercase tracking-[0.08em]"
                style={{ fontFamily: "'Cinzel', serif", fontSize: '0.56rem', color: 'var(--dim)' }}
              >
                Message shown to players
              </label>
              <input
                type="text"
                value={prepMessage}
                onChange={(e) => onChangePrepMessage(e.target.value)}
                className="w-full rounded-[3px] px-2 py-[5px] text-[0.82rem] outline-none transition-colors duration-150 focus:border-[var(--gold)]"
                style={{
                  background: 'rgba(0,0,0,0.45)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: "'Crimson Pro', serif",
                }}
              />
            </div>
          </SettingsSection>

          {/* Session */}
          <SettingsSection title="Session">
            <div className="mb-[10px]">
              <label
                className="mb-[3px] block uppercase tracking-[0.08em]"
                style={{ fontFamily: "'Cinzel', serif", fontSize: '0.56rem', color: 'var(--dim)' }}
              >
                Session Name
              </label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => onChangeSessionName(e.target.value)}
                className="w-full rounded-[3px] px-2 py-[5px] text-[0.82rem] outline-none transition-colors duration-150 focus:border-[var(--gold)]"
                style={{
                  background: 'rgba(0,0,0,0.45)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: "'Crimson Pro', serif",
                }}
              />
            </div>
          </SettingsSection>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end px-[14px] py-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            className="cursor-pointer rounded-[3px] px-3 py-1 tracking-[0.07em] transition-all duration-150 hover:bg-[rgba(200,150,62,0.18)]"
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '0.56rem',
              background: 'rgba(200,150,62,0.07)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
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
        className="mb-[7px] border-b pb-[3px] tracking-[0.1em]"
        style={{
          fontFamily: "'Cinzel', serif",
          fontSize: '0.6rem',
          color: 'var(--gold)',
          borderColor: 'var(--border)',
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
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-[7px]">
      <label
        className="min-w-[78px] tracking-[0.06em]"
        style={{ fontFamily: "'Cinzel', serif", fontSize: '0.56rem', color: 'var(--dim)' }}
      >
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="h-[3px] flex-1 cursor-pointer appearance-none rounded-sm outline-none"
        style={{ background: 'rgba(200,150,62,0.2)' }}
      />
      <span
        className="w-8 text-right"
        style={{ fontFamily: "'Cinzel', serif", fontSize: '0.62rem', color: 'var(--gold)' }}
      >
        {value}{suffix}
      </span>
    </div>
  );
}

function CheckboxRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="mb-[5px] flex cursor-pointer items-center gap-[6px] text-[0.75rem]"
      style={{ color: 'var(--text)' }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: 'var(--gold)' }}
      />
      {label}
    </label>
  );
}
