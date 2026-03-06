'use client';

import { useRef } from 'react';
import type { Box, Token } from '@/types';

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

const TYPE_COLORS: Record<string, string> = {
  autoReveal: '#c8963e',
  trigger: '#a080e0',
  hazard: '#e05c2a',
  note: '#5aba6a',
  hidden: '#555',
};

interface RightPanelProps {
  boxes: Box[];
  tokens: Token[];
  selectedBoxId: string | null;
  onMapUpload: (file: File) => void;
  onBoxClick: (boxId: string) => void;
  onRevealAll: () => void;
  onClearBoxes: () => void;
  onQueueToken: (emoji: string, color: string) => void;
  onClearTokens: () => void;
}

export default function RightPanel({
  boxes,
  selectedBoxId,
  onMapUpload,
  onBoxClick,
  onRevealAll,
  onClearBoxes,
  onQueueToken,
  onClearTokens,
}: RightPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onMapUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      onMapUpload(file);
    }
  };

  return (
    <div
      className="flex w-[190px] flex-shrink-0 flex-col overflow-hidden"
      style={{
        background: 'var(--panel)',
        borderLeft: '1px solid var(--border)',
      }}
    >
      {/* Map section */}
      <PanelSection>
        <SectionTitle>
          Map{' '}
          <span
            className="ml-auto cursor-pointer"
            style={{ fontSize: '0.5rem', color: 'var(--gold)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            + Upload
          </span>
        </SectionTitle>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
        />
        <div
          className="cursor-pointer rounded-[3px] px-[6px] py-[10px] text-center transition-all duration-200 hover:border-[var(--gold)] hover:bg-[rgba(200,150,62,0.04)]"
          style={{
            border: '1px dashed var(--border)',
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <div className="mb-[2px] text-base">🗺️</div>
          <div
            className="uppercase tracking-[0.04em]"
            style={{ fontFamily: "'Cinzel', serif", fontSize: '0.6rem', color: 'var(--dim)' }}
          >
            CLICK OR DROP MAP
          </div>
        </div>
      </PanelSection>

      {/* Meta Boxes section */}
      <PanelSection>
        <SectionTitle>
          Meta Boxes <span className="ml-auto" style={{ fontSize: '0.5rem', color: 'var(--dim)' }}>{boxes.length}</span>
        </SectionTitle>
        <div className="max-h-[120px] overflow-y-auto">
          {boxes.map((b) => (
            <div
              key={b.id}
              className={`mb-[2px] flex cursor-pointer items-center gap-1 rounded-[3px] border px-[5px] py-[3px] text-[0.72rem] transition-all duration-[120ms] hover:bg-[rgba(200,150,62,0.05)] ${
                selectedBoxId === b.id
                  ? 'border-[var(--gold)] bg-[rgba(200,150,62,0.07)]'
                  : 'border-transparent'
              } ${b.revealed ? 'opacity-45' : ''}`}
              style={{ borderColor: selectedBoxId === b.id ? 'var(--gold)' : undefined }}
              onClick={() => onBoxClick(b.id)}
            >
              <div
                className="h-[7px] w-[7px] flex-shrink-0 rounded-[2px]"
                style={{ background: b.color || TYPE_COLORS[b.type] || '#c8963e' }}
              />
              <span
                className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                style={{ fontSize: '0.68rem' }}
              >
                {b.name}
              </span>
              <span
                style={{
                  fontFamily: "'Cinzel', serif",
                  fontSize: '0.48rem',
                  color: b.revealed ? 'rgba(200,150,62,0.5)' : 'var(--dim)',
                }}
              >
                {b.revealed ? '✓' : b.type.slice(0, 4)}
              </span>
            </div>
          ))}
        </div>
        <SmallButton onClick={onRevealAll}>✦ Reveal All</SmallButton>
        <SmallButton red onClick={onClearBoxes}>✕ Clear Boxes</SmallButton>
      </PanelSection>

      {/* Tokens section */}
      <PanelSection grow>
        <SectionTitle>Tokens</SectionTitle>
        <div className="grid grid-cols-5 gap-[3px]">
          {TOKEN_PALETTE.map((t) => (
            <div
              key={t.emoji}
              className="flex aspect-square cursor-pointer items-center justify-center rounded-full text-[0.8rem] transition-all duration-[120ms] hover:scale-[1.08] hover:border-[var(--gold)]"
              style={{
                border: '1.5px solid var(--border)',
                background: 'rgba(0,0,0,0.3)',
              }}
              onClick={() => onQueueToken(t.emoji, t.color)}
            >
              {t.emoji}
            </div>
          ))}
        </div>
        <SmallButton red onClick={onClearTokens}>✕ Clear Tokens</SmallButton>
      </PanelSection>
    </div>
  );
}

function PanelSection({ children, grow }: { children: React.ReactNode; grow?: boolean }) {
  return (
    <div
      className={`flex-shrink-0 p-2 ${grow ? 'flex-1 overflow-y-auto' : ''}`}
      style={{ borderBottom: grow ? undefined : '1px solid var(--border)' }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-[6px] flex items-center gap-1 uppercase tracking-[0.12em]"
      style={{ fontFamily: "'Cinzel', serif", fontSize: '0.57rem', color: 'var(--gold)' }}
    >
      <span
        className="h-[3px] w-[3px] rounded-full"
        style={{ background: 'var(--gold)' }}
      />
      {children}
    </div>
  );
}

function SmallButton({
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
      className={`mt-1 w-full cursor-pointer rounded-[3px] p-1 tracking-[0.07em] transition-all duration-150 ${
        red
          ? 'hover:bg-[rgba(224,92,42,0.1)]'
          : 'hover:bg-[rgba(200,150,62,0.18)]'
      }`}
      style={{
        fontFamily: "'Cinzel', serif",
        fontSize: '0.56rem',
        background: 'rgba(200,150,62,0.07)',
        border: red ? '1px solid rgba(224,92,42,0.3)' : '1px solid var(--border)',
        color: red ? 'var(--ember)' : 'var(--gold)',
        letterSpacing: '0.07em',
      }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
