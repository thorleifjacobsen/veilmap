'use client';

import { useRef, useCallback, useState } from 'react';
import type { Box, Token, MapObject, SessionExport } from '@/types';

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
  objects: MapObject[];
  selectedBoxId: string | null;
  selectedObjectId: string | null;
  onObjectSelect: (id: string | null) => void;
  onBoxClick: (box: Box) => void;
  onRevealAll: () => void;
  onClearBoxes: () => void;
  onQueueToken: (emoji: string, color: string) => void;
  onClearTokens: () => void;
  onMapUpload: (file: File) => void;
  onExport: () => void;
  onImport: (data: SessionExport) => void;
  onObjectAdd: (file: File) => void;
  onObjectUpdate: (id: string, updates: Partial<MapObject>) => void;
  onObjectDelete: (id: string) => void;
  onObjectReorder: (id: string, direction: 'up' | 'down') => void;
  onTokenUpload?: (file: File) => void;
}

export default function RightPanel({
  boxes,
  tokens,
  objects,
  selectedBoxId,
  selectedObjectId,
  onObjectSelect,
  onBoxClick,
  onRevealAll,
  onClearBoxes,
  onQueueToken,
  onClearTokens,
  onMapUpload,
  onExport,
  onImport,
  onObjectAdd,
  onObjectUpdate,
  onObjectDelete,
  onObjectReorder,
  onTokenUpload,
}: RightPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const objectInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const tokenUploadRef = useRef<HTMLInputElement>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');

  const handleMapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) onMapUpload(f);
    },
    [onMapUpload],
  );

  const handleObjectFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        onObjectAdd(files[i]);
      }
      e.target.value = '';
    },
    [onObjectAdd],
  );

  const handleObjectDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      for (let i = 0; i < files.length; i++) {
        if (files[i].type.startsWith('image/')) onObjectAdd(files[i]);
      }
    },
    [onObjectAdd],
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

  const handleTokenUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f && onTokenUpload) onTokenUpload(f);
      e.target.value = '';
    },
    [onTokenUpload],
  );

  const startEditName = (obj: MapObject) => {
    setEditingNameId(obj.id);
    setEditNameValue(obj.name);
  };

  const commitEditName = () => {
    if (editingNameId && editNameValue.trim()) {
      onObjectUpdate(editingNameId, { name: editNameValue.trim() });
    }
    setEditingNameId(null);
  };

  // Sort objects by zIndex descending (highest on top)
  const sortedObjects = [...objects].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div
      className="flex w-[190px] flex-shrink-0 flex-col overflow-hidden"
      style={{
        background: '#100f18',
        borderLeft: '1px solid rgba(200,150,62,.2)',
      }}
    >
      {/* Objects (layer panel) section */}
      <PanelSection>
        <PanelTitle>
          Objects{' '}
          <span className="ml-auto flex items-center gap-1">
            <span
              className="text-[.58rem]"
              style={{ color: 'rgba(212,196,160,.4)' }}
            >
              {objects.length}
            </span>
            <span
              className="cursor-pointer text-[.58rem]"
              style={{ color: '#c8963e' }}
              onClick={() => objectInputRef.current?.click()}
            >
              + Add
            </span>
          </span>
        </PanelTitle>
        <input
          ref={objectInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={handleObjectFileChange}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleMapChange}
        />
        {sortedObjects.length === 0 ? (
          <div
            className="cursor-pointer rounded border border-dashed p-2 text-center transition-all hover:border-[#c8963e] hover:bg-[rgba(200,150,62,.04)]"
            style={{ borderColor: 'rgba(200,150,62,.2)' }}
            onClick={() => objectInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleObjectDrop}
          >
            <div className="mb-0.5 text-base">🖼️</div>
            <div
              className="text-[.62rem] tracking-[.04em]"
              style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
            >
              DROP IMAGES / GIFS
            </div>
          </div>
        ) : (
          <div
            className="max-h-[180px] overflow-y-auto"
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleObjectDrop}
          >
            {sortedObjects.map((obj) => (
              <div
                key={obj.id}
                className="mb-0.5 flex cursor-pointer items-center gap-1 rounded border px-1 py-0.5 text-[.72rem] transition-all hover:bg-[rgba(200,150,62,.05)]"
                style={{
                  borderColor: selectedObjectId === obj.id ? '#c8963e' : 'transparent',
                  background: selectedObjectId === obj.id ? 'rgba(200,150,62,.07)' : 'transparent',
                  opacity: obj.visible ? 1 : 0.4,
                }}
                onClick={() => onObjectSelect(selectedObjectId === obj.id ? null : obj.id)}
              >
                {/* Thumbnail */}
                <div
                  className="h-[22px] w-[22px] flex-shrink-0 overflow-hidden rounded"
                  style={{ background: 'rgba(0,0,0,.4)', border: '1px solid rgba(200,150,62,.15)' }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={obj.src} alt={obj.name} className="h-full w-full object-cover" />
                </div>
                {/* Name */}
                {editingNameId === obj.id ? (
                  <input
                    className="min-w-0 flex-1 bg-transparent text-[.6rem] outline-none"
                    style={{ color: '#d4c4a0', borderBottom: '1px solid #c8963e' }}
                    value={editNameValue}
                    onChange={(e) => setEditNameValue(e.target.value)}
                    onBlur={commitEditName}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitEditName(); if (e.key === 'Escape') setEditingNameId(null); }}
                    autoFocus
                  />
                ) : (
                  <span
                    className="min-w-0 flex-1 cursor-text overflow-hidden text-ellipsis whitespace-nowrap text-[.68rem]"
                    onDoubleClick={() => startEditName(obj)}
                  >
                    {obj.name}
                  </span>
                )}
                {/* Controls */}
                <div className="flex flex-shrink-0 items-center gap-px">
                  <MiniBtn
                    title={obj.visible ? 'Hide' : 'Show'}
                    onClick={() => onObjectUpdate(obj.id, { visible: !obj.visible })}
                  >
                    {obj.visible ? '👁' : '👁‍🗨'}
                  </MiniBtn>
                  <MiniBtn
                    title={obj.locked ? 'Unlock' : 'Lock'}
                    onClick={() => onObjectUpdate(obj.id, { locked: !obj.locked })}
                  >
                    {obj.locked ? '🔒' : '🔓'}
                  </MiniBtn>
                  <MiniBtn title="Move up" onClick={() => onObjectReorder(obj.id, 'up')}>
                    ▲
                  </MiniBtn>
                  <MiniBtn title="Move down" onClick={() => onObjectReorder(obj.id, 'down')}>
                    ▼
                  </MiniBtn>
                  <MiniBtn title="Delete" onClick={() => onObjectDelete(obj.id)}>
                    ✕
                  </MiniBtn>
                </div>
              </div>
            ))}
            <div
              className="mt-1 cursor-pointer rounded border border-dashed p-1 text-center text-[.58rem] transition-all hover:border-[#c8963e]"
              style={{ borderColor: 'rgba(200,150,62,.15)', color: 'rgba(212,196,160,.3)' }}
              onClick={() => objectInputRef.current?.click()}
            >
              + Add more
            </div>
          </div>
        )}
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
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[.75rem]">
                {b.name}
              </span>
              <span
                className="text-[.55rem]"
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
        <PanelTitle>
          Tokens{' '}
          <span className="ml-auto flex items-center gap-1">
            <span className="text-[.58rem]" style={{ color: 'rgba(212,196,160,.4)' }}>
              {tokens.length}
            </span>
          </span>
        </PanelTitle>

        {/* Placed tokens list */}
        {tokens.length > 0 && (
          <div className="mb-1 max-h-[80px] overflow-y-auto">
            {tokens.map((t) => (
              <div key={t.id} role="listitem" className="flex items-center gap-1 px-1 py-0.5 text-[.68rem] rounded hover:bg-[rgba(200,150,62,.05)]" tabIndex={0}>
                <span>{t.emoji}</span>
                <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{t.label || t.emoji}</span>
              </div>
            ))}
          </div>
        )}

        {/* Quick token palette (built-in) */}
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
              title={`Place ${t.emoji}`}
            >
              {t.emoji}
            </div>
          ))}
        </div>

        {/* Upload custom token */}
        <input ref={tokenUploadRef} type="file" accept="image/*" className="hidden" onChange={handleTokenUpload} />
        <SmallBtn onClick={() => tokenUploadRef.current?.click()}>↑ Upload Token Image</SmallBtn>
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

function MiniBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button
      className="flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded text-[.56rem] transition-all hover:bg-[rgba(200,150,62,.15)]"
      style={{ color: '#d4c4a0' }}
      title={title}
      aria-label={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {children}
    </button>
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
      className="mb-1.5 flex items-center gap-1 text-[.65rem] font-semibold uppercase tracking-[.12em]"
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
      className="mt-1 w-full cursor-pointer rounded border p-1 text-[.64rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.18)]"
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
