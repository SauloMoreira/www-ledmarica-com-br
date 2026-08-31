# Relatório Técnico e Funcional de Segurança — Plataforma Led Maricá

- **Versão:** 1.0
- **Data:** 12/maio/2026
- **Público-alvo:** Cliente, equipe de compliance e equipe técnica
# Relatório Técnico e Funcional de Segurança — Plataforma Led Maricá

- **Versão:** 1.0
- **Data:** 12/maio/2026
- **Público-alvo:** Cliente, equipe de compliance e equipe técnica
- **Objetivo:** Apresentar postura de segurança da plataforma, controles aplicados e riscos aceitos.

> **Nota de atualização (31/ago/2026):** este documento reflete o estado da
> plataforma em **12/maio/2026**, não o estado atual. Uma nova auditoria em
> 31/ago/2026 encontrou e corrigiu dois itens (um deles crítico) — ver a
> seção 20.1 e o `CHANGELOG.md` v1.0.9.


---

## Sumário

1. Sumário executivo
2. Escopo da auditoria
3. Ondas de segurança S1–S7
4. MFA / AAL2 / Admin
5. RLS e Supabase
6. Server functions
7. Webhook Mercado Pago
8. Estoque idempotente
9. Upload seguro
10. Proteção contra XSS
11. CSP / cookies / LGPD
12. Segurança do chat anônimo
13. Auditoria administrativa
14. Logs e mascaramento
15. Secrets e variáveis
16. Security scan final
17. Auditoria Codex
18. Correções P0 pós-Codex
19. Riscos aceitos formalmente
20. Pendências pós-Go-Live
21. Conclusão

---

## 1. Sumário executivo

A plataforma Led Maricá passou por **sete ondas de endurecimento** (S1–S7),
revisão **Codex read-only** e correções **P0** subsequentes. O scan final
de segurança apresentou **0 erros (ERROR)**, com apenas itens informativos
e melhorias futuras. Todos os fluxos críticos (pagamento, estoque, e-mail,
auditoria) foram validados em produção real.

**Classificação geral:** ✅ **Adequado para Go-Live**.

---

## 2. Escopo da auditoria

- Autenticação e autorização (admin e cliente)
- RLS (Row-Level Security) em todas as tabelas sensíveis
- Server functions (createServerFn) e API pública
- Webhook Mercado Pago (assinatura, idempotência, validação real)
- Estoque transacional e idempotente
- Upload de arquivos
- Chat anônimo
- LGPD/cookies/CSP
- Logs de auditoria e mascaramento
- Gestão de secrets
- Revisão externa Codex

---

## 3. Ondas de segurança S1–S7

| Onda | Foco | Status |
|---|---|---|
| S1 | MFA AAL2 obrigatório no admin | ✅ |
| S2 | RLS de profiles, roles, leads | ✅ |
| S3 | RLS de pedidos, B2B, financeiro | ✅ |
| S4 | Webhook MP, idempotência, secret | ✅ |
| S5 | Upload seguro, sanitização HTML | ✅ |
| S6 | Auditoria administrativa expandida | ✅ |
| S7 | Pendências pós-Codex (P0) | ✅ |

---

## 4. MFA / AAL2 / Admin

- Toda action administrativa exige sessão **AAL2** (challenge MFA respondido).
- Middleware único: `requireAdmin` (alias: `requireAdminMfa`,
  `requireAdminMfaSoft`).
- Admin sem fator cadastrado → redirecionado para `/conta` para enroll.
- Sessão AAL1 → 401 + redirect para `/mfa-challenge`.
- Validação no servidor via `assertAdminUserAal2` (não confia em claim do JWT
  isoladamente — checa profile + AAL).

---

## 5. RLS e Supabase

- **Todas as tabelas** com dado sensível têm RLS habilitada.
- Função `has_role(user_id, role)` em `SECURITY DEFINER` evita recursão.
- Tabela `user_roles`/`profiles.role` separa identidade e permissão.
- Leitura pública (catálogo, banners, etc.) é restrita a colunas seguras
  via views/RPCs.
- B2B usa RPC `get_user_approved_company_id` para garantir contexto.

---

## 6. Server functions

- Todas em `src/server/*.functions.ts` (segregadas por domínio).
- Helpers `*.server.ts` nunca importados pelo cliente (proteção pelo
  bundler).
- Inputs sempre validados com Zod.
- Funções administrativas usam `requireAdmin`.
- Funções públicas que aceitam input do usuário usam validação estrita +
  rate limit (`src/server/security/rateLimit.ts`).

---

## 7. Webhook Mercado Pago

- Endpoint: `POST /api/public/mercadopago/webhook`.
- Em produção, **secret obrigatório**; ausência → 503 + log
  `security_events`.
- Validação `x-signature` (HMAC SHA-256, manifest oficial do MP).
- **Sempre consulta `GET /v1/payments/{id}` na API oficial** antes de
  aprovar — nunca confia no body.
- Toda requisição registrada em `payment_webhook_events` (incl. falhas).
- Idempotente: mesmo evento reenviado não duplica baixa nem e-mail.
- **Validado em produção** com pedidos reais (#14, #17, #19).

---

## 8. Estoque idempotente

- RPC `decrement_stock_for_order` é transacional.
- Idempotência por `stock_decremented_at` no pedido.
- Auditoria em `stock_decrement_audit` com resultado
  (`decremented` / `already` / `failed`).
- Ajuste manual no admin → `adjustProductStock` registra responsável,
  motivo e diff.

---

## 9. Upload seguro

- Upload restrito a tipos permitidos (JPG, PNG, WebP).
- **SVG bloqueado** (vetor de XSS conhecido).
- **Data URLs bloqueadas**.
- Validação de mimetype real (não confia na extensão).
- Tamanho máximo aplicado.
- Implementado em `src/lib/uploadGuards.ts`.

---

## 10. Proteção contra XSS

- HTML rico de produto/conteúdo passa por `src/lib/sanitizeHtml.ts`.
- Componentes nunca usam `dangerouslySetInnerHTML` com input do usuário sem
  sanitização.
- React 19 escapa por padrão.
- CSP ativa (modo report-only inicialmente, com endpoint de coleta).

---

## 11. CSP / cookies / LGPD

- CSP configurada com endpoint `/api/public/csp-report` para violações.
- Cookies marcados `SameSite=None; Secure`.
- Banner LGPD obrigatório antes de qualquer script de analytics/marketing.
- Categorias: essenciais, analytics, marketing, personalização.
- Scripts injetados sob demanda em `ConditionalScripts.tsx`.
- IDs de integração validados por regex no servidor (anti-injeção).

---

## 12. Segurança do chat anônimo

- `session_id` no cliente é UUIDv4 (gerado pelo navegador).
- Rate limit por sessão e por IP.
- **Não há listagem pública** de conversas.
- Acesso à própria conversa apenas via `session_id` na URL/cookie.
- Risco aceito formalmente: fingerprint cruzado é possível em teoria, mas
  mitigado por ausência de dados pessoais sem opt-in explícito.

---

## 13. Auditoria administrativa

- Tabela `admin_audit_log` (admin_id nullable, `source` ∈ rpc/trigger_user/
  trigger_system).
- Triggers DB cobrem: products, home_banners, coupons, product_bundles e
  itens, companies, homepage_settings, finance_settings, leads, lead_*,
  automation_rules, whatsapp_templates, company_settings, local_delivery_*,
  marketing_integrations, b2b_settings, b2b_negotiations, homepage_*.
- Helpers semânticos (`logAdminAction`) em pedidos, MP, integrações,
  invoices, b2b, companies, finance, stockOps, fiscal.
- Exportação CSV com BOM em `/admin/seguranca/auditoria`.

---

## 14. Logs e mascaramento

- `logAdminAction` sanitiza tokens, secrets, senhas → `***`.
- CPF/CNPJ mascarado parcialmente nos logs.
- Diff técnico (trigger) + summary semântico (helper) coexistem por design.
- Logs de erro de servidor não vazam stack para o cliente.

---

## 15. Secrets e variáveis

Secrets gerenciados pelo Lovable Cloud (nunca commitados):

- `MERCADOPAGO_ACCESS_TOKEN` (produção)
- `MERCADOPAGO_WEBHOOK_SECRET`
- `RESEND_API_KEY`
- `LOVABLE_API_KEY` (AI Gateway)
- `EMAIL_PROVIDER` (`resend` ou `lovable_email`)

Públicos (seguros em código):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
  `VITE_SUPABASE_PROJECT_ID`.

> Nenhum secret é exposto neste documento.

---

## 16. Security scan final

- Resultado: **0 ERROR**.
- Avisos remanescentes: itens informativos do linter Supabase
  (`SECURITY DEFINER` em funções por design + `search_path` documentado).
- Decisão: **aceitar** — não são vulnerabilidades, são padrões intencionais.

---

## 17. Auditoria Codex

Auditoria externa Codex (read-only) cobriu: fluxo de pedido, webhook MP,
admin, RLS, upload, B2B, e-mail, LGPD. Resultado: **sem vulnerabilidade
crítica aberta**. Recomendações classificadas como melhorias foram triadas
em P0 (resolver antes do Go-Live) e P1+ (roadmap pós-Go-Live).

---

## 18. Correções P0 pós-Codex

| Item | Resolução |
|---|---|
| RPCs B2B auxiliares sem RLS estrita | Endurecidas com `SECURITY DEFINER` + checagem explícita |
| Lock de reenvio manual de e-mail | Implementado (anti-duplicidade) |
| Upload SVG / data URL | Bloqueado |
| Sessão AAL1 em rota admin | Bloqueada com 401 (sem `soft`) |
| Webhook MP sem secret em produção | 503 obrigatório + log |
| Sanitização de logs | `***` em tokens/secrets |

---

## 19. Riscos aceitos formalmente

- **Chat anônimo:** sem login obrigatório. Mitigação por rate limit e
  ausência de listagem pública. Risco aceito pelo cliente.
- **Roles binárias (admin x cliente):** decisão consciente. Reabertura
  futura como projeto "Perfis e Permissões Avançadas" se houver demanda.
- **Linter Supabase — `SECURITY DEFINER` / `search_path`:** padrões
  intencionais documentados; não são vulnerabilidades.
- **CSP em modo permissivo (sem nonce/hash):** planejada para 90 dias.

---

## 20. Pendências pós-Go-Live

- CSP estrita com nonce/hash.
- Testes automatizados de webhook MP e checkout.
- Política formal de retenção/anonimização LGPD.
- Roles administrativos granulares (se demanda surgir).
- Migração para Lovable Emails após domínio próprio.

---

## 21. Conclusão

A plataforma apresenta postura de segurança **adequada e madura para
Go-Live**, com controles modernos (MFA AAL2, RLS, idempotência, auditoria
ampla) e validação real em produção. Nenhum risco crítico permanece aberto.
Pendências são melhorias evolutivas, não bloqueios.

**Classificação final:** ✅ **APROVADO PARA PRODUÇÃO**.

| Categoria | Quantidade |
|---|---|
| Crítico aberto | 0 |
| Alto aberto | 0 |
| Médio aberto | 0 |
| Baixo / informativo | (linter Supabase, documentado) |
| Riscos aceitos | 4 (documentados) |

**Próximos passos:**

1. Monitorar `payment_webhook_events` e `email_events` na primeira semana.
2. Iniciar implementação CSP estrita no roadmap 90 dias.
3. Reavaliar postura em 90 dias com novo scan completo.
