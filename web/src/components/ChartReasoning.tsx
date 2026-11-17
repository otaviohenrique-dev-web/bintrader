import type { Snapshot } from '../api';
import { useLocalState } from '../hooks/hooks';
import { hhmmss, pct } from '../lib/format';
import ContribBars from './ContribBars';
import Icon from './Icon';

/**
 * Raciocínio da IA desenhado em cima do próprio gráfico: o que ela leu agora, o que pesou
 * e o que decidiu. Recolhível (no celular começa recolhido, como uma linha só).
 */
export default function ChartReasoning({ snap }: { snap: Snapshot }) {
  const [mode, setMode] = useLocalState<'open' | 'closed'>('aegis.chart.reasoning', typeof window !== 'undefined' && window.innerWidth < 700 ? 'closed' : 'open');
  const th = snap.thoughts;
  const last = (kinds: string[]) => [...th].reverse().find((t) => kinds.includes(t.kind));
  const read = last(['read']);
  const decision = last(['decision']);
  const lines = [decision, read].filter((t): t is NonNullable<typeof t> => !!t);
  const open = mode === 'open';

  return (
    <div className={`chart-reason ${open ? 'open' : 'closed'}`}>
      <button className="cr-head" onClick={() => setMode(open ? 'closed' : 'open')} aria-expanded={open}>
        <span className="live-dot" />
        <span>Raciocínio ao vivo</span>
        {snap.explain && <b className="mono cr-prob">{pct(snap.explain.prob, 1)} alta</b>}
        <span className="chev" style={{ transform: open ? 'rotate(180deg)' : undefined }}><Icon name="chev" size={14} /></span>
      </button>

      {!open && (decision ?? read) && <div className="cr-sum">{(decision ?? read)!.text}</div>}

      {open && (
        <div className="cr-body">
          <ContribBars explain={snap.explain} limit={3} compact />
          <div className="thoughts compact" style={{ marginTop: 10 }}>
            {lines.map((t) => (
              <div className={`thought k-${t.kind}`} key={t.id}>
                <time className="mono">{hhmmss(t.at)}</time>
                <p>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
