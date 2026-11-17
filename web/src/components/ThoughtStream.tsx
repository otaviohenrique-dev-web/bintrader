import { useEffect, useRef, useState } from 'react';
import type { Thought } from '../api';
import { hhmmss } from '../lib/format';

const KIND: Record<Thought['kind'], string> = {
  read: 'Leitura',
  weights: 'Pesos',
  decision: 'Decisão',
  tool: 'Hipótese',
  test: 'Teste',
  result: 'Resultado',
  verdict: 'Conclusão',
  version: 'Versão',
  system: 'Sistema',
};

const LIVE: Thought['kind'][] = ['read', 'weights', 'decision'];
const RESEARCH: Thought['kind'][] = ['tool', 'test', 'result', 'verdict', 'version'];

/** A linha de raciocínio da IA, em tempo real. */
export default function ThoughtStream({ items, height = 420, compact = false }: { items: Thought[]; height?: number; compact?: boolean }) {
  const [filter, setFilter] = useState<'all' | 'live' | 'research'>('all');
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const shown = items.filter((t) => filter === 'all' || (filter === 'live' ? LIVE.includes(t.kind) || t.kind === 'system' : RESEARCH.includes(t.kind)));

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  return (
    <div>
      {!compact && (
        <div className="seg" style={{ marginBottom: 12 }}>
          <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Tudo</button>
          <button className={filter === 'live' ? 'on' : ''} onClick={() => setFilter('live')}>Leitura e decisão</button>
          <button className={filter === 'research' ? 'on' : ''} onClick={() => setFilter('research')}>Pesquisa</button>
        </div>
      )}
      <div
        className="thoughts"
        ref={box}
        style={{ maxHeight: height }}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {shown.length === 0 && <div className="empty">Nada por aqui ainda. A IA começa a pensar na próxima vela.</div>}
        {shown.map((t) => (
          <div className={`thought k-${t.kind}`} key={t.id}>
            <time className="mono">{hhmmss(t.at)}</time>
            <span className="tk">{KIND[t.kind]}</span>
            <p>{t.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
