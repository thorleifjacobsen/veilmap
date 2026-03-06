'use client';

import { useState, useRef, useCallback } from 'react';
import type { Box, BoxType } from '@/types';

const BOX_COLORS = ['#c8963e', '#e05c2a', '#6a4fc8', '#2a8a4a', '#c8300a', '#2a6a9a', '#888'];

const TYPE_OPTIONS: { value: BoxType; label: string }[] = [
  { value: 'autoReveal', label: 'autoReveal — brush inside to reveal whole area' },
  { value: 'trigger', label: 'trigger — GM note pops on reveal' },
  { value: 'hazard', label: 'hazard — danger zone marker' },
  { value: 'note', label: 'note — GM only, hidden from players' },
  { value: 'hidden', label: 'hidden — invisible scripting zone' },
];

const TYPE_HINTS: Record<BoxType, string> = {
  autoReveal: 'Brush any pixel inside → entire box revealed instantly.',
  trigger: 'Reveals like autoReveal, then shows your GM note as a popup.',
  hazard: 'Danger zone. Shown with diagonal hatching in GM view.',
  note: 'GM-only annotation — never visible on player display.',
  hidden: 'Invisible box for scripting. No visual.',
};

interface BoxEditorProps {
  box: Box | null;
  onSave: (boxId: string, updates: Partial<Box>) => void;
  onDelete: (boxId: string) => void;
  onClose: () => void;
}

export default function BoxEditor({ box, onSave, onDelete, onClose }: BoxEditorProps) {
  const [name, setName] = useState(box?.name ?? '');
  const [type, setType] = useState<BoxType>(box?.type ?? 'autoReveal');
  const [color, setColor] = useState(box?.color ?? '#c8963e');
  const [notes, setNotes] = useState(box?.notes ?? '');
  const overlayRef = useRef<HTMLDivElement>(null);

  // Reset state when box changes
  const prevBoxId = useRef(box?.id);
  if (box && box.id !== prevBoxId.current) {
    prevBoxId.current = box.id;
    setName(box.name);
    setType(box.type);
    setColor(box.color);
    setNotes(box.notes);
  }

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === overlayRef.current) onClose();
    },
    [onClose],
  );

  if (!box) return null;

  const handleSave = () => {
    onSave(box.id, { name: name || box.name, type, color, notes });
  };

  const handleDelete = () => {
    onDelete(box.id);
  };

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
            Edit: {box.name}
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
          {/* Name */}
          <FormRow label="Name">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Throne Room"
              className="w-full rounded-[3px] px-2 py-[5px] text-[0.82rem] outline-none transition-colors duration-150 focus:border-[var(--gold)]"
              style={{
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: "'Crimson Pro', serif",
              }}
            />
          </FormRow>

          {/* Type */}
          <FormRow label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BoxType)}
              className="w-full rounded-[3px] px-2 py-[5px] text-[0.82rem] outline-none transition-colors duration-150 focus:border-[var(--gold)]"
              style={{
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: "'Crimson Pro', serif",
              }}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: 'var(--panel2)' }}>
                  {o.label}
                </option>
              ))}
            </select>
            <div
              className="mt-[2px] italic"
              style={{ fontSize: '0.6rem', color: 'var(--dim)' }}
            >
              {TYPE_HINTS[type]}
            </div>
          </FormRow>

          {/* Color */}
          <FormRow label="Color">
            <div className="flex flex-wrap gap-1">
              {BOX_COLORS.map((c) => (
                <div
                  key={c}
                  className="h-5 w-5 cursor-pointer rounded-[3px] transition-all duration-[120ms] hover:scale-110"
                  style={{
                    background: c,
                    border: color === c ? '2px solid #fff' : '2px solid transparent',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </FormRow>

          {/* Notes */}
          <FormRow label="GM Notes / Trigger Text">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Secret door behind east wall…"
              className="min-h-[60px] w-full resize-y rounded-[3px] px-2 py-[5px] text-[0.82rem] outline-none transition-colors duration-150 focus:border-[var(--gold)]"
              style={{
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: "'Crimson Pro', serif",
              }}
            />
          </FormRow>
        </div>

        {/* Footer */}
        <div
          className="flex justify-end gap-[6px] px-[14px] py-2"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            className="cursor-pointer rounded-[3px] px-3 py-1 tracking-[0.07em] transition-all duration-150 hover:bg-[rgba(224,92,42,0.1)]"
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '0.56rem',
              background: 'rgba(200,150,62,0.07)',
              border: '1px solid rgba(224,92,42,0.3)',
              color: 'var(--ember)',
            }}
            onClick={handleDelete}
          >
            Delete
          </button>
          <div className="flex-1" />
          <button
            className="cursor-pointer rounded-[3px] px-3 py-1 tracking-[0.07em] transition-all duration-150 hover:bg-[rgba(200,150,62,0.18)]"
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '0.56rem',
              background: 'rgba(200,150,62,0.07)',
              border: '1px solid var(--border)',
              color: 'var(--gold)',
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="cursor-pointer rounded-[3px] px-3 py-1 tracking-[0.07em] transition-all duration-150 hover:bg-[rgba(200,150,62,0.18)]"
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: '0.56rem',
              background: 'rgba(200,150,62,0.07)',
              border: '1px solid var(--gold)',
              color: 'var(--gold)',
            }}
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-[10px]">
      <label
        className="mb-[3px] block uppercase tracking-[0.08em]"
        style={{ fontFamily: "'Cinzel', serif", fontSize: '0.56rem', color: 'var(--dim)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
