'use client';

import { useRef, useCallback } from 'react';
import type { Box, Token, SessionExport } from '@/types';

const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e',
  trigger: '#a080e0',
  hazard: '#e05c2a',
  note: '#5aba6a',
  hidden: '#555',
};

const TOKEN_PALETTE: { emoji: string; color: string }[] = [
  { emoji: '⚔️', color: '#e05c2a' },
  { emoji: '🧙', color: '#6a4fc8' },
  { emoji: '🗡️', color: '#2a8a4a' },
  { emoji: '✨', color: '#d4a017' },
  { emoji: '🐉', color: '#c8300a' },
  { emoji: '👺', color: '#4a8a2a' },
  { emoji: '💀', color: '#9a9a9a' },
  { emoji: '🔥', color: '#e07820' },
  { emoji: '🧝', color: '#3a9a7a' },
  { emoji: '🐺', color: '#7a6a5a' },
];

interface RightPanelProps {
  boxes: Box[];
  tokens: Token[];
  selectedBoxId: string | null;
  onBoxClick: (box: Box) => void;
  onRevealAll: () => void;
  onClearBoxes: () => void;
  onQueueToken: (emoji: string, color: string) => void;
  onClearTokens: () => void;
  onMapUpload: (file: File) => void;
  onExport: () => void;
  onImport: (data: SessionExport) => void;
}

export default function RightPanel({
  boxes,
  tokens: _tokens,
  selectedBoxId,
  onBoxClick,
  onRevealAll,
  onClearBoxes,
  onQueueToken,
  onClearTokens,
  onMapUpload,
  onExport,
  onImport,
}: RightPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const handleMapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onMapUpload(f);
    },
    [onMapUpload],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f?.type.startsWith('image/')) onMapUpload(f);
    },
    [onMapUpload],
  );

  const handleImportFile = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as SessionExport;
          onImport(data);
        } catch {
          /* ignore invalid files */
        }
      };
      reader.readAsText(f);
    },
    [onImport],
  );

  return (
    <div
      className="flex w-[190px] flex-shrink-0 flex-col overflow-hidden"
      style={{
        background: '#100f18',
        borderLeft: '1px solid rgba(200,150,62,.2)',
      }}
    >
      {/* Map upload section */}
      <PanelSection>
        <PanelTitle>
          Map{' '}
          <span
            className="ml-auto cursor-pointer text-[.5rem]"
            style={{ color: '#c8963e' }}
            onClick={() => fileInputRef.current?.click()}
          >
            + Upload
          </span>
        </PanelTitle>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleMapChange}
        />
        <div
          className="cursor-pointer rounded border border-dashed p-2.5 text-center transition-all hover:border-[#c8963e] hover:bg-[rgba(200,150,62,.04)]"
          style={{ borderColor: 'rgba(200,150,62,.2)' }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="mb-0.5 text-base">🗺️</div>
          <div
            className="text-[.6rem] tracking-[.04em]"
            style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
          >
            CLICK OR DROP MAP
          </div>
        </div>
      </PanelSection>

      {/* Meta Boxes section */}
      <PanelSection>
        <PanelTitle>
          Meta Boxes{' '}
          <span className="ml-auto text-[.5rem]" style={{ color: 'rgba(212,196,160,.4)' }}>
            {boxes.length}
          </span>
        </PanelTitle>
        <div className="max-h-[120px] overflow-y-auto">
          {boxes.map((b) => (
            <div
              key={b.id}
              className="mb-0.5 flex cursor-pointer items-center gap-1 rounded border px-1.5 py-1 text-[.72rem] transition-all hover:bg-[rgba(200,150,62,.05)]"
              style={{
                borderColor:
                  selectedBoxId === b.id ? '#c8963e' : 'transparent',
                background:
                  selectedBoxId === b.id
                    ? 'rgba(200,150,62,.07)'
                    : 'transparent',
                opacity: b.revealed ? 0.45 : 1,
              }}
              onClick={() => onBoxClick(b)}
            >
              <div
                className="h-[7px] w-[7px] flex-shrink-0 rounded-sm"
                style={{ background: b.color || TYPE_COLORS[b.type] || '#c8963e' }}
              />
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[.68rem]">
                {b.name}
              </span>
              <span
                className="text-[.48rem]"
                style={{
                  fontFamily: "'Cinzel',serif",
                  color: b.revealed ? 'rgba(200,150,62,.5)' : 'rgba(212,196,160,.4)',
                }}
              >
                {b.revealed ? '✓' : b.type.slice(0, 4)}
              </span>
            </div>
          ))}
        </div>
        <SmallBtn onClick={onRevealAll}>✦ Reveal All</SmallBtn>
        <SmallBtn red onClick={onClearBoxes}>
          ✕ Clear Boxes
        </SmallBtn>
      </PanelSection>

      {/* Tokens section */}
      <PanelSection grow>
        <PanelTitle>Tokens</PanelTitle>
        <div className="grid grid-cols-5 gap-1">
          {TOKEN_PALETTE.map((t) => (
            <div
              key={t.emoji}
              className="flex aspect-square cursor-pointer items-center justify-center rounded-full text-[.8rem] transition-all hover:scale-110 hover:border-[#c8963e]"
              style={{
                border: '1.5px solid rgba(200,150,62,.2)',
                background: 'rgba(0,0,0,.3)',
              }}
              onClick={() => onQueueToken(t.emoji, t.color)}
            >
              {t.emoji}
            </div>
          ))}
        </div>
        <SmallBtn red onClick={onClearTokens}>
          ✕ Clear Tokens
        </SmallBtn>
      </PanelSection>

      {/* Export/Import section */}
      <PanelSection>
        <PanelTitle>Session Data</PanelTitle>
        <SmallBtn onClick={onExport}>↓ Export .veilmap.json</SmallBtn>
        <input
          ref={importInputRef}
          type="file"
          accept=".json,.veilmap.json"
          className="hidden"
          onChange={handleImportFile}
        />
        <SmallBtn onClick={() => importInputRef.current?.click()}>
          ↑ Import .veilmap.json
        </SmallBtn>
      </PanelSection>
    </div>
  );
}

function PanelSection({ children, grow }: { children: React.ReactNode; grow?: boolean }) {
  return (
    <div
      className={`flex-shrink-0 p-2 ${grow ? 'flex-1 overflow-y-auto' : ''}`}
      style={{ borderBottom: '1px solid rgba(200,150,62,.2)' }}
    >
      {children}
    </div>
  );
}

function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-1.5 flex items-center gap-1 text-[.57rem] uppercase tracking-[.12em]"
      style={{ fontFamily: "'Cinzel',serif", color: '#c8963e' }}
    >
      <span
        className="h-[3px] w-[3px] rounded-full"
        style={{ background: '#c8963e' }}
      />
      {children}
    </div>
  );
}

function SmallBtn({
  children,
  red,
  onClick,
}: {
  children: React.ReactNode;
  red?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="mt-1 w-full cursor-pointer rounded border p-1 text-[.56rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.18)]"
      style={{
        fontFamily: "'Cinzel',serif",
        borderColor: red ? 'rgba(224,92,42,.3)' : 'rgba(200,150,62,.2)',
        color: red ? '#e05c2a' : '#c8963e',
        background: 'rgba(200,150,62,.07)',
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
