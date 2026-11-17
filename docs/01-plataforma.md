# 01 — Escolha da plataforma

> Decisão: **Deriv** (API oficial WebSocket + REST, conta demo gratuita, dados públicos sem login).
> Data da análise: 2026-11-17. Números abaixo foram medidos ao vivo na API pública da Deriv no mesmo dia.

## Critérios (em ordem de importância)

1. **API oficial para sistemas externos** — sem isso dependemos de engenharia reversa (frágil e contra os Termos de Uso).
2. **Conta demo** — todo o projeto roda em demo até haver prova estatística de edge.
3. **Dados históricos de candles** — sem histórico não existe treino nem backtest.
4. **Payout cotável por API** — o payout define o win rate mínimo para empatar; é a variável nº 1 da matemática.
5. **Clareza regulatória para você** — ver nota abaixo.

## Comparativo

| Plataforma | API oficial | Demo | Histórico via API | Veredito |
|---|---|---|---|---|
| **Deriv** | **Sim** — WebSocket (`wss://api.derivws.com/trading/v1/options/ws/...`) + REST, OAuth2/PAT | Sim, grátis | Sim, `ticks_history` (candles de 1 min a 1 dia) | **Escolhida** |
| IQ Option | Não encontrei API oficial pública; só libs não oficiais (engenharia reversa) | Sim | Via lib não oficial | Plano B frágil. A CVM tem processo/termo de compromisso (2026) sobre oferta sem autorização a brasileiros |
| Quotex | Não encontrei documentação oficial de API | Sim | — | Só via scripts/extensões no navegador |
| Pocket Option | Não encontrei documentação oficial de API | Sim | — | Idem. Ativos "OTC" têm preço formado pela própria corretora |

### Plano B (só se a Deriv deixar de servir)
Se um dia precisarmos de outra corretora sem API, o caminho seria um **userscript/extensão de navegador** que lê o gráfico/DOM e conversa com nosso backend via `localhost`. Desvantagens: quebra a cada mudança de layout, viola os Termos de Uso da maioria das corretoras (risco de conta bloqueada com saldo preso) e a latência de clique é pior. Só entra se não houver alternativa — hoje há.

## O que medi na API pública (2026-11-17)

`proposal` de um CALL "ATM" de US$ 10:

| Ativo | Expiração | Payout | Retorno | **Win rate p/ empatar** |
|---|---|---|---|---|
| EUR/USD | 15 min | 18,27 | 82,7 % | **54,73 %** |
| EUR/USD | 1 h | 18,19 | 81,9 % | **54,98 %** |
| Volatility 50 | 1 min | 19,54 | 95,4 % | 51,18 % |
| Volatility 100 | 3 min | 19,55 | 95,5 % | 51,15 % |
| EUR/USD, GBP/USD, BTC/USD | 1 / 3 / 5 min | *não ofertado* | — | — |

Duas conclusões que moldam o projeto inteiro:

1. **Na Deriv, forex só tem expiração a partir de ~15 min.** O "AegisAI Alpha" nasce operando velas de 5 min com expiração de 15 min (3 velas à frente).
2. **Os índices "Volatility" pagam muito melhor (95 %) mas são gerados por um gerador de números aleatórios.** Não há estrutura para uma IA aprender; qualquer "edge" que apareça lá é bug ou sorte. Por isso usamos esses índices como **grupo de controle (placebo)**: se a IA "ganhar" neles, o pipeline tem vazamento de dados.

## Nota sobre legalidade (Brasil)

Opções binárias não são explicitamente proibidas no Brasil, mas a CVM não autoriza corretoras a captar clientes residentes aqui e emite alertas recorrentes. Antes de depositar qualquer valor real, confirme nos Termos da Deriv se residentes no Brasil podem abrir conta real e entenda que a proteção ao investidor local é limitada. Conta demo e estudo de dados públicos não têm esse problema.

## Matemática que governa tudo

Com retorno `r` (ex.: 0,827) e win rate `p`:

- Win rate de empate: `p* = 1 / (1 + r)` → 54,7 % no EUR/USD 15 min.
- Esperança por unidade apostada: `EV = p·r − (1 − p)`.
- A "casa" cobra ~4,7 pontos percentuais. A IA precisa de **vantagem real acima disso**, não só de "acertar mais que erra".
- Detectar com confiança uma vantagem de 2 p.p. sobre o empate exige **~2.000+ operações** (poder 80 %, α 5 %). Por isso o projeto nunca aprova nada com 50 trades.

## Fontes

- [Deriv API — visão geral](https://developers.deriv.com/docs/intro/api-overview/)
- [Deriv API — ticks_history](https://developers.deriv.com/llms/ticks-history.md)
- [CVM — parecer do comitê de termo de compromisso (IQ Option), mar/2026](https://www.gov.br/cvm/pt-br/assuntos/noticias/anexos/2026/20260324-pas-cvm-19957-006709-2021-81-parecer-do-comite-de-termo-de-compromisso.pdf)
