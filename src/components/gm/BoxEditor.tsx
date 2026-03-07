'use client';

import { useState, useEffect, useCallback } from 'react';
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
  open: boolean;
  onClose: () => void;
  onSave: (id: string, updates: { name: string; type: BoxType; color: string; notes: string }) => void;
  onDelete: (id: string) => void;
}

export default function BoxEditor({ box, open, onClose, onSave, onDelete }: BoxEditorProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<BoxType>('autoReveal');
  const [color, setColor] = useState('#c8963e');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (box) {
      setName(box.name);
      setType(box.type);
      setColor(box.color);
      setNotes(box.notes);
    }
  }, [box]);

  const handleSave = useCallback(() => {
    if (!box) return;
    onSave(box.id, { name: name || box.name, type, color, notes });
  }, [box, name, type, color, notes, onSave]);

  const handleDelete = useCallback(() => {
    if (!box) return;
    onDelete(box.id);
  }, [box, onDelete]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open || !box) return null;

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
            Edit: {box.name}
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
          {/* Name */}
          <div className="mb-2.5">
            <label
              className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
              style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
            >
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Throne Room"
              className="w-full rounded border px-2 py-1.5 text-[.82rem] outline-none transition-colors focus:border-[#c8963e]"
              style={{
                background: 'rgba(0,0,0,.45)',
                border: '1px solid rgba(200,150,62,.2)',
                color: '#d4c4a0',
                fontFamily: "'Crimson Pro',serif",
              }}
            />
          </div>

          {/* Type */}
          <div className="mb-2.5">
            <label
              className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
              style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
            >
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as BoxType)}
              className="w-full rounded border px-2 py-1.5 text-[.82rem] outline-none transition-colors focus:border-[#c8963e]"
              style={{
                background: 'rgba(0,0,0,.45)',
                border: '1px solid rgba(200,150,62,.2)',
                color: '#d4c4a0',
                fontFamily: "'Crimson Pro',serif",
              }}
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value} style={{ background: '#0c0b13' }}>
                  {o.label}
                </option>
              ))}
            </select>
            <div
              className="mt-0.5 text-[.6rem] italic"
              style={{ color: 'rgba(212,196,160,.4)' }}
            >
              {TYPE_HINTS[type]}
            </div>
          </div>

          {/* Color */}
          <div className="mb-2.5">
            <label
              className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
              style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
            >
              Color
            </label>
            <div className="flex flex-wrap gap-1">
              {BOX_COLORS.map((c) => (
                <div
                  key={c}
                  className="h-5 w-5 cursor-pointer rounded transition-transform hover:scale-110"
                  style={{
                    background: c,
                    border: color === c ? '2px solid #fff' : '2px solid transparent',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-2.5">
            <label
              className="mb-1 block text-[.56rem] uppercase tracking-[.08em]"
              style={{ fontFamily: "'Cinzel',serif", color: 'rgba(212,196,160,.4)' }}
            >
              GM Notes / Trigger Text
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Secret door behind east wall…"
              className="min-h-[60px] w-full resize-y rounded border px-2 py-1.5 text-[.82rem] outline-none transition-colors focus:border-[#c8963e]"
              style={{
                background: 'rgba(0,0,0,.45)',
                border: '1px solid rgba(200,150,62,.2)',
                color: '#d4c4a0',
                fontFamily: "'Crimson Pro',serif",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-1.5 px-3.5 py-2"
          style={{ borderTop: '1px solid rgba(200,150,62,.2)' }}
        >
          <button
            className="rounded border px-3 py-1 text-[.56rem] tracking-[.07em] transition-colors hover:bg-[rgba(224,92,42,.1)]"
            style={{
              fontFamily: "'Cinzel',serif",
              borderColor: 'rgba(224,92,42,.3)',
              color: '#e05c2a',
              background: 'rgba(200,150,62,.07)',
              cursor: 'pointer',
            }}
            onClick={handleDelete}
          >
            Delete
          </button>
          <div className="flex-1" />
          <button
            className="rounded border px-3 py-1 text-[.56rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.18)]"
            style={{
              fontFamily: "'Cinzel',serif",
              borderColor: 'rgba(200,150,62,.2)',
              color: '#c8963e',
              background: 'rgba(200,150,62,.07)',
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rounded border px-3 py-1 text-[.56rem] tracking-[.07em] transition-colors hover:bg-[rgba(200,150,62,.25)]"
            style={{
              fontFamily: "'Cinzel',serif",
              borderColor: '#c8963e',
              color: '#c8963e',
              background: 'rgba(200,150,62,.12)',
              cursor: 'pointer',
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
