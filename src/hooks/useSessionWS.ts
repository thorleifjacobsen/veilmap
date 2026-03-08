'use client';

// hooks/useSessionWS.ts — WebSocket hook for GM and Player connections
// Reconnects automatically with exponential backoff.
// Exposes send() and connection status.

import { useEffect, useRef, useCallback, useState } from 'react';

export type WSStatus = 'connecting' | 'connected' | 'disconnected';

export interface WSEvent {
  type: string;
  payload?: unknown;
}

interface UseSessionWSOptions {
  slug: string;
  role: 'gm' | 'player';
  onMessage: (event: WSEvent) => void;
  /** Enabled flag — set to false to delay connection until ready */
  enabled?: boolean;
}

interface UseSessionWSResult {
  send: (type: string, payload?: unknown) => void;
  status: WSStatus;
}

// Exponential backoff constants: starts at 1s, doubles each attempt, caps at 30s
const BACKOFF_INITIAL = 1000;
const BACKOFF_MAX = 30_000;

export function useSessionWS({
  slug,
  role,
  onMessage,
  enabled = true,
}: UseSessionWSOptions): UseSessionWSResult {
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(BACKOFF_INITIAL);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onMessageRef = useRef(onMessage);
  const connectRef = useRef<() => void>(() => {});
  const [status, setStatus] = useState<WSStatus>('disconnected');

  // Keep onMessage ref fresh without re-connecting
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;

    const scheduleReconnect = () => {
      if (!mountedRef.current) return;
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, BACKOFF_MAX);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connectRef.current();
      }, delay);
    };

    const connect = () => {
      if (!mountedRef.current) return;
      setStatus('connecting');

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const url = `${proto}://${window.location.host}/ws?slug=${encodeURIComponent(slug)}&role=${role}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        backoffRef.current = BACKOFF_INITIAL;
        setStatus('connected');
      };

      ws.onmessage = (e) => {
        try {
          const event: WSEvent = JSON.parse(e.data);
          if (event.type === 'heartbeat') return;
          onMessageRef.current(event);
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setStatus('disconnected');
        wsRef.current = null;
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    };

    connectRef.current = connect;
    connect();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!wsRef.current || wsRef.current.readyState === WebSocket.CLOSED) {
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          backoffRef.current = BACKOFF_INITIAL;
          connect();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      wsRef.current?.close();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, role, enabled]);

  const send = useCallback((type: string, payload?: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { send, status };
}
