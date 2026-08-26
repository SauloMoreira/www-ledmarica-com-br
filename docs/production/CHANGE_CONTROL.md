# Controle de Mudanças (Change Control) — Led Maricá

**Vigência:** Produção v1.0.0 (30/mai/2026)

Toda alteração em produção — código, banco, configuração, conteúdo
sensível, integração — passa por este fluxo.

---

## 1. Fluxo obrigatório

1. **Solicitação** — descrever o que mudar e por quê.
2. **Classificação** — baixa / média / alta / crítica.
3. **Avaliação de risco** — segurança, regressão, dados, performance.
4. **Aprovação** — admin responsável aprova explicitamente.
5. **Backup pré-mudança** — quando exigido pela classificação.
6. **Implementação** — em preview, nunca direto em produção.
7. **Teste** — funcional + smoke + cenários de borda.
8. **Publicação** — após `DEPLOY_CHECKLIST.md` 100% verde.
9. **Monitoramento pós-deploy** — janela de observação obrigatória.
10. **Changelog** — registrar em `CHANGELOG.md` + `RELEASES.md`.
11. **Encerramento** — fechar o item ou abrir rollback.

## 2. Classificação

### Baixa
- Texto, copy, imagem, favicon.
- Ajuste visual puramente cosmético, sem lógica.
- Janela de monitoramento: 1h.
- Backup: não obrigatório.

### Média
- Tela admin sem efeito em produção pública.
- Campanha de marketing, template de e-mail (sem mudança transacional).
- Importação de produtos por planilha.
- Mudanças de SEO (meta, sitemap, robots).
- Janela de monitoramento: 4h.
- Backup: recomendado (snapshot diário automático cobre).

### Alta
- Checkout, carrinho, frete.
- Estoque (qualquer função que escreva em `stock_decrement_audit`).
- B2B (preço, aprovação, RPCs).
- Cupons.
- E-mails transacionais.
- Janela de monitoramento: 24h.
- Backup: **obrigatório manual** antes do deploy.

### Crítica
- Mercado Pago, webhook de pagamento.
- RLS, MFA, AAL2, policies, server middleware admin.
- Banco / migrations com `ALTER`, `DROP`, mudança de tipo.
- Secrets (rotação inclusive).
- Autenticação (signup, login, recuperação de senha).
- DNS, domínio, certificado.
- Janela de monitoramento: 72h.
- Backup: **obrigatório manual** + security review documentada.

## 3. Regras absolutas

- ❌ Não alterar checkout sem teste end-to-end de pagamento real
  (sandbox + 1 transação aprovada).
- ❌ Não alterar Mercado Pago sem teste controlado (sandbox + replay
  de webhook).
- ❌ Não alterar webhook sem reenvio de notificação simulada.
- ❌ Não alterar estoque sem validar `stock_decrement_audit`.
- ❌ Não alterar RLS/MFA/AAL2/policies/server functions admin sem
  security review e re-execução do `supabase--linter`.
- ❌ Não alterar DNS/SEO/GA4 sem checklist específico.
- ❌ Não alterar templates de e-mail transacional sem envio de teste
  para o admin.
- ❌ Não publicar automaticamente — sempre validação humana.
- ❌ Não criar novos roles ou permissões granulares (modelo é
  admin único + cliente/visitante).

## 4. Registro

Cada item de mudança deve ter um ID `CC-AAAA-NNN` e ficar registrado
neste arquivo na seção "Histórico" abaixo.

### Template

```md
### CC-AAAA-NNN — <título>
- **Solicitante:**
- **Classificação:** baixa | média | alta | crítica
- **Data abertura:**
- **Risco segurança:**
- **Risco regressão:**
- **Backup necessário:** sim/não — referência em BACKUP_LOG
- **Arquivos alterados:**
- **Plano de teste:**
- **Plano de rollback:** ROLLBACK_PLAN.md#seção
- **Aprovador:**
- **Versão alvo:** vX.Y.Z
- **Status:** planejado / em teste / aprovado / publicado / revertido
- **Data fechamento:**
- **Observações pós-deploy:**
```

## 5. Histórico

### CC-2026-001 — Marco de produção v1.0.0
- **Solicitante:** Saulo Moreira
- **Classificação:** operacional (governança, sem código)
- **Data abertura:** 30/mai/2026
- **Risco segurança:** nenhum
- **Risco regressão:** nenhum
- **Backup necessário:** snapshot diário automático
- **Arquivos alterados:** somente `docs/production/*`
- **Plano de teste:** N/A (documentação)
- **Plano de rollback:** N/A (baseline)
- **Aprovador:** Saulo Moreira
- **Versão alvo:** v1.0.0
- **Status:** publicado
- **Data fechamento:** 30/mai/2026

### CC-2026-002 — Produção Assistida v1.0.0 (3 meses)
- **Solicitante:** Saulo Moreira
- **Classificação:** operacional (governança, sem código)
- **Data abertura:** 30/mai/2026
- **Risco segurança:** nenhum
- **Risco regressão:** nenhum
- **Backup necessário:** snapshot diário automático (sem deploy)
- **Arquivos alterados:** somente `docs/production/*`
- **Plano de teste:** N/A (documentação)
- **Plano de rollback:** N/A (marco operacional)
- **Aprovador:** Saulo Moreira
- **Versão alvo:** v1.0.0 (marco)
- **Status:** publicado
- **Data fechamento:** 30/mai/2026
- **Observações:** janela ativa 30/mai/2026 → 30/ago/2026

### CC-2026-009 — v1.0.5: Importação de produtos com códigos como texto
- **Solicitante:** Saulo Moreira
- **Classificação:** Média (planilha, parser, RPC nova; sem impacto em checkout/MP/webhook/pedidos/estoque/emails)
- **Data abertura:** 23/jun/2026
- **Risco segurança:** Mitigado — RPC `SECURITY DEFINER SET search_path = public, pg_temp` com REVOKE FROM PUBLIC/anon, GRANT só a authenticated+service_role, checagem interna de `is_admin` + `aal=aal2` para usuários autenticados diretos; service_role bypassa porque o servidor já valida admin+AAL2 via `requireAdmin`.
- **Risco regressão:** Mitigado — alterações isoladas ao fluxo de importação. Checkout, Mercado Pago, webhook, pedidos, estoque pós-venda, e-mails transacionais, CRM, GA4, DNS, MFA/AAL2 geral, RLS, policies e permissões públicas intocadas.
- **Backup necessário:** snapshot diário automático (sem alteração destrutiva de dados existentes — RPC só insere/atualiza produto + atributos com whitelist de campos).
- **Arquivos alterados:**
  - `supabase/migrations/*_import_product_with_attrs.sql` (nova RPC + revoke anon)
  - `public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` (regenerada com formato `@` célula a célula nas linhas 1–10000)
  - `src/lib/productImport.ts` (tipos + helpers)
  - `src/server/productImport.functions.ts` (HEADER_MAP, detector numérico, merge códigos, commit via RPC, audits, safeCell)
  - `src/routes/admin.produtos.importacao-ia.tsx` (UI: fieldsets de códigos/atributos)
  - `docs/production/CHANGELOG.md`, `docs/production/RELEASES.md`, este arquivo
- **Plano de teste:**
  1. Baixar nova planilha modelo pela tela `/admin/produtos/importacao-ia`, abrir no Excel — colunas-código devem aparecer formatadas como Texto em células vazias.
  2. Digitar SKU `LED-EXEMPLO-001` → preservado.
  3. Digitar SKU `7891234567890` → preservado como string.
  4. Digitar SKU `000123456789` → zeros mantidos.
  5. Forçar célula numérica em coluna SKU → parser bloqueia.
  6. NCM `8539.50.00` → normaliza para `85395000`.
  7. NCM `1234` → erro "8 dígitos".
  8. CEST vazio → enviado como `null` (sem violar CHECK).
  9. EAN `7891` + codigo_barras `9999` → bloqueia linha por divergência.
  10. EAN vazio + codigo_barras preenchido → grava em `gtin_ean`.
  11. Categoria inexistente → bloqueia.
  12. Tentar criar com SKU já existente → bloqueia.
  13. Atualizar com próprio SKU → permite.
  14. Atributo com falha → RPC reverte produto criado.
  15. Cliente autenticado (não admin) chamando RPC direta → `Access denied: admin only`.
  16. Admin sem AAL2 chamando RPC direta → `MFA required (AAL2)`.
  17. Payload com `role: 'admin'` ou `payment_status: 'paid'` → ignorado pela whitelist.
  18. Export XLSX revisado com cell `=SUM(A1)` → fica `'=SUM(A1)` (não executa).
  19. `admin_audit_log` registra parse/simulate/commit/blocked/export_revised.
  20. Build + tsgo: sem erros.
- **Plano de rollback:**
  1. Reverter os arquivos da seção "Arquivos alterados".
  2. Restaurar planilha anterior do controle de versão.
  3. Se necessário derrubar a RPC: `DROP FUNCTION IF EXISTS public.import_product_with_attrs(text, jsonb, jsonb);`.
  4. Confirmar smoke do checkout, pedidos, Mercado Pago, webhook e estoque.
- **Aprovador:** Saulo Moreira
- **Versão alvo:** v1.0.5
- **Status:** publicado
- **Data fechamento:** 23/jun/2026
- **Ajuste pós-teste manual (23/jun/2026):** modelo XLSX regenerado com células vazias
  materializadas como Texto (`@` + `quotePrefix`) nas linhas 1–10000 para `sku`, `ean_gtin`,
  `codigo_barras`, `ncm`, `cest`, `cfop_default`, `codigo_fornecedor`, `modelo` e `marca`;
  área `A1:T10000` convertida em tabela Excel `TabelaProdutosImportacao`; link de download
  recebeu cache-buster. Aceite operacional continua condicionado ao teste manual no Excel
  preservando `7891234567890123` exatamente como texto após salvar e reabrir.
- **Hotfix do modelo Excel (23/jun/2026):** após novo teste manual ainda mostrar notação
  científica, o modelo foi regenerado com formato `@` aplicado no **nível da coluna** e nas
  células críticas materializadas da tabela. O link de download passou a apontar para novo
  arquivo físico `Cadastro_Minimo_Produtos_Led_Marica_IA_v1.0.5_Texto.xlsx`, eliminando risco
  de cache do arquivo antigo. A v1.0.5 permanece sem aceite operacional até validação manual
  do SKU `7891234567890123` digitado diretamente na coluna SKU do modelo oficial.
- **Hotfix reforçado do modelo Excel (23/jun/2026):** após evidência manual adicional com
  `7891234567890123` exibido como `7,89123E+15`, os estilos de texto foram convertidos para
  o formato nativo do Excel (`numFmtId=49`) com `quotePrefix=1` nas colunas críticas e células
  materializadas. Validações `ISTEXT` seguem em modo bloqueante. O link administrativo agora
  aponta para `Cadastro_Minimo_Produtos_Led_Marica_IA_v1.0.5_Texto_ExcelSeguro.xlsx`, mantendo
  o nome de download `Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx`.
- **Hotfix corretivo do XLSX oficial (23/jun/2026):** após nova reprovação manual, o modelo
  oficial `public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` foi regenerado com
  `xlsxwriter`. O formato real de Texto (`numFmtId=49`) foi aplicado no nível das colunas
  `sku`, `ean_gtin`, `codigo_barras`, `ncm`, `cest`, `cfop_default`, `codigo_fornecedor`,
  `modelo` e `marca`, com células vazias pré-formatadas como Texto das linhas 2 até 10000.
  A linha de exemplo usa `7891234567890123` como string. O botão oficial voltou a apontar
  para o arquivo oficial único com cache-buster, sem dependência dos nomes físicos antigos
  `v1.0.5_Texto` ou `ExcelSeguro`. A v1.0.5 permanece pendente de aceite manual enquanto o
  modelo baixável não for validado no Microsoft Excel com SKU numérico longo preservado como
  Texto.

### CC-2026-011 — v1.0.7: Conversão Google Ads (tag base + evento Compra)
- **Solicitante:** Saulo Moreira
- **Classificação:** Média (marketing/analytics; não toca checkout, pagamento, estoque ou RLS)
- **Data abertura:** 26/ago/2026
- **Risco segurança:** baixo — ID de tag público (`AW-18412575433`), carregado client-side somente após consentimento de marketing (LGPD).
- **Risco regressão:** baixo — código aditivo isolado em `tracking.ts` e na página de confirmação de pedido; nenhuma lógica existente alterada.
- **Backup necessário:** não (snapshot diário cobre; config reversível por `enabled=false`).
- **Arquivos alterados:** `marketing_integrations` (1 linha via SQL idempotente), `src/lib/tracking.ts`, `src/routes/pedido.$id.confirmacao.tsx`, `docs/production/CHANGELOG.md`, este arquivo.
- **Plano de teste:** aceitar cookies de marketing, abrir `/pedido/:id/confirmacao` de pedido pago → evento `conversion` no gtag; refresh não repete; pedido pendente não dispara; sem consentimento não dispara.
- **Plano de rollback:** ROLLBACK_PLAN.md — desativar integração (`enabled=false`) e reverter os 2 arquivos de código.
- **Aprovador:** Saulo Moreira
- **Versão alvo:** v1.0.7
- **Status:** publicado
- **Data fechamento:** 26/ago/2026

### CC-2026-010 — Hotfix de variáveis públicas no build publicado
- **Solicitante:** Saulo Moreira
- **Classificação:** Crítica (configuração de produção/auth; indisponibilidade pública)
- **Data abertura:** 13/ago/2026
- **Risco segurança:** Baixo após revisão — somente chave publicável no frontend; service role permanece exclusivamente server-side.
- **Risco regressão:** Baixo e restrito à inicialização do cliente; nenhuma lógica funcional alterada.
- **Backup necessário:** configuração/código preservados no histórico versionado; banco e storage inalterados.
- **Arquivos alterados:** `.env.production` e documentação em `docs/production/*`.
- **Plano de teste:** healthcheck server-side, build publicado e reload real sem cache em home/catálogo nos dois domínios.
- **Plano de rollback:** restaurar commit `44756dc3` e republicar.
- **Aprovador:** Saulo Moreira (solicitação explícita nesta conversa)
- **Versão alvo:** v1.0.6
- **Status:** aprovado
- **Data fechamento:** pendente de validação pós-deploy
- **Observações pós-deploy:** bindings server-side confirmados antes da mudança por `/api/public/health` = 200; falha isolada ao bundle client.
