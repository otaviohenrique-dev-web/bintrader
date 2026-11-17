# 🛡️ BinTrader · AegisAI Alpha

> Laboratório de pesquisa que usa IA para descobrir, com matemática e dados reais, **se existe vantagem estatística em opções binárias** — antes de arriscar qualquer dinheiro.

![status](https://img.shields.io/badge/status-em%20testes-orange)
![modo](https://img.shields.io/badge/modo-somente%20pesquisa-blue)
![ordens](https://img.shields.io/badge/ordens%20reais-nenhuma-green)
![node](https://img.shields.io/badge/node-%E2%89%A5%2022-339933)

> ## ⚠️ Projeto em fase de testes (alpha)
> - O sistema **está em testes** e muda com frequência. Não use como base de decisão financeira.
> - Neste momento ele **só lê dados públicos da Deriv e não envia nenhuma ordem** (nem demo, nem real).
> - Os resultados atuais mostram **ausência de vantagem** (veja abaixo). Isso é um resultado válido, não um bug.
> - Nada aqui é recomendação de investimento. Opções binárias têm alto risco de perda total.

## O que é

O **AegisAI Alpha** é um modelo de IA (regressão logística transparente) que aprende com o histórico de candles da [Deriv](https://developers.deriv.com/) e tenta prever se o preço estará mais alto ou mais baixo após a expiração. A parte mais importante do projeto, porém, não é o modelo: é o **gate estatístico** que decide se o resultado é vantagem real ou só sorte.

Ideia central: com payout de ~83%, é preciso acertar **~54,7%** das operações só para empatar. O sistema existe para responder com rigor se a IA passa disso.

## Resultado atual (EUR/USD, velas de 5 min, expiração de 15 min)

| | Acerto | Necessário p/ empatar | Veredito |
|---|---|---|---|
| AegisAI (fora da amostra, 1.685 trades) | 50,9% | 54,1% | **SEM_EDGE** |
| Placebo (passeio aleatório) | 48,7% | 54,1% | SEM_EDGE ✅ (esperado) |

## Funcionalidades

- 🔌 **Cliente Deriv** — candles históricos paginados, lista de ativos e cotação real de payout (endpoint público, sem login).
- 📈 **Indicadores** — RSI, EMA, MACD, Bollinger, ATR e Estocástico, sem usar dado futuro.
- 🧠 **AegisAI Alpha** — treino em janelas móveis (walk-forward) com purga de rótulos para evitar vazamento.
- 🧪 **Placebo + controle positivo** — o mesmo pipeline roda em dados aleatórios (tem que dar ~50%) e em dados com vantagem plantada (tem que achar).
- 📊 **Gate estatístico** — exige n ≥ 300, limite inferior do IC95% acima do empate e p-valor corrigido por Bonferroni.
- 🎯 **Perfil ideal de ativo** — critérios e triagem ao vivo (payout, razão de variância, taxa de empate).
- 🧮 **Calculadora de matemática** — win rate de empate, esperança, Kelly e nº de trades para confirmar uma vantagem.
- 🖥️ **Dashboard React** com 4 abas: AegisAI Alpha · Ativos · Matemática · Plataforma.

## Como rodar

Requisitos: Node.js 22+ e npm.

```bash
git clone https://github.com/otaviohenrique-dev-web/bintrader.git
cd bintrader
npm install
npm run dev
```

- Dashboard: <http://localhost:5173>
- API: <http://localhost:3001>

Outros comandos:

```bash
npm test         # testes: matemática, placebo e controle positivo
npm run typecheck
npm run build
```

Nenhuma chave ou conta é necessária. Copie `.env.example` para `.env` só se quiser mudar a porta ou o endpoint.

## Por que Deriv?

É a única plataforma de binárias com **API oficial** (WebSocket + REST), conta demo gratuita e dados públicos sem login. IQ Option, Quotex e Pocket Option não oferecem API oficial. Comparativo completo, payouts medidos e plano B em [`docs/01-plataforma.md`](docs/01-plataforma.md).

> Nota: a CVM não autoriza corretoras de opções binárias a captar clientes residentes no Brasil. Confirme os termos da Deriv para o seu país antes de qualquer conta real.

## Estrutura

| Caminho | O que faz |
|---|---|
| `docs/01-plataforma.md` | Decisão da plataforma, comparativo e payouts medidos |
| `server/src/deriv/` | Cliente WebSocket e dados de mercado |
| `server/src/indicators/` | Indicadores técnicos |
| `server/src/ai/` | Features, modelo e walk-forward (AegisAI Alpha) |
| `server/src/backtest/stats.ts` | Break-even, EV, Kelly, IC de Wilson, p-valor, gate |
| `server/src/assets/profile.ts` | Perfil ideal de ativo e triagem |
| `server/src/services/research.ts` | Orquestra estudo, placebo e log de tentativas |
| `web/` | Dashboard React + Vite |

## Regras do jogo

1. **Treina só no passado** — walk-forward com purga.
2. **Placebo tem que falhar** — em dados aleatórios o resultado deve ser ~50% e `SEM_EDGE`.
3. **Controle positivo tem que passar** — com vantagem plantada, o pipeline precisa achá-la.
4. **Muitos testes, menos confiança** — cada estudo rodado reduz o α permitido (Bonferroni).
5. **Só depois, demo** — nada é executado antes de passar no gate.

## Roadmap

- [x] Escolha da plataforma e análise de payouts
- [x] Cliente Deriv, indicadores, AegisAI Alpha e gate estatístico
- [x] Dashboard e testes de placebo/controle positivo
- [ ] Cofre (holdout) final nunca tocado durante o desenvolvimento
- [ ] Paper trading ao vivo (previsões liquidadas contra o preço real, sem ordens)
- [ ] Varredura de ativos e horários (janela Londres/NY)
- [ ] Executor em conta **demo** da Deriv, com bloqueio de conta real
- [ ] Gestão de banca (stake ≤ 1%, 1/4 Kelly, stop diário)

## Aviso legal

Projeto educacional e de pesquisa pessoal. Não é consultoria nem recomendação de investimento. Rentabilidade passada ou simulada não garante resultados futuros. Você é o único responsável por qualquer uso.
