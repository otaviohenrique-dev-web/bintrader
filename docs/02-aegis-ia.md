# 02 — Dossiê da Aegis IA (Alpha)

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
| Bancada de pesquisa | a cada 6 h, 60 hipóteses, cofre de 30% |
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

---

## 9. Linha de raciocínio (aba *Aegis IA → Raciocínio ao vivo*)

A cada vela fechada a IA escreve, em português e em tempo real, o que **leu** ("34% de chance de alta"), o que **pesou** ("hora (sin) −0,16 · ret10/ATR −0,14…") e o que **decidiu** ("não entro: dentro de ±3 pp de 50%"). Nada é inventado: cada frase vem de um número do modelo. Como o modelo é uma soma de pesos, a conta inteira aparece em barras: *contribuição = peso × valor do indicador*; a soma mais o viés vira a probabilidade.

Cada sinal guarda as 3 variáveis que mais pesaram. Tudo é salvo em `thoughts.json` e sobrevive a reinícios.

## 10. Bancada de pesquisa e o cofre (aba *Aegis IA → Bancada*)

A IA tem uma **caixa de ferramentas**: 5 tempos gráficos (M1, M5, M15, M30, H1), 3 expirações (15, 30, 60 min) e 5 grupos de indicadores (momento, tendência, volatilidade, calendário e extras: ADX, CCI, Williams %R, Donchian, z-score, sequência). Combinando, são **60 hipóteses**. A cada 6 h (e quando você pedir) ela testa todas, mostrando cada passo na linha de raciocínio.

O risco de uma IA que "escolhe as melhores ferramentas" é se enganar: testando 60 combinações, algumas parecem boas por puro acaso. Por isso:

1. **Cofre**: os 30% de dados mais recentes de cada tempo gráfico ficam reservados (definidos uma vez e nunca mais mudados) e nunca entram na escolha.
2. **Critério corrigido**: com 60 testes, só vale evidência abaixo de α = 0,05 / 60 ≈ 0,083% (Bonferroni).
3. **Uma conferência**: a melhor hipótese é medida no cofre uma única vez, contra a configuração atual. A queda entre o resultado da bancada e o do cofre mede quanto da escolha foi sorte.
4. **Troca com prova**: só vira a configuração em uso (e a versão sobe) se passar no cofre com significância e superar a atual. Senão a IA registra por que manteve.

> Achado real (17/11/2026): no M1 todas as configurações ficaram abaixo de 50%. Isso **não** autoriza inverter o sinal por conta própria; hipóteses novas entram na grade antes de olhar o cofre, e o cofre decide.

## 11. Builds e versões

| | O que é | Quando muda |
|---|---|---|
| **Build** | Cada retreino (a cada 12 velas) | Sempre. É manutenção: pesos novos com dados novos. **Não** prova melhora. |
| **Versão** | Qualidade da configuração | Só quando a bancada promove uma configuração que passa no cofre. |

O número da versão cresce de forma **exponencial** com o ganho de acerto sobre a versão anterior: `v_nova = v_anterior × e^(0,0953 × Δpp)`, ou seja, **+1 ponto percentual de acerto = +10% no número**. Dois ganhos de +1 pp dão 1,10 → 1,21 → 1,33. A versão nunca cai, e a tela mostra a linha de versões com acerto, evolução e motivo. Atualizar a versão a cada treino seria enganoso: treinar toda hora mexe nos pesos por ruído, e o número subiria sem que o modelo melhorasse.

## 12. Plano de entrada, horários e stops (aba *Plano*)

Você informa o **saldo atual**, escolhe o perfil (conservador, moderado, agressivo) e, se quiser, os stops. A IA recomenda:

- **Valor por entrada.** Com vantagem *validada*: ¼ de Kelly sobre o limite inferior do acerto, até o teto do perfil (0,5% / 1% / 2% da banca). Sem vantagem comprovada (hoje): *modo estudo*, metade do teto.
- **Stop loss e stop gain do dia** em R$ (padrão 3% / 5% / 8% da banca) e quantas derrotas seguidas fecham o dia.
- **Esperança por entrada** em R$, sempre mostrada. Hoje é negativa, e a tela diz isso.
- **Dia típico**: simulação de 4.000 dias com o plano, parando no primeiro stop (chance de bater o gain, o loss ou terminar sem bater nenhum).
- **Mapa de horários** (horário do seu computador): acerto da IA em cada hora, com a hora atual marcada.
- **Melhores janelas de 3 h**, com quantos sinais a IA costuma dar, o máximo de entradas recomendado, o valor de cada uma e os stops.

**Cuidado estatístico:** são 24 janelas testadas; diferenças de 1 a 3 pontos percentuais aparecem por acaso. Só trate uma janela como "melhor" se vier marcada como *significativa* (Bonferroni, α = 0,05 / 24). Stops limitam o tamanho da perda; **não mudam o sinal da esperança matemática**.

## 13. Se você desligar o computador

Ver [`04-uso-e-persistencia.md`](04-uso-e-persistencia.md). Resumo: tudo é gravado a cada vela e ao desligar; ao ligar, a IA baixa o que faltou, liquida os sinais que venceram e segue de onde parou. Gravações atômicas, cópia `.bak`, trava de instância única.

## 14. Arquivos de memória (atualização)

| Arquivo | O que guarda |
|---|---|
| `backtest-<ativo>-<vela>-<exp>.json` | Validação retroativa (aparece na hora ao ligar) |
| `research-<ativo>.json` | Hipóteses, cofre, decisões e linha de versões |
| `thoughts.json` | Linha de raciocínio recente |
| `plan.json` | Seu saldo informado, perfil e stops |
| `*.json.bak` | Cópia de segurança da gravação anterior |
| `.lock` | Trava de instância única |

## 15. Próximo sinal e pré-alerta

O sinal só nasce quando a vela de 5 min **fecha**, e você precisa de alguns segundos para agir na Deriv. Por isso, enquanto a vela ainda se forma, a IA roda o modelo sobre ela como se fechasse agora (a **prévia**) e emite um **pré-alerta** nos últimos **90 s** antes do fechamento:

- A prévia aparece no cartão *Sinal atual → Próximo sinal* e numa pílula no topo do gráfico, com contagem regressiva e o passo a passo para deixar a ordem pronta na Deriv (Ascensão/Queda · par · 15 min · valor).
- Há **um** pré-alerta por vela, e só se um sinal puder abrir: não há outro aberto, ou o aberto vence até o fechamento (assim um sinal pode emendar no seguinte).
- **Som opcional:** um bipe quando o pré-alerta dispara (ligue em *Som desligado*; o navegador só libera o áudio depois do seu clique).

**É uma prévia, não uma garantia.** A vela ainda pode mudar até fechar, e o lado pode inverter. Por isso cada pré-alerta é **conferido no fechamento** como *confirmado*, *invertido* ou *não virou sinal*, e a tela mostra a taxa de confirmação medida ao vivo. Até haver 5 conferidos, ela diz que ainda está medindo.

## 16. Histórico com o par

O Histórico agora lista **todas as operações de todos os pares** juntas, com a coluna **Par** e um filtro por par (a banca, o acerto e a curva se ajustam ao filtro). Pares que você parou de monitorar continuam aparecendo (lidos do disco). Uma operação que ficou aberta num par desligado aparece como **PENDENTE**: o resultado só sai se você voltar a monitorar o par, porque o motor dele precisa baixar as velas para liquidar.
