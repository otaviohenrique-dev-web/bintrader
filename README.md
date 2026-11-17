# OrderFlow Lab · Aegis IA (Alpha)

> **OrderFlow Lab** é a plataforma; **Aegis IA** é o agente. Ele lê o mercado a cada vela, sinaliza no gráfico o próximo movimento provável e mostra, com matemática honesta, **se realmente acerta mais do que o necessário para empatar**. Tem até uma banca fictícia em R$ que sobe e desce com cada sinal.

![status](https://img.shields.io/badge/status-em%20testes-orange)
![modo](https://img.shields.io/badge/modo-sinais%20%C2%B7%20sem%20ordens-blue)
![node](https://img.shields.io/badge/node-%E2%89%A5%2022-339933)

> ## Projeto em fase de testes (alpha)
> - O sistema **está em testes** e muda com frequência. Não use como base de decisão financeira.
> - Ele **só lê dados públicos da Deriv e emite sinais**. **Não envia nenhuma ordem**, nem demo, nem real.
> - Os resultados atuais mostram **ausência de vantagem** (veja abaixo). Isso é um resultado válido, não um bug.
> - Nada aqui é recomendação de investimento. Opções binárias têm alto risco de perda total.

## O que é

A **Aegis IA** acompanha ativos da [Deriv](https://developers.deriv.com/) em tempo real. A cada vela fechada ele estima a probabilidade de o preço estar mais alto ou mais baixo no vencimento (padrão: velas de 5 min, expiração de 15 min). Quando a leitura passa de um limiar de confiança, emite um **sinal**, marca no gráfico, acompanha até o vencimento e registra **WIN ou LOSS** com o preço real.

A IA mantém uma **taxa de acerto** própria, sempre comparada com o ponto de empate (com payout de ~80%, é preciso acertar ~55% só para não perder), com intervalo de confiança de 95% e um selo que diz o que dá para concluir.

## Como a IA aprende

| Direção | O que acontece |
|---|---|
| **Para trás** | Baixa até 30 mil velas de histórico, em lotes, e revalida a estratégia em walk-forward (treina no passado, testa só no futuro de cada janela). Mais histórico = estimativa de acerto mais confiável. |
| **Para frente** | A cada hora de mercado retreina com as velas novas. Cada vela que fecha vira um exemplo a mais, inclusive o desfecho dos sinais que ela mesma deu. |
| **Com os resultados** | Se os últimos sinais ficam abaixo do empate, exige mais confiança para entrar; se melhoram, relaxa. Ajuste pequeno e limitado. |

## Resultado atual (EUR/USD, M5, expiração 15 min, 30 mil velas)

| | Acerto | Empate exige | Veredito |
|---|---|---|---|
| Retroativo, fora da amostra (7.396 operações) | 51,1% | ~55,9% | **abaixo do empate** |
| Placebo (passeio aleatório) | ~50% | ~55% | sem vantagem (esperado) |

## Interface

- **Painel**: gráfico de velas profissional com os sinais (seta, confiança, WIN/LOSS e linha do preço de entrada), cartão do agente, sinal atual com contagem regressiva, **banca fictícia em R$** e a taxa de acerto da IA (ao vivo e retroativa).
- **Histórico**: todos os sinais com resultado em R$, filtros por resultado e direção, evolução da banca.
- **Aegis IA**: a página do protagonista: quem é, como decide, como aprende, onde guarda a memória, limites, forças e fraquezas, e o ritmo de operação (tempo posicionada, sinais emendados, viés).
- **Plano**: informe o saldo e a IA recomenda o valor de cada entrada, os stops do dia e as melhores janelas de horário, com a esperança matemática sempre à vista.
- **Ativos**: só os ativos **compatíveis** com a IA (Rise/Fall de 15 min, velas M5, payout ≥ 65%, histórico suficiente), com nota, payout, ponto de empate e botão para monitorar. Os descartados aparecem com o motivo.
- **Raciocínio ao vivo e Bancada** (dentro de *Aegis IA*): a linha de raciocínio em tempo real, o porquê de cada leitura, e a pesquisa contínua de ferramentas (tempos gráficos, expirações e indicadores) com cofre, critério corrigido e linha de versões.
- **Laboratório** (dentro de *Aegis IA*): estudo walk-forward com placebo, calculadora de matemática e a decisão da plataforma.
- Avisos em tempo real (novo sinal, resultado), gráfico atualizado via SSE e layout de app no celular (navegação inferior, áreas seguras do iPhone, instalável na tela inicial).

### Banca fictícia (R$)

Começa em R$ 1.000,00 e acompanha o mercado real: cada sinal liquidado **soma** (WIN: valor × payout) ou **subtrai** (LOSS: o valor) da banca. O valor por sinal é 1% da banca (ajustável, ou fixo em R$). É simulação; nenhum dinheiro real é tocado.

## Documentação

- [`docs/01-plataforma.md`](docs/01-plataforma.md): por que Deriv
- [`docs/02-aegis-ia.md`](docs/02-aegis-ia.md): dossiê completo da IA
- [`docs/03-identidade-visual.md`](docs/03-identidade-visual.md): marca, cores, fontes e mobile
- [`docs/04-uso-e-persistencia.md`](docs/04-uso-e-persistencia.md): uso diário, retomada após desligar o PC, backup

## Como rodar

Requisitos: Node.js 22+ e npm.

```bash
git clone https://github.com/otaviohenrique-dev-web/bintrader.git
cd bintrader
npm install
npm start        # tudo em http://localhost:3001 (ou npm run dev para desenvolver)
```

- Dashboard: <http://localhost:5173>
- API: <http://localhost:3001>

Na primeira vez o motor leva alguns segundos para baixar histórico e treinar; o restante do histórico vem em segundo plano. O estado (sinais, candles, aprendizado) fica em `server/data/` e sobrevive a reinícios.

```bash
npm test          # matemática, placebo, controle positivo e liquidação de sinais
npm run typecheck
npm run build
```

Nenhuma chave ou conta é necessária. Copie `.env.example` para `.env` só se quiser mudar a porta ou o endpoint.

## Regras do jogo (a "matemática fiel")

1. **Treina só no passado**: walk-forward com purga de rótulos.
2. **Placebo tem que falhar**: em dados aleatórios o resultado deve ser ~50%.
3. **Controle positivo tem que passar**: com vantagem plantada, o pipeline precisa achá-la.
4. **Empate perde**: igual ao Rise/Fall real. Entrada = fechamento da vela do sinal; saída = fechamento do vencimento.
5. **Amostra pequena não diz nada**: abaixo de 30 sinais o selo é "coletando"; só se declara vantagem com n ≥ 100, IC95% acima do empate e p < 0,05.
6. **Muitos testes, menos confiança**: cada estudo do laboratório reduz o α permitido (Bonferroni).

## Estrutura

| Caminho | O que faz |
|---|---|
| `server/src/engine/` | Motor de sinais por ativo: previsão, liquidação, aprendizado, persistência |
| `server/src/ai/` | Features, regressão logística, walk-forward (AegisAI Alpha) |
| `server/src/deriv/` | Cliente WebSocket Deriv: candles, símbolos, cotação de payout |
| `server/src/backtest/stats.ts` | Break-even, EV, Kelly, IC de Wilson, p-valor, gate |
| `server/src/assets/profile.ts` | Perfil ideal de ativo e triagem |
| `web/` | Dashboard React + Vite + TradingView Lightweight Charts |
| `scripts/make-icons.mjs` | Gera ícones, favicon e manifesto (`npm run icons`) |
| `docs/01-plataforma.md` | Decisão da plataforma, comparativo e payouts medidos |

## API local

| Rota | Descrição |
|---|---|
| `GET /api/watchlist` · `POST` · `DELETE /:symbol` | Ativos monitorados (até 6) |
| `GET /api/engine/:symbol` | Snapshot: velas, sinais, estatísticas, aprendizado, eventos |
| `GET /api/stream` | SSE: ticks da vela em formação e avisos de sinais/resultados |
| `POST /api/research` | Estudo walk-forward com placebo (laboratório) |
| `GET /api/assets/catalog` | Ativos compatíveis e descartados (com motivo) |
| `GET /api/wallet` · `POST /settings` · `POST /reset` | Banca fictícia em R$ |
| `GET /api/ai` | Perfil da IA: modelo, limites, arquivos de memória |
| `GET /api/math` | Calculadora |

## Por que Deriv?

É a única plataforma de binárias com **API oficial** (WebSocket + REST), conta demo gratuita e dados públicos sem login. IQ Option, Quotex e Pocket Option não oferecem API oficial. Comparativo completo em [`docs/01-plataforma.md`](docs/01-plataforma.md).

> A CVM não autoriza corretoras de opções binárias a captar clientes residentes no Brasil. Confirme os termos da Deriv para o seu país antes de qualquer conta real.

## Roadmap

- [x] Escolha da plataforma e análise de payouts
- [x] Cliente Deriv, indicadores, AegisAI Alpha e gate estatístico
- [x] Motor de sinais: previsão por vela, liquidação, aprendizado contínuo e histórico
- [x] Dashboard premium com sinais no gráfico, taxa de acerto e tela da IA
- [x] Catálogo de ativos compatíveis, banca fictícia em R$ e página da Aegis IA
- [x] Identidade visual (OrderFlow Lab), favicon, PWA e layout mobile/macOS
- [x] Bancada de pesquisa com cofre, versões exponenciais e plano de entrada com melhores horários
- [x] Persistência reforçada: retomada após desligar, gravação atômica, .bak e instância única
- [ ] Revisar features de horário (hora do dia domina o modelo atual; pode ser ajuste a uma tendência recente)
- [ ] Varredura de ativos e horários (janela Londres/NY) com correção de múltiplos testes
- [ ] Executor em conta **demo** da Deriv, com bloqueio de conta real
- [ ] Gestão de banca (stake ≤ 1%, 1/4 Kelly, stop diário)

## Aviso legal

Projeto educacional e de pesquisa pessoal. Não é consultoria nem recomendação de investimento. Rentabilidade passada ou simulada não garante resultados futuros. Você é o único responsável por qualquer uso.
