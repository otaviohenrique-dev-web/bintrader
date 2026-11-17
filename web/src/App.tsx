import { useState } from 'react';
import AegisTab from './components/AegisTab';
import AssetsTab from './components/AssetsTab';
import MathTab from './components/MathTab';

const TABS = [
  { id: 'aegis', label: 'AegisAI Alpha' },
  { id: 'assets', label: 'Ativos' },
  { id: 'math', label: 'Matemática' },
  { id: 'platform', label: 'Plataforma' },
] as const;

export default function App() {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('aegis');
  return (
    <div className="wrap">
      <h1>AegisAI Alpha</h1>
      <p className="sub">Laboratório de pesquisa para opções binárias · Deriv · somente leitura</p>
      <div className="banner">
        Modo pesquisa: este sistema só lê dados públicos e <b>não envia ordens</b>. Nenhum resultado aqui é
        recomendação de investimento; a maioria das estratégias não supera o payout.
      </div>
      <nav>
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'aegis' && <AegisTab />}
      {tab === 'assets' && <AssetsTab />}
      {tab === 'math' && <MathTab />}
      {tab === 'platform' && (
        <div className="card">
          <h2>Plataforma escolhida: Deriv</h2>
          <p>API oficial (WebSocket + REST), conta demo gratuita e dados públicos sem login. Detalhes e
            comparativo com IQ Option / Quotex / Pocket Option em <code>docs/01-plataforma.md</code>.</p>
          <p><b>Medido ao vivo:</b> EUR/USD 15 min paga 82,7% → empate em 54,7% de acerto. Índices
            "Volatility" pagam ~95%, mas são RNG: usados só como placebo.</p>
        </div>
      )}
    </div>
  );
}
