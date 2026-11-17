import { useState } from 'react';
import AegisTab from '../components/AegisTab';
import MathTab from '../components/MathTab';

const SUB = [
  { id: 'study', label: 'Estudo walk-forward' },
  { id: 'math', label: 'Matemática' },
  { id: 'platform', label: 'Plataforma' },
] as const;

export default function Lab() {
  const [sub, setSub] = useState<(typeof SUB)[number]['id']>('study');
  return (
    <>
      <div className="subnav">
        {SUB.map((s) => (
          <button key={s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSub(s.id)}>{s.label}</button>
        ))}
      </div>
      {sub === 'study' && <AegisTab />}
      {sub === 'math' && <MathTab />}
      {sub === 'platform' && (
        <section className="card">
          <div className="card-h"><h2>Plataforma: Deriv</h2></div>
          <p>API oficial (WebSocket e REST), conta demo gratuita e dados públicos sem login. O comparativo com IQ Option, Quotex e Pocket Option está em <code>docs/01-plataforma.md</code>.</p>
          <p>Os ativos compatíveis com a Aegis IA ficam na aba <b>Ativos</b>. Os índices "Volatility" pagam ~95%, mas são gerados por um sorteador de números aleatórios e servem só como grupo de controle.</p>
        </section>
      )}
    </>
  );
}
