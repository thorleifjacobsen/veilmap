// lib/ws-client.ts
'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { WSMessage } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export function useSessionWS(slug: string, role: 'gm' | 'player', onMessage: (msg: WSMessage) => void) {
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    ws.current = new WebSocket(`${WS_URL}/ws?slug=${slug}&role=${role}`);

    ws.current.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* ignore parse errors */ }
    };

    ws.current.onclose = () => {
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };
  }, [slug, role, onMessage]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      ws.current?.close();
    };
  }, [connect]);

  const send = useCallback((msg: WSMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg));
    }
  }, []);

  return { send };
}
