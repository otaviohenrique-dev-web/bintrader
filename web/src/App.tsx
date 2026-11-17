import { useEffect, useState } from 'react';
import Icon from './components/Icon';
import { Brand } from './components/Logo';
import SymbolBar from './components/SymbolBar';
import Toasts from './components/Toasts';
import { useLocalState } from './hooks/hooks';
import { useEngine } from './hooks/useEngine';
import { brl, brlSigned, int } from './lib/format';
import { TABS, type Tab } from './lib/tabs';
import AegisIA from './pages/AegisIA';
import Assets from './pages/Assets';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Plan from './pages/Plan';

function Clock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock mono muted">{t.toLocaleTimeString('pt-BR')}</span>;
}

export default function App() {
  const [stored, setTab] = useLocalState<Tab>('aegis.tab', 'panel');
  const tab: Tab = TABS.some((t) => t.id === stored) ? stored : 'panel';
  const eng = useEngine();
  const { snap } = eng;
  const needsSymbol = tab === 'panel' || tab === 'history' || tab === 'ai' || tab === 'plan';
  const MAX_WATCH = 6;

  return (
    <div className="app">
      <header className="topbar">
        <Brand />
        <span className="brand-tag"><i />Aegis IA {snap?.version.label ?? '1.10'} · Alpha · em testes</span>
        <nav className="tabs" aria-label="Seções">
          {TABS.map((t) => (
            <button key={t.id} className={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={15} />
              <span className="tl">{t.label}</span>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <a
            className="deriv-link"
            href="https://dtrader.deriv.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir a Deriv Trader em uma nova aba (entre na sua conta demo)"
          >
            <Icon name="ext" size={14} />
            <span>Deriv</span>
          </a>
          {snap && (
            <button className="wallet-chip" onClick={() => setTab('panel')} title="Banca fictícia (simulação)">
              <span className="wc-l">Banca fictícia</span>
              <span className="mono">{brl(snap.wallet.balance)}</span>
              <span className={`mono wc-d ${snap.wallet.pnl >= 0 ? 'up' : 'down'}`}>{brlSigned(snap.wallet.pnl)}</span>
            </button>
          )}
          <span className={`conn ${eng.online ? 'on' : ''}`}><i /><span>{eng.online ? 'Ao vivo' : 'Reconectando'}</span></span>
          <Clock />
        </div>
      </header>

      <main className="page">
        {needsSymbol && (
          <SymbolBar
            watch={eng.watch}
            maxWatch={MAX_WATCH}
            symbol={eng.symbol}
            onSelect={eng.setSymbol}
            onAdd={eng.addWatch}
            onRemove={eng.removeWatch}
            right={snap?.ready ? <span>{int(snap.candles.length)} velas no gráfico</span> : null}
          />
        )}

        {eng.error && !snap && needsSymbol && (
          <div className="card boot">
            <div>
              <div className="down" style={{ fontWeight: 600, marginBottom: 6 }}>Não consegui falar com a API</div>
              <div className="muted">{eng.error}</div>
              <div className="muted" style={{ marginTop: 6 }}>Confirme se o servidor está rodando (<code>npm run dev</code>).</div>
            </div>
          </div>
        )}

        {tab === 'assets' && <Assets watch={eng.watch} maxWatch={MAX_WATCH} onAdd={eng.addWatch} onRemove={eng.removeWatch} />}

        {needsSymbol && !eng.error && (!snap || !snap.ready) && (
          <div className="card boot">
            <div>
              <div className="spin" />
              <div style={{ fontWeight: 600 }}>Preparando a Aegis IA</div>
              <div className="muted" style={{ marginTop: 4 }}>
                {snap?.error ?? 'Baixando histórico da Deriv e treinando o modelo. Leva alguns segundos.'}
              </div>
            </div>
          </div>
        )}

        {needsSymbol && snap?.ready && (
          <>
            {tab === 'panel' && <Dashboard snap={snap} flash={eng.flash} onNavigate={setTab} onReload={() => void eng.reload()} />}
            {tab === 'history' && <History snap={snap} />}
            {tab === 'ai' && <AegisIA snap={snap} />}
            {tab === 'plan' && <Plan snap={snap} />}
          </>
        )}
      </main>

      <footer className="footer">
        OrderFlow Lab · Aegis IA Alpha está em fase de testes. Os sinais são estimativas estatísticas, sem garantia
        de resultado e sem envio de ordens. A banca é fictícia. Opções binárias têm alto risco de perda total.
      </footer>

      <nav className="bottomnav" aria-label="Seções">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <Toasts toasts={eng.toasts} onDismiss={eng.dismissToast} />
    </div>
  );
}
