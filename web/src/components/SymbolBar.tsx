import { useEffect, useRef, useState } from 'react';
import { api, type CatalogRow, type WatchItem } from '../api';
import { pct } from '../lib/format';
import Icon from './Icon';

interface Props {
  watch: WatchItem[];
  maxWatch: number;
  symbol: string | null;
  onSelect: (s: string) => void;
  onAdd: (s: string) => Promise<void>;
  onRemove: (s: string) => Promise<void>;
  right?: React.ReactNode;
}

export default function SymbolBar({ watch, maxWatch, symbol, onSelect, onAdd, onRemove, right }: Props) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<CatalogRow[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // só ativos compatíveis com a Aegis IA
  useEffect(() => {
    if (!open) return;
    api.catalog().then((c) => setList(c.rows.filter((r) => r.compatible))).catch((e) => setErr(e.message));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const have = new Set(watch.map((w) => w.symbol));
  const shown = list
    .filter((s) => !have.has(s.symbol) && (s.name + s.symbol).toLowerCase().includes(q.toLowerCase()))
    .slice(0, 40);

  const add = async (s: string) => {
    setBusy(true);
    setErr('');
    try {
      await onAdd(s);
      setOpen(false);
      setQ('');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="symbolbar">
      {watch.map((w) => (
        <button key={w.symbol} className={`chip-sym ${w.symbol === symbol ? 'on' : ''}`} onClick={() => onSelect(w.symbol)}>
          {w.symbol === symbol && <span className="dot" />}
          {w.name}
          {watch.length > 1 && (
            <span
              className="rm"
              role="button"
              aria-label={`Remover ${w.name}`}
              onClick={(e) => {
                e.stopPropagation();
                void onRemove(w.symbol);
              }}
            >
              <Icon name="x" size={13} />
            </span>
          )}
        </button>
      ))}
      {watch.length < maxWatch && (
        <div style={{ position: 'relative' }} ref={box}>
          <button className="btn-ghost" onClick={() => setOpen((o) => !o)}>
            <Icon name="plus" size={14} /> Ativo
          </button>
          {open && (
            <div className="popover">
              <input autoFocus placeholder="Buscar (ex.: GBP, NDX, USD)" value={q} onChange={(e) => setQ(e.target.value)} />
              <div className="list">
                {shown.map((s) => (
                  <button key={s.symbol} className="item" disabled={busy} onClick={() => void add(s.symbol)}>
                    <span>{s.name}</span>
                    <small>{s.payoutRatio ? `payout ${pct(s.payoutRatio, 0)}` : s.open ? '—' : 'fechado'}</small>
                  </button>
                ))}
                {shown.length === 0 && !err && <div className="note">{list.length ? 'Nada encontrado.' : 'Carregando ativos compatíveis…'}</div>}
              </div>
              {err && <div className="note down">{err}</div>}
              <div className="note">Só ativos compatíveis com a Aegis IA (M5 · 15 min). Até {maxWatch} ao mesmo tempo.</div>
            </div>
          )}
        </div>
      )}
      <div className="spacer">{right}</div>
    </div>
  );
}
