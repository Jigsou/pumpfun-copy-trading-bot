import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '@/lib/demoStore';
import { translateText } from '@/lib/demoShared';
import type { DemoState } from '@/lib/demoShared';

const WS_URL = 'ws://127.0.0.1:3001';

export function useDemoSettings() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useDemoServer() {
  const [serverUp, setServerUp] = useState(false);
  const [state, setState] = useState<DemoState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        setServerUp(true);
        ws.send(JSON.stringify({ type: 'demo_hello' }));
      };
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'demo_state') setState(msg.state as DemoState);
          else if (msg.type === 'demo_error') setError(translateText(String(msg.message)));
        } catch {
          // ignored message
        }
      };
      ws.onclose = () => {
        setServerUp(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      wsRef.current?.close();
    };
  }, []);

  const send = useCallback((obj: object): boolean => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(obj));
      return true;
    }
    setError('Local server unreachable. Start the project with npm.cmd start.');
    return false;
  }, []);

  return { serverUp, state, error, setError, send };
}

export type DemoServer = ReturnType<typeof useDemoServer>;
