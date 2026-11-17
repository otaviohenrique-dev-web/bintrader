# 04 — Uso diário e persistência

## Ligar e desligar

```bash
npm start        # compila a interface e sobe tudo em http://localhost:3001
```

Em desenvolvimento use `npm run dev` (interface em `:5173`, API em `:3001`, recarrega ao editar).
No Windows também dá para dar dois cliques em `scripts/iniciar-orderflow.cmd`.

Pode desligar o computador a qualquer momento (até puxando da tomada). **Nada se perde.**

## O que acontece ao ligar de novo

1. A Aegis IA lê os arquivos de `server/data/`.
2. Baixa da Deriv as velas que faltaram durante o tempo desligado.
3. **Liquida, com o preço real, os sinais que venceram enquanto você estava fora** (a banca fictícia acompanha).
4. Retreina, revalida em segundo plano e segue de onde parou.

A linha de raciocínio registra isso, por exemplo: *"Retomei de onde parei: ficamos 3,0 h sem conversar. Recuperei 30.009 velas…"*.

## Por que é seguro

| Proteção | Como funciona |
|---|---|
| **Gravação atômica** | Escreve num arquivo temporário e só então renomeia; o arquivo nunca fica pela metade. |
| **Cópia de segurança** | A versão anterior fica em `*.json.bak`; se o arquivo principal estiver corrompido, o sistema usa a cópia. |
| **Instância única** | `server/data/.lock` impede duas cópias do sistema de escreverem nos mesmos arquivos. Se for engano (travou), apague o `.lock`. |
| **Desligamento limpo** | Ao receber Ctrl+C, grava tudo que estava em memória. |

## Iniciar junto com o Windows (opcional)

No PowerShell, uma única vez (ajuste o caminho se o projeto estiver em outro lugar):

```powershell
schtasks /Create /SC ONLOGON /TN "OrderFlowLab" /TR "\"E:\Projetos_Dev\BinTrader\scripts\iniciar-orderflow.cmd\"" /RL LIMITED
```

Para remover: `schtasks /Delete /TN "OrderFlowLab" /F`.

## Backup e recomeço

- **Backup:** copie a pasta `server/data/` (sinais, banca, histórico, versões, plano). Para restaurar, cole de volta com o servidor desligado.
- **Recomeçar do zero:** desligue o servidor e apague `server/data/`.
- **Só a banca:** engrenagem do cartão "Banca fictícia" → *Reiniciar banca*.
