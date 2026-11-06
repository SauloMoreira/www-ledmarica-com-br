# AGENTS.md

- Orçamentos PJ: totais calculados por src/lib/quotes.ts (compartilhado), mas o valor salvo vem sempre do servidor (src/server/quotes.functions.ts); a rota de impressão nunca lê custos/notas internas — evita divergência e vazamento.
