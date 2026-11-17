# 02 — Dossiê da Aegis IA 1.1 Alpha

> Guia para dominar o agente: o que é, onde vive, como decide, como aprende, onde guarda a memória,
> quais são os limites, as forças e as fraquezas. Os números abaixo são os do código; a mesma
> informação aparece, ao vivo, na aba **Aegis IA** do OrderFlow Lab.

## 1. Quem é e onde vive

- **Aegis IA** é o agente. **OrderFlow Lab** é a plataforma onde ele trabalha.
- Ele **roda no seu computador**, dentro do servidor Node (`server/src/ai` e `server/src/engine`).
  Não há nuvem, GPU nem servidor de terceiros. Só conversa com a Deriv, para ler preços.
- Ele **não envia ordens**. A banca em R$ é fictícia.

### Alpha, beta e a versão "1.1"

| Termo | Significado |
|---|---|
| **Pré-alpha** | Pedaços soltos, ainda sem fluxo completo. |
| **Alpha** | Funciona de ponta a ponta, mas está em testes internos e pode mudar a qualquer hora. **É o nosso estágio.** |
| **Beta** | Completo e estável o bastante para validação mais ampla. |
| **1.1** | Geração do modelo: 1.0 foi o estudo de laboratório; 1.1 trouxe sinais ao vivo, aprendizado contínuo e carteira. |

## 2. Como decide (5 passos)

1. **Lê** as últimas velas fechadas (M5). A vela em formação é ignorada.
2. **Calcula 15 variáveis**: variação em 4 janelas, RSI, MACD, Bollinger, médias, estocástico, corpo e pavios da vela, volatilidade e hora do dia, todas normalizadas pela volatilidade (ATR).
3. **Estima** uma probabilidade de alta com uma **regressão logística** com regularização L2 (15 pesos que você pode ver).
4. **Decide**: se a probabilidade passa de 50% ± o limiar (padrão 3 pp), abre sinal de Alta ou Baixa. Senão, não faz nada. Uma posição por ativo.
5. **Liquida e registra**: entrada = fechamento da vela do sinal; saída = fechamento no vencimento (15 min). **Empate perde.**

## 3. Como aprende

| Direção | O que acontece |
|---|---|
| **Para trás** | Baixa até 30.000 velas por ativo (lotes de 2.000 a cada 15 s) e revalida em walk-forward: treina no passado, testa só no futuro de cada janela, com purga de rótulos. Mais histórico torna a **estimativa de acerto** mais confiável. Não deixa o modelo mais esperto. |
| **Para frente** | A cada 12 velas (1 h) retreina com as 2.000 velas mais recentes. Cada vela que fecha vira um exemplo a mais, inclusive o desfecho dos próprios sinais. |
| **Com os resultados** | Se os últimos 40 sinais liquidados ficam abaixo do ponto de empate, sobe a seletividade em 1 pp (até 12 pp); se melhoram, desce de volta ao valor base. Só reavalia a cada 20 sinais novos. |

## 4. Onde guarda as informações

Tudo em `server/data/` (ignorado pelo git; nada sai do seu computador):

| Arquivo | O que guarda |
|---|---|
| `candles-<ativo>-300.json` | Cache do histórico de velas baixado da Deriv |
| `engine-<ativo>-300-15.json` | Sinais, resultados, eventos de aprendizado, seletividade e nº de retreinos |
| `wallet.json` | Banca fictícia em R$: saldo, configurações e extrato |
| `watchlist.json` | Ativos monitorados |
| `research-log.json` | Registro dos estudos do laboratório (correção de múltiplos testes) |

**O que NÃO é salvo:** os pesos do modelo. Ele é recriado das velas guardadas toda vez que o servidor liga (poucos segundos). Para "apagar a memória", pare o servidor e apague a pasta `server/data/`.

## 5. Limites

| Item | Valor |
|---|---|
| Histórico por ativo | 30.000 velas (≈ 5 meses de forex em M5) |
| Janela de treino | 2.000 velas (≈ 7 dias de mercado) |
| Retreino | a cada 12 velas (1 h) |
| Revalidação walk-forward | a cada 48 velas (4 h) e ao completar o histórico |
| Ativos monitorados | até 6, só os compatíveis |
| Posições abertas | 1 por ativo |
| Seletividade | 3 pp (base) a 12 pp (máximo), passo de 1 pp |
| Sinais guardados | 5.000 por ativo (os mais antigos saem) |
| Frescor do dado | sem sinal sobre dado com mais de 90 s |
| Expiração e vela | 15 min · M5 (fixos nesta versão) |
| Banca fictícia | saldo inicial R$ 100 a R$ 1.000.000; valor por sinal de 0,1% a 5% da banca ou R$ fixo |

## 6. Pontos fortes

- **Transparente**: modelo simples; você vê os 15 pesos e entende cada sinal.
- **Honesta consigo mesma**: walk-forward com purga, placebo (dados aleatórios não podem render edge), controle positivo (edge plantado precisa ser achado), IC95% de Wilson e correção de Bonferroni. Não declara vantagem com amostra pequena.
- **Presta contas**: cada sinal é liquidado com preço real e gravado em disco.
- **Leve**: roda em notebook, retreina em frações de segundo.
- **Segura**: somente leitura e dinheiro fictício.
- **Adaptativa**: retreina a cada hora e ajusta a seletividade com os resultados.

## 7. Fraquezas

- **Sem vantagem comprovada**: ~51% de acerto retroativo contra ~56% exigidos para empatar (varia com o payout do momento).
- **Só enxerga o preço**: sem volume, livro de ofertas, notícias ou calendário. O "order flow" do nome é a meta; a Deriv não fornece livro de ofertas.
- **Modelo linear**: não captura padrões que dependem da combinação de fatores.
- **Hora do dia pesa demais**: pode estar decorando a tendência da última semana, gerando viés para um lado só.
- **Quase sempre posicionada**: limiar baixo faz operar uma atrás da outra (ver FAQ).
- **Memória curta**: treina só nos últimos ~7 dias.
- **Simulação otimista**: assume entrada no fechamento da vela; na vida real há atraso e o payout muda ao longo do dia.
- **O jogo é contra ela**: a corretora cobra de ~1 a ~9 pontos percentuais conforme o ativo.

## 8. FAQ

**Por que ela opera uma atrás da outra?**
A regra permite: 1 posição por ativo e nenhuma pausa obrigatória; ao vencer um sinal, o próximo pode abrir na mesma vela. Isso **não é uma decisão de timing**. É consequência do limiar baixo: a leitura raramente fica perto de 50%, então ela vive posicionada. Medido em 17/11/2026: retroativamente ela ficou posicionada em ~55% do tempo, com 83% dos sinais emendados e só 33% de Alta (viés de baixa). Não é um defeito de funcionamento, mas também não é sinal de inteligência. A aba **Aegis IA → Ritmo de operação** mostra isso em tempo real.

**Como ler o selo da taxa de acerto?**
*Coletando amostra* (n < 30): não diz nada. *Abaixo do empate*: acerto menor que o necessário. *Inconclusivo*: acima do empate, mas a margem de erro ainda cobre o empate. *Vantagem confirmada*: n ≥ 100, IC95% acima do empate e p < 0,05.

**Por que o ponto de empate muda?**
É `1 / (1 + payout)`, e o payout cotado pela Deriv varia por ativo e ao longo do dia (observamos de ~65% a ~99%). Escolher ativos com payout alto é a maior alavanca individual.

**Como zerar tudo?**
Pare o servidor e apague `server/data/`. Para só reiniciar a banca, use a engrenagem do cartão "Banca fictícia".
