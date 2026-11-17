# 03 — Identidade visual

## Nomes

| | |
|---|---|
| **Plataforma** | OrderFlow Lab |
| **Agente** | Aegis IA |
| **Versão** | 1.1 · estágio Alpha (em testes) |

## Marca

- **Marca da plataforma** (`web/public/mark.svg`): escudo (Aegis, proteção) com um perfil de volume dentro (order flow). Ouro sobre tinta escura.
- **Emblema do agente** (`web/public/agent.svg`): círculo com uma rede mínima de 3 nós e um núcleo.
- **Favicon** (`favicon.svg`, `favicon.ico`): versão simplificada que continua legível em 16 px.
- **Apple / Android / PWA**: `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (zona segura de 80%), `manifest.webmanifest`, `og-image.png` (pré-visualização ao compartilhar).

Tudo é gerado por `npm run icons` (`scripts/make-icons.mjs`, usa `sharp`). Para mudar a marca, edite o script e rode de novo.

## Cores

| Token | Valor | Uso |
|---|---|---|
| Tinta | `#090b0f` · `#0e1116` | Fundo e superfícies |
| Ouro | `#d6b36a` | Único acento: marca, aba ativa, foco, valores-chave |
| Alta / WIN | `#25c08a` | Sinais de alta e ganhos |
| Baixa / LOSS | `#ef5b67` | Sinais de baixa e perdas |
| Alerta | `#e0a93b` | Amostra pequena, atenção |

## Tipografia

| Papel | Fonte | Licença |
|---|---|---|
| Marca e títulos | **Sora** (variável) | SIL OFL (uso comercial livre) |
| Interface | **Inter** (variável) | SIL OFL |
| Números, preços, R$ | **JetBrains Mono** | SIL OFL |

> Uma fonte realmente exclusiva exigiria contratar um designer de tipos. Por isso usamos famílias abertas e profissionais, empacotadas localmente (não dependem de CDN) e com a identidade vindo da marca, da paleta e do espaçamento.

## Mobile e macOS

- `viewport-fit=cover` e `env(safe-area-inset-*)` (entalhe e barra inferior do iPhone).
- Navegação inferior fixa no celular (5 seções), com blur.
- `theme-color`, `apple-mobile-web-app-capable` e manifesto: pode ser adicionado à tela inicial e abre como app.
- Alvos de toque maiores em telas sem hover, campos com 16 px (o Safari não dá zoom ao focar).
- macOS/Safari: `-webkit-backdrop-filter`, `-webkit-font-smoothing`/`-moz-osx-font-smoothing`, pilha de fontes com `-apple-system`.
