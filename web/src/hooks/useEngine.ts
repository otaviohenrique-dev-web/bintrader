import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Snapshot, type StreamEvent, type WatchItem } from '../api';
import { brlSigned, pct, price, sideLabel } from '../lib/format';

export interface Toast {
  id: number;
  kind: 'signal' | 'win' | 'loss' | 'void';
  title: string;
  body: string;
}

/**
 * Estado do motor: lista de ativos, snapshot do ativo selecionado, stream em tempo real (SSE)
 * e avisos (toasts) quando um sinal nasce ou é liquidado.
 */
export function useEngine() {
  const [watch, setWatch] = useState<WatchItem[]>([]);
  const [symbol, setSymbolState] = useState<string | null>(() => {
    try {
      return localStorage.getItem('aegis.symbol');
    } catch {
      return null;
    }
  });
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [flash, setFlash] = useState<'win' | 'loss' | null>(null);

  const seen = useRef<Map<string, string> | null>(null);
  const symRef = useRef<string | null>(symbol);
  symRef.current = symbol;
  const toastId = useRef(0);

  const pushToast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++toastId.current;
    setToasts((x) => [...x.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), 7000);
  }, []);

  const setSymbol = (s: string) => {
    setSymbolState(s);
    try {
      localStorage.setItem('aegis.symbol', s);
    } catch {
      /* ignore */
    }
  };

  const refreshWatch = useCallback(async () => {
    const w = await api.watchlist();
    setWatch(w);
    setSymbolState((cur) => (cur && w.some((i) => i.symbol === cur) ? cur : (w[0]?.symbol ?? null)));
    return w;
  }, []);

  useEffect(() => {
    refreshWatch().catch((e) => setError(e.message));
  }, [refreshWatch]);

  const load = useCallback(async () => {
    const sym = symRef.current;
    if (!sym) return;
    try {
      const s = await api.engine(sym);
      if (symRef.current !== sym) return;
      setSnap(s);
      setError(null);

      // avisos: só depois da primeira carga, para não "reabrir" histórico
      const prev = seen.current;
      const next = new Map(s.signals.map((x) => [x.id, x.status]));
      if (prev) {
        for (const x of s.signals) {
          const before = prev.get(x.id);
          const d = Math.max(5, x.entryPrice >= 100 ? 3 : 5);
          if (!before && x.status === 'open') {
            pushToast({
              kind: 'signal',
              title: `Novo sinal · ${sideLabel(x.side)}`,
              body: `${s.config.name} · confiança ${pct(x.confidence, 1).replace('%', ' pp')} · entrada ${price(x.entryPrice, d)}`,
            });
          } else if (before === 'open' && (x.status === 'win' || x.status === 'loss')) {
            pushToast({
              kind: x.status,
              title: x.status === 'win' ? 'Sinal encerrado · WIN' : 'Sinal encerrado · LOSS',
              body: `${s.config.name} · ${sideLabel(x.side)} · ${
                x.stake ? brlSigned(x.status === 'win' ? x.stake * x.payoutRatio : -x.stake) : 'sem valor'
              }`,
            });
            setFlash(x.status);
            setTimeout(() => setFlash(null), 1800);
          }
        }
      }
      seen.current = next;
    } catch (e) {
      setError((e as Error).message);
    }
  }, [pushToast]);

  // troca de ativo
  useEffect(() => {
    seen.current = null;
    setSnap(null);
    if (symbol) void load();
  }, [symbol, load]);

  // reserva: reconsulta a cada 30 s
  useEffect(() => {
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, [load]);

  // stream em tempo real
  useEffect(() => {
    const es = new EventSource('/api/stream');
    let timer: ReturnType<typeof setTimeout> | undefined;
    es.onopen = () => setOnline(true);
    es.onerror = () => setOnline(false);
    es.onmessage = (m) => {
      const e = JSON.parse(m.data) as StreamEvent;
      if (e.symbol !== symRef.current) return;
      if (e.type === 'tick') {
        setSnap((p) => {
          if (!p) return p;
          const c = p.candles.slice();
          const last = c[c.length - 1];
          const k = { ...e.candle, forming: true };
          if (last && last.time === k.time) c[c.length - 1] = k;
          else if (last && k.time > last.time) {
            c[c.length - 1] = { ...last, forming: false };
            c.push(k);
          }
          return { ...p, candles: c, nextCloseAt: k.time + p.config.granularity };
        });
      } else {
        clearTimeout(timer);
        timer = setTimeout(() => void load(), 250);
      }
    };
    return () => {
      clearTimeout(timer);
      es.close();
    };
  }, [load]);

  return {
    watch,
    symbol,
    setSymbol,
    snap,
    online,
    error,
    toasts,
    flash,
    dismissToast: (id: number) => setToasts((x) => x.filter((t) => t.id !== id)),
    reload: load,
    addWatch: async (s: string, select = true) => {
      const w = await api.addWatch(s);
      setWatch(w);
      if (select) setSymbol(s);
    },
    removeWatch: async (s: string) => {
      const w = await api.removeWatch(s);
      setWatch(w);
      if (symRef.current === s) setSymbol(w[0].symbol);
    },
  };
}
