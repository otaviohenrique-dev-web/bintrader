import { useEffect, useState } from 'react';
import { api, type AiInfo, type PaceStats, type Snapshot } from '../api';
import BenchTab from '../components/BenchTab';
import ContribBars from '../components/ContribBars';
import Icon from '../components/Icon';
import ThoughtStream from '../components/ThoughtStream';
import Lab from './Lab';
import { AgentMark } from '../components/Logo';
import { useLocalState, useNow } from '../hooks/hooks';
import { ago, bytes, dayMonth, dayTime, int, pct } from '../lib/format';

const SUB = [
  { id: 'overview', label: 'Visão geral' },
  { id: 'reasoning', label: 'Raciocínio ao vivo' },
  { id: 'bench', label: 'Bancada' },
  { id: 'how', label: 'Como decide' },
  { id: 'learn', label: 'Como aprende' },
  { id: 'memory', label: 'Memória e limites' },
  { id: 'swot', label: 'Forças e fraquezas' },
  { id: 'lab', label: 'Laboratório' },
] as const;
type Sub = (typeof SUB)[number]['id'];

function Wr({ v, be }: { v: { n: number; winRate: number } | null; be: number }) {
  if (!v) return <span className="muted">—</span>;
  return (
    <span className="mono">
      <span className={v.winRate > be ? 'up' : 'down'}>{pct(v.winRate)}</span> <small>n={int(v.n)}</small>
    </span>
  );
}

function PaceCard({ p, title }: { p: PaceStats | null; title: string }) {
  if (!p) return <div className="tile"><div className="eyebrow">{title}</div><div className="s" style={{ marginTop: 10 }}>Poucos sinais para medir.</div></div>;
  const biased = p.callPct < 0.35 || p.callPct > 0.65;
  return (
    <div className="tile">
      <div className="eyebrow">{title}</div>
      <div className="pace">
        <div><b className="mono">{pct(p.inPositionPct, 0)}</b><span>do tempo posicionada</span></div>
        <div><b className="mono">{pct(p.backToBackPct, 0)}</b><span>sinais emendados</span></div>
        <div><b className="mono">{p.avgIdleMin.toFixed(0)} min</b><span>espera média</span></div>
        <div><b className={`mono ${biased ? 'warn' : ''}`}>{pct(p.callPct, 0)}</b><span>são de alta{biased ? ' · viés' : ''}</span></div>
      </div>
      <div className="s" style={{ marginTop: 8 }}>{int(p.n)} sinais analisados</div>
    </div>
  );
}

function Strength({ tone, title, children }: { tone: 'good' | 'bad'; title: string; children: React.ReactNode }) {
  return (
    <div className="swot-item">
      <span className={`swot-ic ${tone}`}><Icon name={tone === 'good' ? 'check' : 'x'} size={13} /></span>
      <div><b>{title}</b><p>{children}</p></div>
    </div>
  );
}

export default function AegisIA({ snap }: { snap: Snapshot }) {
  const [storedSub, setSub] = useLocalState<string>('aegis.ai.sub', 'overview');
  const sub: Sub = SUB.some((x) => x.id === storedSub) ? (storedSub as Sub) : 'overview';
  const [info, setInfo] = useState<AiInfo | null>(null);
  const now = useNow(30_000);
  const L = snap.learning;
  const retro = snap.stats.retro;
  const lim = info?.limits;

  useEffect(() => {
    api.ai().then(setInfo).catch(() => {});
  }, [snap.learning.historyCandles, snap.learning.retrains]);

  const maxW = Math.max(0.0001, ...L.weights.map((w) => Math.abs(w.weight)));
  const progress = Math.min(100, (L.historyCandles / L.historyTarget) * 100);
  const adjusted = Math.abs(L.threshold - L.baseThreshold) > 1e-9;

  return (
    <>
      <section className="card hero">
        <div className="hero-mark"><AgentMark size={84} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="eyebrow">Agente do OrderFlow Lab</div>
          <h1 className="hero-name">Aegis IA <span className="mono gold">{snap.version.label}</span> <span className="status-chip gold" style={{ verticalAlign: 'middle' }}><i />Alpha</span> <span className="status-chip" style={{ verticalAlign: 'middle' }}>build {int(snap.builds)}</span></h1>
          <p className="hero-sub">O agente que lê o mercado, sinaliza o próximo movimento e presta contas de cada acerto e cada erro.</p>
        </div>
      </section>

      <div className="subnav">
        {SUB.map((s) => <button key={s.id} className={sub === s.id ? 'on' : ''} onClick={() => setSub(s.id)}>{s.label}</button>)}
      </div>

      {sub === 'overview' && (
        <>
          <section className="card">
            <div className="card-h"><h2>Quem é e onde ele vive</h2></div>
            <div className="prose">
              <p>A Aegis IA <b>roda no seu computador</b>, dentro do servidor do OrderFlow Lab. Não existe nuvem, GPU nem servidor de terceiros: ela só conversa com a Deriv para ler preços. A cada vela de 5 minutos fechada, estima a chance de o preço estar acima ou abaixo daqui a 15 minutos.</p>
              <p>Só emite sinal quando a leitura passa de um limiar de confiança. Depois do vencimento, <b>liquida com o preço real</b> e atualiza a própria taxa de acerto. É esse histórico, e não a promessa de lucro, que mede se ela presta.</p>
              <p><b>Alpha</b> é a fase de testes internos: já funciona de ponta a ponta, mas ainda não tem vantagem comprovada. <b>Beta</b> viria depois, com validação mais ampla. O <b>1.1</b> é a geração do modelo: 1.0 era o estudo de laboratório; 1.1 adicionou sinais ao vivo, aprendizado contínuo e carteira.</p>
            </div>
          </section>

          <div className="tiles">
            <div className="tile">
              <div className="eyebrow">Histórico aprendido</div>
              <div className="v mono">{int(L.historyCandles)}</div>
              <div className="s">velas{L.historyFrom && L.historyTo ? ` · ${dayMonth(L.historyFrom)} → ${dayMonth(L.historyTo)}` : ''}</div>
              <div className="bar"><i style={{ width: `${progress}%` }} /></div>
              <div className="s" style={{ marginTop: 6 }}>{L.exhausted ? 'Histórico completo da Deriv' : `${progress.toFixed(0)}% da meta de ${int(L.historyTarget)}`}</div>
            </div>
            <div className="tile">
              <div className="eyebrow">Retreinos</div>
              <div className="v mono">{int(L.retrains)}</div>
              <div className="s">{L.lastTrainAt ? `último ${ago(L.lastTrainAt, now)}` : 'ainda não treinou'}</div>
              <div className="s" style={{ marginTop: 6 }}>Janela de {int(L.trainWindow)} velas · {int(L.samples)} amostras</div>
            </div>
            <div className="tile">
              <div className="eyebrow">Seletividade</div>
              <div className="v mono">{(L.threshold * 100).toFixed(0)} <small className="muted" style={{ fontSize: 14 }}>pp</small></div>
              <div className="s">{adjusted ? `ajustada a partir de ${(L.baseThreshold * 100).toFixed(0)} pp` : 'no valor base'}</div>
              <div className="s" style={{ marginTop: 6 }}>Só entra se a probabilidade fugir de 50% por isso</div>
            </div>
            <div className="tile">
              <div className="eyebrow">Validação retroativa</div>
              <div className="v mono">{retro ? pct(retro.winRate) : snap.running ? '…' : '—'}</div>
              <div className="s">{retro ? `${int(retro.n)} operações fora da amostra` : 'calculando em segundo plano'}</div>
              <div className="s" style={{ marginTop: 6 }}>Empate exige {pct(snap.breakEven)}</div>
            </div>
          </div>

          <section className="card">
            <div className="card-h"><h2>Ritmo de operação</h2></div>
            <div className="tiles" style={{ marginBottom: 0 }}>
              <PaceCard p={snap.pace.live} title="Ao vivo" />
              <PaceCard p={snap.pace.retro} title="Retroativo" />
            </div>
            <p className="caption">
              <b>Por que ela opera uma atrás da outra?</b> A regra permite: 1 posição por ativo, sem pausa obrigatória, então ao vencer um sinal ela já pode abrir o próximo. Isso <b>não é uma decisão de timing</b>. É consequência do limiar baixo ({(L.baseThreshold * 100).toFixed(0)} pp): a leitura raramente fica perto de 50%, então ela vive posicionada. Se a maioria dos sinais vai para o mesmo lado, isso indica viés, não convicção.
            </p>
          </section>
        </>
      )}

      {sub === 'reasoning' && (
        <div className="two">
          <section className="card">
            <div className="card-h">
              <h2>Linha de raciocínio</h2>
              <span className="status-chip up"><i />ao vivo</span>
            </div>
            <p className="sub" style={{ marginTop: -6 }}>Tudo o que a Aegis IA lê, pesa, testa e decide aparece aqui, na hora em que acontece.</p>
            <ThoughtStream items={snap.thoughts} height={560} />
          </section>
          <div className="col">
            <section className="card">
              <div className="card-h"><h2>Por que esta leitura?</h2></div>
              <ContribBars explain={snap.explain} limit={9} />
              <p className="caption">Cada barra é o peso do indicador vezes o valor dele agora. A soma, mais o viés do modelo, vira a probabilidade. É a conta inteira, sem caixa-preta.</p>
            </section>
            <section className="card">
              <div className="card-h"><h2>Ferramentas em uso</h2></div>
              <div className="rules">
                <span>Tempo gráfico {snap.toolkit.label.split(' · ')[0]}</span>
                <span>Expira em {snap.toolkit.durationMin} min</span>
                {snap.toolkit.groups.map((g) => <span key={g}>{g === 'mom' ? 'Momento' : g === 'trend' ? 'Tendência' : g === 'vol' ? 'Volatilidade' : g === 'cal' ? 'Calendário' : 'Extras'}</span>)}
              </div>
              <p className="caption">A bancada testa outras combinações o tempo todo e só troca esta se a nova passar numa prova com dados que ela nunca viu. Veja em <b>Bancada</b>.</p>
              <button className="btn-link" onClick={() => setSub('bench')}>Abrir a bancada →</button>
            </section>
          </div>
        </div>
      )}

      {sub === 'bench' && <BenchTab snap={snap} />}

      {sub === 'lab' && <Lab />}

      {sub === 'how' && (
        <>
          <section className="card">
            <div className="card-h"><h2>Do preço ao sinal, em 5 passos</h2></div>
            <ol className="steps">
              <li><b>Lê</b><p>Pega as últimas velas fechadas (M5) do ativo. A vela em formação é ignorada para não decidir com dado incompleto.</p></li>
              <li><b>Calcula 15 sinais</b><p>Variação em 4 janelas, RSI, MACD, Bollinger, médias, estocástico, formato da vela, volatilidade e hora do dia. Todos normalizados pela volatilidade (ATR).</p></li>
              <li><b>Estima</b><p>Uma regressão logística transforma os 15 números em uma probabilidade de alta. Cada peso pode ser visto abaixo.</p></li>
              <li><b>Decide</b><p>Se a probabilidade passa de 50% ± o limiar, abre sinal de alta ou baixa. Senão, não faz nada. Uma posição por ativo.</p></li>
              <li><b>Liquida e registra</b><p>No vencimento compara o preço de saída com o de entrada. Empate perde. O resultado vai para o histórico e para a banca fictícia.</p></li>
            </ol>
          </section>

          <section className="card">
            <div className="card-h"><h2>O que a IA está olhando</h2><span className="muted" style={{ fontSize: 12 }}>peso no modelo atual</span></div>
            {L.weights.length === 0 && <div className="empty">Treinando…</div>}
            {[...L.weights].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).map((w) => (
              <div className="w-row" key={w.feature}>
                <span>{w.feature}</span>
                <div className="w-bar">
                  <i style={{ background: w.weight >= 0 ? 'var(--up)' : 'var(--down)', width: `${(Math.abs(w.weight) / maxW) * 50}%`, left: w.weight >= 0 ? '50%' : undefined, right: w.weight < 0 ? '50%' : undefined }} />
                </div>
                <span className="mono" style={{ textAlign: 'right' }}>{w.weight.toFixed(2).replace('.', ',')}</span>
              </div>
            ))}
            <p className="caption">Verde empurra para alta, vermelho para baixa. Pesos pequenos e espalhados indicam pouco sinal claro, o esperado em mercado eficiente. Um peso dominante (como a hora do dia) merece desconfiança.</p>
          </section>

          <section className="card">
            <div className="card-h"><h2>Acerto por nível de confiança</h2></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Faixa</th><th>Retroativo</th><th>Ao vivo</th></tr></thead>
                <tbody>{L.bands.map((b) => <tr key={b.label}><td>{b.label}</td><td><Wr v={b.retro} be={snap.breakEven} /></td><td><Wr v={b.live} be={snap.breakEven} /></td></tr>)}</tbody>
              </table>
            </div>
            <p className="caption">Com vantagem real, o acerto deveria subir junto com a confiança. Verde = acima do empate ({pct(snap.breakEven)}). Faixas com poucas operações não dizem nada.</p>
          </section>
        </>
      )}

      {sub === 'learn' && (
        <>
          <section className="card">
            <div className="card-h"><h2>Três jeitos de aprender</h2></div>
            <div className="how">
              <div><h3>Para trás</h3><p>Baixa até {int(lim?.maxHistory ?? 30000)} velas de histórico, em lotes de {int(lim?.backfillChunk ?? 2000)} a cada {lim?.backfillEverySec ?? 15} s, e revalida a estratégia em janelas do passado, sempre testando só no futuro de cada janela. Mais histórico torna a estimativa de acerto mais confiável. Não torna o modelo mais esperto.</p></div>
              <div><h3>Para frente</h3><p>A cada {lim?.retrainEveryCandles ?? 12} velas (1 h de mercado) ela retreina com as {int(lim?.trainWindow ?? 2000)} velas mais recentes. Cada vela que fecha vira um exemplo a mais, inclusive o desfecho dos sinais que ela mesma deu.</p></div>
              <div><h3>Com os resultados</h3><p>Se os últimos {lim?.adaptWindow ?? 40} sinais ficam abaixo do ponto de empate, ela exige mais confiança para entrar (+1 pp por vez, até {((lim?.thresholdMax ?? 0.12) * 100).toFixed(0)} pp). Se melhoram, relaxa de volta. Ajuste pequeno e limitado.</p></div>
            </div>
          </section>
          <section className="card">
            <div className="card-h"><h2>Linha do tempo do aprendizado</h2></div>
            <ul className="timeline">
              {[...snap.events].reverse().map((e, i) => <li key={`${e.at}-${i}`}><span className={`ev ${e.kind}`} /><span>{e.text}</span><time>{dayTime(e.at)}</time></li>)}
            </ul>
          </section>
        </>
      )}

      {sub === 'memory' && (
        <>
          <section className="card">
            <div className="card-h"><h2>Se você desligar o computador</h2><span className="status-chip up"><i />progresso preservado</span></div>
            <div className="prose">
              <p>Nada se perde. Sinais, resultados, banca, aprendizado, validações, hipóteses da bancada, versões e a linha de raciocínio são gravados em arquivos a cada vela e ao desligar o servidor.</p>
              <p>Ao ligar de novo, a Aegis IA <b>lê esses arquivos</b>, <b>baixa as velas que faltaram</b>, <b>liquida com o preço real os sinais que venceram enquanto você estava fora</b> e retreina para seguir de onde parou. As gravações são atômicas e têm cópia de segurança (<span className="mono">.bak</span>), então uma queda de energia no meio de uma gravação não corrompe nada. Uma trava também impede que duas cópias do sistema escrevam nos mesmos arquivos.</p>
            </div>
            <div className="mini" style={{ marginTop: 12 }}>
              <div><div className="k">Última atividade gravada</div><div className="v mono">{snap.lastSeen ? ago(snap.lastSeen, now) : '—'}</div></div>
              <div><div className="k">Última retomada</div><div className="v mono">{snap.resume ? `após ${Math.max(1, Math.round(snap.resume.offlineSec / 60))} min` : 'sem pausa longa'}</div></div>
              <div><div className="k">Sinais liquidados na retomada</div><div className="v mono">{snap.resume ? snap.resume.settled : 0}</div></div>
              <div><div className="k">Builds acumuladas</div><div className="v mono">{int(snap.builds)}</div></div>
            </div>
          </section>
          <section className="card flush">
            <div className="card-h" style={{ padding: '16px 18px 0' }}><h2>Onde ela guarda as informações</h2><span className="muted mono" style={{ fontSize: 12 }}>{info?.dataDir ?? 'server/data'}/</span></div>
            <p className="sub" style={{ padding: '0 18px' }}>Tudo fica em arquivos locais no seu computador e sobrevive a reinícios. Nada é enviado para fora.</p>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Arquivo</th><th>O que guarda</th><th className="r">Tamanho</th><th className="r">Atualizado</th></tr></thead>
                <tbody>
                  {(info?.storage ?? []).map((f) => <tr key={f.file}><td className="mono">{f.file}</td><td>{f.purpose}</td><td className="r mono">{bytes(f.bytes)}</td><td className="r mono">{ago(f.updatedAt, now)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </section>
          <section className="card">
            <div className="prose">
              <p><b>O que NÃO é salvo:</b> os pesos do modelo. Ele é recriado a partir das velas guardadas toda vez que o servidor liga (leva poucos segundos). Isso evita guardar um modelo velho e garante que ele sempre reflete o histórico atual.</p>
              <p><b>Memória curta de propósito:</b> o modelo só enxerga as últimas {int(L.trainWindow)} velas (~7 dias de mercado). O histórico maior serve para validar, não para treinar.</p>
            </div>
          </section>
          <section className="card flush">
            <div className="card-h" style={{ padding: '16px 18px 0' }}><h2>Limites</h2></div>
            <div className="table-wrap">
              <table>
                <tbody>
                  <tr><td>Histórico por ativo</td><td className="mono">{int(lim?.maxHistory ?? 30000)} velas</td><td><small>≈ 5 meses de forex em M5</small></td></tr>
                  <tr><td>Janela de treino</td><td className="mono">{int(lim?.trainWindow ?? 2000)} velas</td><td><small>≈ 7 dias de mercado</small></td></tr>
                  <tr><td>Retreino</td><td className="mono">a cada {lim?.retrainEveryCandles ?? 12} velas</td><td><small>1 hora em M5</small></td></tr>
                  <tr><td>Revalidação (walk-forward)</td><td className="mono">a cada {lim?.revalidateEveryCandles ?? 48} velas</td><td><small>4 horas, e ao completar o histórico</small></td></tr>
                  <tr><td>Ativos monitorados</td><td className="mono">até {info?.maxWatch ?? 6}</td><td><small>só ativos compatíveis (M5 · 15 min)</small></td></tr>
                  <tr><td>Posições abertas</td><td className="mono">1 por ativo</td><td><small>sem sobreposição</small></td></tr>
                  <tr><td>Seletividade</td><td className="mono">{((lim?.thresholdBase ?? 0.03) * 100).toFixed(0)} a {((lim?.thresholdMax ?? 0.12) * 100).toFixed(0)} pp</td><td><small>passo de 1 pp a cada {lim?.adaptStepEvery ?? 20} sinais novos</small></td></tr>
                  <tr><td>Sinais guardados</td><td className="mono">{int(lim?.maxSignalsStored ?? 5000)} por ativo</td><td><small>os mais antigos saem primeiro</small></td></tr>
                  <tr><td>Frescor do dado</td><td className="mono">{lim?.freshSec ?? 90} s</td><td><small>não emite sinal sobre dado mais velho</small></td></tr>
                  <tr><td>Expiração e vela</td><td className="mono">15 min · M5</td><td><small>fixos nesta versão</small></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {sub === 'swot' && (
        <div className="two">
          <section className="card">
            <div className="card-h"><h2>Pontos fortes</h2></div>
            <Strength tone="good" title="Transparente">Modelo simples, com 15 pesos que você enxerga. Não é caixa-preta: dá para explicar cada sinal.</Strength>
            <Strength tone="good" title="Honesta consigo mesma">Valida só no futuro de cada janela, testa contra dados aleatórios (placebo) e contra edge plantado, e mostra intervalo de confiança. Não declara vantagem com amostra pequena.</Strength>
            <Strength tone="good" title="Presta contas">Cada sinal é liquidado com preço real e gravado em disco. A taxa de acerto vem desse histórico, não de promessa.</Strength>
            <Strength tone="good" title="Leve e rápida">Roda em um notebook, retreina em frações de segundo, sem GPU e sem nuvem.</Strength>
            <Strength tone="good" title="Segura">Somente leitura: não envia ordens e usa dinheiro fictício. O pior erro dela custa zero.</Strength>
            <Strength tone="good" title="Adapta-se">Retreina a cada hora e ajusta a seletividade com os próprios resultados.</Strength>
          </section>
          <section className="card">
            <div className="card-h"><h2>Fraquezas</h2></div>
            <Strength tone="bad" title="Sem vantagem comprovada">Hoje acerta {retro ? pct(retro.winRate) : '—'} contra {pct(snap.breakEven)} necessários para empatar. Resultado bom em poucos sinais ao vivo é sorte.</Strength>
            <Strength tone="bad" title="Só enxerga o preço">Usa apenas candles. Sem volume, livro de ofertas, notícias ou calendário. O "order flow" do nome é a meta, não o que ela lê hoje.</Strength>
            <Strength tone="bad" title="Modelo linear">Soma pesos. Não captura padrões que dependem da combinação de fatores.</Strength>
            <Strength tone="bad" title="Hora do dia pesa demais">Pode estar decorando a tendência da última semana, o que gera viés para um lado só.</Strength>
            <Strength tone="bad" title="Quase sempre posicionada">Limiar baixo faz ela operar uma atrás da outra, sem esperar o melhor momento.</Strength>
            <Strength tone="bad" title="Memória curta">Só treina nos últimos ~7 dias. Esquece regimes antigos e reage tarde a mudanças.</Strength>
            <Strength tone="bad" title="Simulação otimista">Assume entrada no fechamento da vela. Na vida real há atraso e o payout muda ao longo do dia.</Strength>
            <Strength tone="bad" title="O jogo é contra ela">A corretora cobra de ~1 a 9 pontos percentuais (conforme o ativo). Acertar mais do que erra não basta.</Strength>
          </section>
        </div>
      )}
    </>
  );
}
