'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface DialogOptions {
  title: string;
  message?: string;
  /** When set, shows a text input pre-filled with this value */
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true, the confirm button is styled as destructive (red) */
  destructive?: boolean;
}

interface DialogState extends DialogOptions {
  open: boolean;
  resolve: (value: string | boolean | null) => void;
}

const initial: DialogState = {
  open: false,
  title: '',
  resolve: () => {},
};

let globalShow: ((opts: DialogOptions) => Promise<string | boolean | null>) | null = null;

/**
 * Show a confirmation dialog. Resolves to `true` (confirm) or `false` (cancel).
 */
export function dialogConfirm(title: string, message?: string, destructive?: boolean): Promise<boolean> {
  if (!globalShow) return Promise.resolve(false);
  return globalShow({ title, message, destructive, confirmLabel: 'Confirm', cancelLabel: 'Cancel' }).then(v => v === true);
}

/**
 * Show a prompt dialog with a text input. Resolves to the entered string or `null` (cancel).
 */
export function dialogPrompt(title: string, defaultValue?: string): Promise<string | null> {
  if (!globalShow) return Promise.resolve(null);
  return globalShow({ title, defaultValue: defaultValue ?? '', confirmLabel: 'OK', cancelLabel: 'Cancel' }).then(v => (typeof v === 'string' ? v : null));
}

/**
 * Mount this component once at the app root. It provides confirm/prompt dialogs
 * via the exported `dialogConfirm` and `dialogPrompt` functions.
 */
export default function DialogModal() {
  const [state, setState] = useState<DialogState>(initial);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((value: string | boolean | null) => {
    setState(prev => {
      prev.resolve(value);
      return { ...initial };
    });
  }, []);

  useEffect(() => {
    globalShow = (opts: DialogOptions) => {
      return new Promise<string | boolean | null>((resolve) => {
        setState({ ...opts, open: true, resolve });
      });
    };
    return () => { globalShow = null; };
  }, []);

  // Focus confirm button when opened (for confirm-only dialogs; prompt dialogs use autoFocus on input)
  const confirmCallbackRef = useCallback((node: HTMLButtonElement | null) => {
    confirmRef.current = node;
    if (node && state.open && state.defaultValue === undefined) {
      node.focus();
    }
  }, [state.open, state.defaultValue]);

  // Keyboard: Enter confirms, Escape cancels
  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(state.defaultValue !== undefined ? null : false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [state.open, state.defaultValue, close]);

  if (!state.open) return null;

  const isPrompt = state.defaultValue !== undefined;

  const handleConfirm = () => {
    if (isPrompt) {
      close(inputRef.current?.value ?? '');
    } else {
      close(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,.65)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close(isPrompt ? null : false); }}
    >
      <div
        className="min-w-[320px] max-w-[440px] rounded-lg p-5 shadow-[0_12px_48px_rgba(0,0,0,.7)]"
        style={{ background: '#13111d', border: '1px solid rgba(200,150,62,.4)' }}
      >
        <div
          className="mb-3 text-sm font-bold tracking-wide uppercase"
          style={{ fontFamily: "'Cinzel',serif", color: '#c8963e', letterSpacing: '.1em' }}
        >
          {state.title}
        </div>

        {state.message && (
          <div className="mb-4 text-[.85rem]" style={{ color: '#d4c4a0' }}>
            {state.message}
          </div>
        )}

        {isPrompt && (
          <input
            ref={inputRef}
            autoFocus
            defaultValue={state.defaultValue}
            className="mb-4 w-full rounded border px-3 py-2 text-[.85rem] outline-none"
            style={{
              background: '#0c0b13',
              border: '1px solid rgba(200,150,62,.3)',
              color: '#d4c4a0',
            }}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
          />
        )}

        <div className="flex justify-end gap-2">
          <button
            className="cursor-pointer rounded px-4 py-1.5 text-[.78rem] transition-colors"
            style={{
              background: 'rgba(200,150,62,.1)',
              border: '1px solid rgba(200,150,62,.25)',
              color: '#d4c4a0',
              fontFamily: "'Cinzel',serif",
            }}
            onClick={() => close(isPrompt ? null : false)}
          >
            {state.cancelLabel || 'Cancel'}
          </button>
          <button
            ref={confirmCallbackRef}
            className="cursor-pointer rounded px-4 py-1.5 text-[.78rem] transition-colors"
            style={{
              background: state.destructive ? 'rgba(224,92,42,.2)' : 'rgba(200,150,62,.2)',
              border: `1px solid ${state.destructive ? 'rgba(224,92,42,.5)' : 'rgba(200,150,62,.5)'}`,
              color: state.destructive ? '#e05c2a' : '#c8963e',
              fontFamily: "'Cinzel',serif",
            }}
            onClick={handleConfirm}
          >
            {state.confirmLabel || 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
}
