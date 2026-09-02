# CHANGELOG — Led Maricá (Produção)

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e versionamento [SemVer](https://semver.org/lang/pt-BR/).

> Toda entrada deve referenciar a release em `RELEASES.md` e o item de
> mudança em `CHANGE_CONTROL.md`.

---

## [1.1.0] — 2026-09-02

**Tipo:** nova funcionalidade (automação de e-mails)
**Classificação:** Média (e-mails transacionais/promocionais + novos jobs pg_cron)

### Adicionado
- **Lembretes de pagamento** (`payment_reminder_2h`, `payment_reminder_24h`) para
  pedidos `pending` ainda não pagos (2h–24h e 24h–72h). Idempotentes por
  `order_id + type` em `email_events`, respeitando `is_active`/`auto_send`.
- **Recuperação de carrinho abandonado** (`abandoned_cart_recovery`): envio único
  por carrinho, com link de descadastro e atualização para `contato_enviado`.
- **Opt-out**: tabela `email_unsubscribes`, rota `/api/public/email/unsubscribe`
  e página pública `/descadastro` (noindex). Checado antes de e-mails promocionais.
- **Disparo periódico**: rota `POST /api/public/internal/cron-dispatch` protegida
  por segredo (`internal_config.cron_secret` ou `INTERNAL_CRON_SECRET`), acionada
  por dois jobs pg_cron horários via `pg_net`.

### Alterado
- `detect_abandoned_carts` agora preenche nome, e-mail e telefone do cliente logado.
- `email_events` ganhou `abandoned_cart_id`.

## [1.0.10] — 2026-08-31


**Tipo:** correção de segurança (RLS / exposição de rascunho)
**ChangeControl:** CC-2026-013
**Classificação:** Baixa (exposição de produto não publicado, sem dado pessoal)
**Aplicação:** SQL direto no banco de produção, sem alteração de código de aplicação.

### Corrigido
- **Leitura pública de filhos de produto inativo**: as policies
  `product_images_public_read` (`product_images`) e
  "Variant options are publicly readable" (`product_variant_options`) usavam
  `USING (true)`, permitindo que qualquer visitante lesse imagens e opções de
  variação de produtos ainda em rascunho (`active = false`) antes da publicação.
  Ambas passaram a usar
  `is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM products p WHERE p.id = <tabela>.product_id AND p.active = true)`,
  alinhando-se ao padrão já aplicado em `product_attributes_public_read`.
- **Defesa em profundidade em `profiles`**: a policy `profiles_self_insert` passou a
  ter `WITH CHECK (auth.uid() = id AND role = 'customer')`, somando-se ao trigger
  `trg_enforce_profile_role` (v1.0.9). Duas camadas independentes impedem a
  auto-promoção a admin no cadastro, mesmo que uma delas seja removida por engano.
- **Falsificação de `user_id` em logs/chat**: as policies de INSERT
  `chat_insert` (`chat_messages`) e `search_logs_public_insert` (`search_logs`)
  validavam papel e conteúdo, mas não o `user_id`, permitindo atribuir buscas ou
  mensagens ao `user_id` de outra pessoa (polui score de lead e relatórios).
  Ambas passaram a ter `WITH CHECK (... AND (user_id IS NULL OR user_id = auth.uid()))`:
  inserção anônima (`user_id` NULL) segue permitida; o bloqueado é marcar a linha
  com o `user_id` de terceiro.
- **Policies explícitas de SELECT em buckets públicos**: criadas as policies
  `Public read product-images` (`product-images`) e `Public read marketing-creatives`
  (`marketing-creatives`) em `storage.objects`. Os buckets já eram `public=true`
  (leitura pública por URL, intencional para a vitrine/criativos); a policy explícita
  apenas documenta a intenção e torna o acesso auditável. Zero mudança de comportamento.

### Validação
- 636 produtos ativos com imagem seguem legíveis publicamente (catálogo intacto).
- 3 produtos inativos com imagem deixaram de ser legíveis para não-admin.
- Cadastro de usuário comum inalterado (trigger normaliza `role` antes do WITH CHECK).
- Inserção anônima em `chat_messages`/`search_logs` (`user_id` NULL) segue permitida.
- Buckets `product-images`/`marketing-creatives` seguem públicos; leitura por URL intacta.
- Security Scan pós-fix: **0 error**. Os achados `companies_cnpj_contact_exposed...`,
  `storage_marketing_creatives_select_missing`, `storage_product_images_select_missing`,
  `chat_messages_insert_user_id_spoofing`, `search_logs_insert_user_id_spoofing` e
  `profiles_self_insert_role_escalation` não reaparecem.


### Notas de rollback
- Recriar as duas policies com `USING (true)`. **Não recomendado** — reabre a
  exposição de rascunhos.

---

## [1.0.9] — 2026-08-31


**Tipo:** correção de segurança (autorização / RLS)
**ChangeControl:** CC-2026-012
**Classificação:** Crítica (vazamento de dados comerciais/confidenciais)
**Aplicação:** SQL direto no banco de produção, sem alteração de código de aplicação.

### Corrigido
- **Escalada de papel em `profiles`**: criado o trigger `enforce_profile_role`
  (`trg_enforce_profile_role`), que força `role = 'customer'` na criação do perfil
  e impede que um usuário altere o próprio `role` (auto-promoção a admin) em
  atualizações. Promoção a admin passa a ocorrer exclusivamente por caminho
  administrativo com service role + MFA.
- **Funções `SECURITY DEFINER` sem checagem interna de autorização**: as funções
  `get_stock_report`, `get_commercial_sales_aggregate`, `get_stock_counters` e
  `get_commercial_review_counters` tinham `GRANT EXECUTE ... TO authenticated`
  sem validar o papel do chamador. Qualquer cliente autenticado (não-admin)
  podia consultar, por RPC direta, estoque, vendas, receita e sinais de margem
  por produto. Corrigido com `IF NOT is_admin(auth.uid()) THEN RAISE EXCEPTION`
  no início de cada função, replicando o padrão já usado em `admin_get_product`,
  `admin_list_products` e `import_product_with_attrs`.

### Alterado (código de aplicação, mesma data)
- Escritas administrativas que antes exigiam apenas `role = 'admin'` passam a
  exigir também sessão AAL2 (segundo fator): `adminBlockUser`, `adminUnblockUser`,
  `adminArchiveUser`, `adminRestoreUser`, `adminSendPasswordReset`
  (`users.functions.ts`), `adminUpdateCompanyStatus` (`companies.functions.ts`)
  e `adminUpdateB2bSettings` (`b2bSettings.functions.ts`). Funções somente-leitura
  (listagens, relatórios, contadores) seguem com verificação simples de admin.

### Notas de rollback
- Banco: remover o trigger `trg_enforce_profile_role` e recriar as 4 funções sem o
  bloco `IF NOT is_admin(...)`. **Não recomendado** — reabre o vazamento.
- Código: reverter os três arquivos de server functions citados; sem alteração de
  schema, checkout, pagamento ou estoque.

---

## [1.0.8] — 2026-08-31

**Tipo:** correção de segurança (RLS / B2B)
**Classificação:** Alta

### Corrigido
- **Escalada de privilégio em `company_users`**: a policy `company_users_self_insert`
  validava apenas `auth.uid() = user_id`, sem restringir `company_id` — qualquer
  usuário autenticado podia se auto-vincular a **qualquer** empresa e passar a ver
  preços/condições B2B negociados de outro cliente (e comprar em nome dela).
- Policy removida e `INSERT/UPDATE/DELETE` revogados de `authenticated`/`anon`.
  Vínculos passam a ser criados exclusivamente por código de servidor
  (`createCompany` em `src/server/companies.functions.ts`, via service role, que
  vincula o próprio usuário como `owner` da empresa que ele acabou de cadastrar)
  ou por admin (`company_users_admin_all`). Leitura (`SELECT`) inalterada.

---


## [1.0.7] — 2026-08-26

**Tipo:** integração (marketing/analytics)
**ChangeControl:** CC-2026-011
**Classificação:** Média

### Adicionado
- Integração `google_ads` (tag `AW-18412575433`) na tabela `marketing_integrations`, habilitada com consent_category `marketing`; carregamento via `ConditionalScripts.tsx` respeitando LGPD (sem script manual no `__root.tsx`).
- Função `trackGoogleAdsPurchase` em `src/lib/tracking.ts`: dispara a conversão "Compra" (`AW-18412575433/6cdfCIqvtOgcEMm15stE`) apenas com consentimento de marketing.
- Disparo da conversão na página `/pedido/:id/confirmacao` somente quando `paymentStatus` é `paid` ou `approved` (valores canônicos já usados no código), com deduplicação por pedido via `localStorage` (`gads_conversion_<orderId>`) para não repetir em refresh.

### Notas de rollback
- Desativar a linha `google_ads` em `marketing_integrations` (`enabled=false`) e reverter os dois arquivos de código; sem alteração de schema, checkout, pagamento, estoque ou RLS.

---

## [1.0.6] — 2026-08-13

**Tipo:** hotfix crítico de configuração de produção
**ChangeControl:** CC-2026-010
**Classificação:** Crítica (configuração do build publicado e autenticação)

### Corrigido
- Restaurada a injeção, em tempo de build de produção, das variáveis públicas `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` por meio de `.env.production`.
- Mantidos `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` exclusivamente como bindings gerenciados no runtime server-side; nenhuma chave privilegiada foi adicionada ao código ou a arquivos versionados.

### Diagnóstico
- O endpoint publicado `/api/public/health` respondeu `200` e acessou o banco, comprovando que os bindings server-side estavam presentes no Worker.
- A falha ocorria no bundle do navegador (`main-*.js`): após a remoção do `.env` versionado, o processo de publish não recebia as variáveis `VITE_*` em build-time, enquanto o preview continuava recebendo-as do ambiente do editor.

### Segurança
- Apenas URL, identificador e chave publicável foram incluídos no artefato frontend, conforme o modelo de segurança do backend com RLS.
- `SUPABASE_SERVICE_ROLE_KEY` permanece somente no runtime server-side.

### Notas de rollback
- Versão anterior: commit `44756dc3`.
- Rollback: restaurar o commit anterior e republicar; não há alteração de banco, dados, RLS, checkout, pagamento ou estoque.
- Backup pré-deploy: cópia de configuração/código no histórico versionado; banco inalterado.

---

## [1.0.5] — 2026-06-23

**Tipo:** correção crítica (importação de produtos por planilha — códigos como texto)
**ChangeControl:** CC-2026-009
**Classificação:** Média (alterações em planilha modelo, parser de importação, RPC nova; sem impacto em checkout, MP, webhook, pedidos, estoque pós-venda, e-mails)

> Numeração: planejada internamente como "v1.0.4 — códigos como texto", entregue
> como v1.0.5 porque a v1.0.4 já estava ocupada (CC-2026-008, exclusão de produtos).

### Corrigido
- **SKU, EAN/GTIN, código de barras, NCM, CEST, CFOP, código do fornecedor, modelo e marca**
  agora são tratados como TEXTO em todo o fluxo (planilha, parser, revisão, simulação,
  commit, banco). Não há mais conversão numérica em colunas-código:
  - Excel reabre a planilha modelo com formato real de Texto (`numFmtId=49`) aplicado no
    nível da coluna e nas células vazias das linhas 2–10000 das colunas críticas, com tabela
    Excel `TabelaProdutosImportacao`, para impedir notação científica na digitação.
  - O parser detecta células que chegaram com tipo `n` (numérico) em colunas-código e
    bloqueia a linha com mensagem clara: "formate como TEXTO e digite novamente".
  - Regex adicional bloqueia notação científica residual (`7,89123E+12`).
  - Campos vazios com `CHECK` (NCM/CEST/CFOP/GTIN) são enviados como `null`, não string vazia.
- **`codigo_barras` mapeado para `products.gtin_ean`** (sinônimo operacional). Se
  `codigo_barras` e `ean_gtin` forem preenchidos e divergirem, a linha é bloqueada.
- **Categoria ambígua** (mais de uma categoria com mesmo nome/slug) agora bloqueia a linha
  até seleção humana.

### Adicionado
- **RPC atômica `public.import_product_with_attrs(_mode, _payload, _attrs)`**:
  - `SECURITY DEFINER SET search_path = public, pg_temp`.
  - `REVOKE EXECUTE FROM PUBLIC, anon`; `GRANT EXECUTE TO authenticated, service_role`.
  - Checa `is_admin(auth.uid())` + `auth.jwt()->>'aal' = 'aal2'` quando chamada por usuário
    autenticado direto (service_role bypass — servidor já valida admin+AAL2 na entrada).
  - Whitelist de campos do payload (não aceita mudar pedidos, roles, permissões, estoque
    pós-venda, payment_status, owner, etc.).
  - Insere/atualiza `products` + `product_attributes` em uma única transação. Falha em
    qualquer passo reverte a linha inteira; outras linhas seguem.
- **Auditoria** com eventos `product_import.parse`, `product_import.simulate`,
  `product_import.commit`, `product_import.blocked`, `product_import.export_revised`.
- **Tela de revisão** (`/admin/produtos/importacao-ia`) ganhou inputs editáveis `type="text"`
  para `ean_gtin`, `codigo_barras`, `ncm`, `cest`, `cfop_default`, `marca`, `modelo`,
  `codigo_fornecedor`.
- **`safeCell`** prefixa apóstrofo em strings que começam com `=`, `+`, `-`, `@` na
  exportação XLSX revisada (proteção contra injeção de fórmula). Aplicado SOMENTE na
  exportação — nunca em valores persistidos no banco.

### Segurança
- Validação NCM/CEST/CFOP é apenas **estrutural** (formato válido) — nunca "fiscalmente
  correto". A correção fiscal continua sendo responsabilidade contábil/operacional.
- Nenhuma alteração em checkout, Mercado Pago, webhook, pedidos, estoque pós-venda,
  e-mails transacionais, CRM, GA4, DNS, MFA/AAL2 geral, RLS, policies ou permissões públicas.

### Ajuste pós-teste manual — 2026-06-23
- Modelo oficial regenerado novamente após identificação de conversão do SKU longo pelo
  Excel em célula vazia. As células das colunas `sku`, `ean_gtin`, `codigo_barras`, `ncm`,
  `cest`, `cfop_default`, `codigo_fornecedor`, `modelo` e `marca` agora são materializadas
  como células Texto (`@`) da linha 1 até a 10000, não apenas via dimensão/estilo de coluna.
- Link da tela administrativa atualizado com cache-buster para evitar download do modelo antigo.
- Aceite operacional da v1.0.5 permanece pendente até validação manual no Excel com o SKU
  `7891234567890123` preservado exatamente como texto após salvar e reabrir.

### Hotfix do modelo Excel — 2026-06-23
- Confirmada a causa raiz do teste manual: só materializar células vazias não garantia que o
  Excel aplicasse **Texto** na digitação do usuário final em algumas instalações. O modelo foi
  regenerado com formato `@` também no **estilo da coluna** para `sku`, `ean_gtin`,
  `codigo_barras`, `ncm`, `cest`, `cfop_default`, `codigo_fornecedor`, `modelo` e `marca`,
  além das células já materializadas e da tabela `TabelaProdutosImportacao`.
- O download agora aponta para um novo nome físico de arquivo
  (`Cadastro_Minimo_Produtos_Led_Marica_IA_v1.0.5_Texto.xlsx`) para eliminar risco de cache
  do arquivo antigo. A v1.0.5 continua sem aceite operacional até o usuário baixar o modelo
  oficial, digitar `7891234567890123` na coluna SKU e confirmar que o Excel mantém o valor
  exatamente assim.

### Hotfix reforçado do modelo Excel — 2026-06-23
- Após nova evidência manual (SKU `7891234567890123` ainda exibido como `7,89123E+15`),
  o modelo foi reforçado para usar o formato Texto nativo do Excel (`numFmtId=49`) com
  `quotePrefix=1` nos estilos aplicados às colunas críticas e às células materializadas.
- O link administrativo agora aponta para novo arquivo físico
  `Cadastro_Minimo_Produtos_Led_Marica_IA_v1.0.5_Texto_ExcelSeguro.xlsx`, mantendo o nome
  de download amigável `Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx`, para forçar o usuário
  a baixar o modelo corrigido sem reaproveitar cache antigo.
- Este hotfix foi supersedido pelo hotfix corretivo abaixo, que remove a dependência de
  validação/tooltip e regenera o XLSX oficial com formato Texto estrutural.

### Hotfix corretivo do XLSX oficial — 2026-06-23
- Após reprovação manual adicional, o arquivo oficial
  `public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` foi regenerado com
  `xlsxwriter`, sem depender de tooltip, comentário ou DataValidation como solução.
- As colunas `sku`, `ean_gtin`, `codigo_barras`, `ncm`, `cest`, `cfop_default`,
  `codigo_fornecedor`, `modelo` e `marca` receberam formato real de Texto no nível da
  coluna (`numFmtId=49`) e células vazias pré-formatadas como Texto das linhas 2 até 10000.
- A linha de exemplo usa SKU longo `7891234567890123` escrito como string para validação
  objetiva no Excel.
- O botão oficial voltou a apontar para o arquivo oficial único
  `Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` com cache-buster, removendo dependência dos
  nomes físicos antigos `v1.0.5_Texto` e `ExcelSeguro`.
- A v1.0.5 permanece pendente de aceite manual enquanto o modelo baixável não for validado
  no Microsoft Excel com SKU numérico longo preservado como Texto.

### Arquivos
- `supabase/migrations/*_import_product_with_attrs.sql` (nova RPC)
- `public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` (regenerada)
- `src/lib/productImport.ts` (tipos novos + helpers `nullIfEmpty`, `safeCell`, `isScientificNotation`, `validateNcmFormat`, `validateCestFormat`, `validateCfopFormat`, `CODE_COLUMN_KEYS`)
- `src/server/productImport.functions.ts` (HEADER_MAP estendido, detecção numérica, merge `codigo_barras`↔`gtin_ean`, RPC no commit, audits, safeCell no export)
- `src/routes/admin.produtos.importacao-ia.tsx` (fieldset de códigos + atributos)
- `docs/production/CHANGE_CONTROL.md` (CC-2026-009 com rollback)

---

## [1.0.4] — 2026-06-02

**Tipo:** correção (exclusão de produtos com pedidos vinculados)
**ChangeControl:** CC-2026-008
**Classificação:** Baixa (apenas UI de exclusão; sem migration, sem mudança em RLS/checkout/MP)

### Corrigido
- **Erro ao excluir produtos de homologação** (`update or delete on table
  "products" violates foreign key constraint "order_items_product_id_fkey"`).
  Produtos com itens em pedidos não podem ser apagados fisicamente
  (preserva histórico fiscal/financeiro). O botão Excluir em
  `/admin/produtos` agora:
  1. Verifica antes se existem `order_items` vinculados;
  2. Se existir, oferece **arquivamento** (active=false, SKU/slug com
     sufixo `-arq-<ts>` para liberar reuso) em vez de exclusão;
  3. Se não existir, mantém exclusão definitiva;
  4. Em caso de FK residual (combos/estoque), exibe mensagem em
     português em vez do erro técnico do Postgres.

## [1.0.3] — 2026-06-01

**Tipo:** correção (qualidade do cadastro + contexto de SEO/IA)
**ChangeControl:** CC-2026-007
**Classificação:** Baixa (somente leitura/avaliação e prompt de IA; nada de DB, RLS, checkout, MP, webhook, estoque, pedidos, e-mail)

### Corrigido
- **Card "Qualidade do Cadastro"** no editor de produto não recebia
  `product_attributes`, então sempre exibia "Sem atributos técnicos" mesmo
  com vários atributos cadastrados. Passou a buscar a mesma query usada
  por `ProductAttributesSection` (cache compartilhado) e a passar a lista
  para `computeProductQuality`.
- **Detecção de NCM**: além da coluna fiscal `products.ncm`, agora aceita
  NCM cadastrado como atributo técnico (chave/label normalizada para
  `ncm`). Normalização aceita formatos `8539.52.00`, `85395200` ou com
  espaços — só os 8 dígitos importam. Função pura `normalizeNcm()`.
- **Reconhecimento de chaves PT-BR**: heurísticas de iluminação
  (potência/voltagem/temperatura de cor/IP) passaram a usar um mapa de
  "slots" (`attrSlot`) que aceita `potencia`/`potencia_w`/`watts`,
  `tensao`/`tensao_v`/`voltagem`/`bivolt`, `temperatura_cor`/`cct`,
  `grau_protecao_ip`/`ip`. Antes só reconhecia as chaves em inglês.
- **"Sem atributos técnicos"** agora considera `attribute_value` preenchido
  (qualquer atributo cadastrado), independentemente de `is_visible` ou
  `is_filterable`. Bônus extra a partir de 3 atributos.
- **Texto do aviso de NCM** suavizado: "NCM não informado. Campo
  recomendado para organização fiscal, mas não bloqueia a venda — a
  emissão fiscal é feita fora da plataforma."

### Adicionado
- `QualityResult.techSummary` com `total`, `visible`, `filterable`,
  `ncm` (8 dígitos detectado) e `ncmSource` (`column` | `attribute`).
  Exibido no card como "N atributo(s) técnico(s) cadastrado(s) · K
  usado(s) como filtro" + "NCM: 8539.52.00 (detectado nos atributos)".
- IA de SEO (`improveProductSeo` e `boostProductSeoAuto`) passou a
  receber atributos técnicos, NCM e tags do produto no prompt do
  usuário. Adicionada instrução anti-alucinação no system prompt:
  "use apenas os dados técnicos fornecidos no cadastro. NÃO invente
  potência, tensão, certificação, garantia, NCM, fluxo luminoso,
  soquete, IP, dimensões ou qualquer especificação técnica."
- `boostProductSeoAuto` agora carrega `product_attributes`, `ncm` e
  `tags` da própria tabela de produtos antes de chamar a IA.

### Segurança
- Sem mudança de RLS, policies, MFA, AAL2 ou rotas públicas.
- Sem alteração em checkout, Mercado Pago, webhook, estoque, pedidos,
  e-mails transacionais, CRM, GA4 ou DNS.
- Nenhuma migration nesta release.

### Arquivos
- `src/lib/productQuality.ts` — `normalizeNcm`, `attrSlot`,
  `QualityAttributeInput.is_filterable/attribute_label`,
  `QualityResult.techSummary`, NCM via coluna OU atributo, heurísticas
  PT-BR, "Sem atributos técnicos" baseado em `techAttrs`.
- `src/routes/admin.produtos.$id.tsx` — `useQuery` de
  `adminListProductAttributes`, `product_attributes` no
  `computeProductQuality`, bloco de resumo técnico + NCM detectado no
  `QualityPanel`, contexto adicional repassado ao `ProductSEOSection`.
- `src/components/admin/ProductSEOSection.tsx` — `productCtx` aceita
  `ncm`, `tags`, `attributes`; repasse para `improveProductSeo`.
- `src/server/seo.functions.ts` — `InputSchema` com `ncm/tags/attributes`,
  `buildUserPrompt` lista atributos e NCM, system prompt com regra
  anti-alucinação, `boostProductSeoAuto` carrega atributos do DB.

### Rollback
- Reverter o commit. Sem migration, sem dado mutado em produção.

---

## [1.1.0-c] — 2026-06-01

**Tipo:** funcionalidade nova (fase 3/3 de v1.1.0) + correção crítica + i18n de auth
**ChangeControl:** CC-2026-006
**Classificação:** Crítica (mudança de role + LGPD + exclusão definitiva)

### Adicionado
- **Ações sensíveis** em `src/server/users.functions.ts` (todas exigem
  `requireSupabaseAuth` + `assertAdmin` + `assertAal2` e gravam
  `admin_audit_log`):
  - `adminPromoteToAdmin` / `adminDemoteToUser` — alteração de função
    `admin ↔ user`. Bloqueia mudar a própria função e despromover o
    último admin ativo. Encerra sessões do alvo (signOut global) para
    forçar reavaliação de claims.
  - `adminAnonymizeUser` — anonimização LGPD: substitui `name`/`email`/
    `phone`/`avatar_url` por valores genéricos, marca `status=archived`,
    atualiza `auth.users` com e-mail neutro e aplica `ban_duration`
    longo. Mantém o registro para integridade de pedidos/notas/auditoria.
  - `adminDeleteUser` — exclusão definitiva. **Bloqueia** se houver
    qualquer pedido vinculado e instrui a usar anonimização. Remove
    `company_users`, `addresses`, `auth.users` (cascata para `profiles`).
- Validações de input com Zod: motivo mín. 3 caracteres + string de
  confirmação literal (`CONFIRMAR` / `ANONIMIZAR` / `EXCLUIR`).
- Drawer `/admin/usuarios`: nova seção **Ações sensíveis · exigem MFA**
  com botões Promover/Remover admin, Anonimizar (LGPD), Excluir.
  Cada botão valida AAL2 no client (`mfa.getAuthenticatorAssuranceLevel`)
  antes de chamar a server fn, e exige dois prompts (motivo + confirmação
  literal).

### Corrigido (crítico)
- **Rota `/reset-password` ausente** (404). Tanto o e-mail enviado por
  `esqueci-senha` quanto `adminSendPasswordReset` redirecionavam para
  uma URL inexistente — usuários ficavam sem como concluir a redefinição.
  Criado `src/routes/reset-password.tsx` com validação do token de
  recovery via `onAuthStateChange`, formulário de nova senha (mín. 6 +
  confirmação) e `supabase.auth.updateUser({ password })`.

### Internacionalizado (mensagens de erro de auth)
- Novo `src/lib/authErrors.ts` com `translateAuthError()` mapeando ~25
  padrões do Supabase Auth (credenciais inválidas, e-mail não confirmado,
  rate limit, senha fraca, token expirado, captcha, rede, etc.) para
  PT-BR. Quando não há match, devolve fallback amigável (nunca vaza
  string em inglês).
- Aplicado em `src/routes/login.tsx`, `src/routes/cadastro.tsx`,
  `src/routes/esqueci-senha.tsx` e `src/routes/reset-password.tsx`.

### Segurança
- Promoção/demoção/anonimização/exclusão exigem AAL2 (claim `aal=aal2`
  validada no server). Sem MFA cadastrado a ação é rejeitada com
  "MFA obrigatório para esta ação".
- Toda operação sensível registra `before`/`after` em
  `admin_audit_log` (PII mascarada pelo `logAdminAction`).
- Exclusão definitiva é defensiva: bloqueada se houver pedidos.

### Risco residual
- Nenhuma migration de DB nesta fase — apenas server fns + UI + i18n.
- Anonimização não toca em `orders.shipping_address` ou snapshots de
  endereço dentro de pedidos (decisão consciente: nota fiscal exige
  histórico). Para apagamento total exigir processo manual com fiscal.

---

## [1.1.0-b] — 2026-06-01

**Tipo:** funcionalidade nova (fase 2/3 de v1.1.0)
**ChangeControl:** CC-2026-005
**Classificação:** Alta (ações sobre contas + guard de login)

### Adicionado
- Server functions de ação em `src/server/users.functions.ts`:
  `adminBlockUser`, `adminUnblockUser`, `adminArchiveUser`,
  `adminRestoreUser`, `adminSendPasswordReset`. Todas exigem
  `requireSupabaseAuth` + `assertAdmin`, registram `admin_audit_log`
  via `logAdminAction` e encerram sessões ativas (signOut global) ao
  bloquear/arquivar.
- Salvaguardas: bloqueio impede ação sobre o próprio usuário e sobre o
  último admin ativo do sistema. Reset de senha só permitido para contas
  ativas (usa `auth.admin.generateLink` tipo recovery com `redirectTo`
  para `/reset-password`).
- Drawer de `/admin/usuarios` agora exibe ações: **Enviar redefinição de
  senha**, **Bloquear**, **Arquivar**, **Desbloquear**, **Restaurar** com
  confirmação e captura de motivo (gravado em auditoria).
- Guard de login (`src/routes/login.tsx`): após `signInWithPassword` e
  antes do redirect, lê `profiles.status`; se `blocked`/`archived`,
  encerra a sessão e exibe mensagem clara ao usuário.

### Segurança
- Nenhuma mudança em RLS, MFA, policies, checkout/MP, webhook, e-mails
  transacionais, importação ou DNS.
- `supabaseAdmin` continua restrito a `*.server.ts`/`*.functions.ts`.
- Alteração de função (admin↔cliente), anonimização LGPD e exclusão
  segura permanecem fora desta fase (planejados em v1.1.0-c com
  exigência de MFA/AAL2).

---

## [1.1.0-a] — 2026-06-01

**Tipo:** funcionalidade nova (fase 1/3 de v1.1.0)
**ChangeControl:** CC-2026-005
**Classificação:** Alta (mexe em estrutura de `profiles` usada por auth)

### Adicionado
- Migration: coluna `profiles.status` (`active`/`blocked`/`archived`, default
  `active`) + trigger de validação `validate_profile_status` + índices
  `profiles_status_idx` e `profiles_role_idx`. Nenhum usuário existente
  afetado (todos `active`).
- Server functions (somente leitura) em `src/server/users.functions.ts`:
  `adminListUsers`, `adminUsersSummary`, `adminGetUserDetail`.
- Helper `src/server/security/assertAdmin.ts` (`assertAdmin`, `assertAal2`)
  para guarda server-side compartilhada nas próximas fases.
- Rota `/admin/usuarios` ("Usuários e Clientes") com cards-resumo, busca,
  filtros (admins / B2C / B2B aprovados / B2B pendentes / ativos /
  bloqueados / com pedido / sem pedido), ordenação, paginação e drawer de
  detalhe (dados, empresa, pedidos, endereços, leads, auditoria).
- Link no `AdminSidebar` em **Clientes & CRM → Usuários e Clientes**.

### Segurança
- Toda chamada exige `requireSupabaseAuth` + `assertAdmin` no servidor.
- `supabaseAdmin` (service_role) só em `*.server.ts` e `*.functions.ts`.
- Nenhuma RLS, MFA, policy ou regra de checkout/MP/webhook foi alterada.
- Nenhuma ação destrutiva exposta nesta fase.

### Pendente (próximas fases)
- **v1.1.0-b** — bloquear/desbloquear/arquivar, reset de senha por e-mail,
  botões inline de aprovar/bloquear B2B, guard de login para `blocked`,
  modais com motivo obrigatório.
- **v1.1.0-c** — alterar `role` admin↔user (com AAL2 + confirmação forte),
  anonimização LGPD, exclusão definitiva condicionada a histórico zero.

### Rollback
`ALTER TABLE public.profiles DROP COLUMN status;` +
`DROP FUNCTION public.validate_profile_status() CASCADE;` + reverter os
arquivos novos (rota, server fn, helper) e o link no sidebar.

---


## [1.0.2] — 2026-06-01

**Tipo:** melhoria (controlada)
**ChangeControl:** CC-2026-004
**Classificação:** Média

### Adicionado
- Suporte a **dados técnicos opcionais** na importação de produtos via planilha
  (29 campos: marca, modelo, potencia_w, tensao_v, corrente_a, frequencia_hz,
  temperatura_cor_k, fluxo_luminoso_lm, eficiencia_lm_w, soquete,
  grau_protecao_ip, cor_produto, material, dimensoes, peso_kg, comprimento_m,
  bitola_mm, amperagem_a, numero_polos, curva_disjuntor, tipo_instalacao,
  vida_util_horas, certificacao, norma_tecnica, garantia, codigo_fornecedor,
  observacoes_tecnicas, fonte_dados_tecnicos, dados_tecnicos_revisados).
- Catálogo central `TECH_FIELDS` em `src/lib/productImport.ts` com label,
  unidade, validação numérica e padrões (ex.: IP\d{2}).
- Validação leve não-bloqueante (`validateTechValue`):
  números negativos/ inválidos viram erro; campos `certificacao` e
  `norma_tecnica` geram aviso "exige revisão humana com fonte".
- Persistência no commit: `marca → products.brand`, `peso_kg →
  products.weight_kg`, demais campos vão para `product_attributes`
  (label + unidade do catálogo). Campos vazios são ignorados.

### Alterado
- `parseImportSheet` agora lê colunas técnicas além das mínimas — desconhecidas
  são ignoradas; vazias não bloqueiam.
- `validateImportRows` agrega erros/avisos técnicos e devolve `row.tech`
  sanitizado.

### Segurança
- Sem alterações em checkout, Mercado Pago, webhook, estoque de pedidos,
  pedidos, e-mails transacionais, CRM, GA4, DNS, MFA/AAL2, RLS, policies
  ou permissões públicas.
- IA continua proibida de inventar valores técnicos (regra já reforçada no
  `SYSTEM_PROMPT_IA` desde v1.0.0).
- Rota `/admin/produtos/importacao-ia` continua restrita a admin com MFA/AAL2.
- Importação continua exigindo `revisado_humano=sim` + `aprovado_importar=sim`.
- Falha ao inserir atributos técnicos é logada mas não bloqueia o produto
  (best-effort).

### Pendente para v1.0.2.1 (próxima janela)
- Seção "Dados técnicos opcionais" no `EditRowDialog` da tela de revisão
  (edição inline dos campos técnicos pré-importação).
- Indicadores "Dados técnicos preenchidos / com alerta" na grade.

### Concluído nesta versão (atualização de 01/jun/2026)
- **Planilha modelo regenerada** (`public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx`):
  agora com 40 colunas (11 base + 29 técnicas opcionais), cabeçalho técnico
  destacado em verde, linha-exemplo preenchida, aba **INSTRUÇÕES** ampliada
  com descrição de cada campo técnico (unidade, formato esperado, aviso de
  revisão humana para certificação/norma) e nova aba **MAPA_IA** explicando
  o que a IA preenche × o que o humano preenche.
- **`downloadRevisedSheet`** agora inclui as 29 colunas técnicas no arquivo
  revisado baixado pelo admin, preservando o que foi digitado/sanitizado por
  linha. Colunas vazias permanecem em branco.


### Notas de rollback
- Versão anterior estável: 1.0.1
- Backup pré-deploy: não obrigatório (parser + validação aditivos; persistência
  só roda se houver dado técnico preenchido). Snapshot diário cobre.

### Arquivos alterados
- `src/lib/productImport.ts`
- `src/server/productImport.functions.ts`
- `docs/production/CHANGELOG.md`

---



## [1.0.1] — 2026-05-30

**Tipo:** melhoria (hotfix de UX)
**ChangeControl:** CC-2026-003
**Classificação:** Média (MEL-2026-002)

### Alterado
- Tela `/admin/produtos/importacao-ia`: etapa de revisão agora é editável.
  Cada linha tem botão "Editar" abrindo modal com seções (Dados básicos,
  Comercial, Conteúdo/IA, SEO, Revisão). Checkboxes inline para
  `revisado_humano` e `aprovado_importar` na grade.
- Após salvar uma linha, o sistema revalida automaticamente e invalida a
  simulação anterior, forçando nova simulação antes de importar.

### Segurança
- Sem alterações em checkout, Mercado Pago, webhook, estoque, pedidos,
  e-mails, CRM, GA4, DNS, MFA/AAL2, RLS ou policies.
- Rota continua restrita a admin com MFA/AAL2 (mesma proteção da v1.0.0).
- Validação server-side em `validateImportRows` e `commitImport` permanece
  inalterada — frontend apenas alimenta os mesmos endpoints já homologados.
- IA continua somente sugestão; importação exige aprovação humana explícita.

### Notas de rollback
- Versão anterior estável: 1.0.0
- Backup pré-deploy: não obrigatório (mudança apenas no frontend admin,
  sem schema/dados); ver `BACKUP_LOG.md` para snapshot diário.

---

## [1.0.0 — Produção Assistida] — 2026-05-30

### Marco
- Início oficial da **Produção Assistida v1.0.0** (30/mai/2026 → 30/ago/2026).
- Governança detalhada em `PRODUCAO_ASSISTIDA_3_MESES.md`.
- Monitoramento diário nos primeiros 15 dias; semanal a partir da semana 03.
- Templates semanais e arquivos de incidentes/melhorias criados.
- ChangeControl: CC-2026-002.

---

## [1.0.0] — 2026-05-30

### Marco
- Entrada oficial em produção da plataforma Led Maricá.
- Baseline congelado em `PRODUCTION_BASELINE_v1.0.0.md`.

### Incluído
- Loja pública B2C (catálogo, busca, kits/combos, checkout Mercado Pago).
- Loja B2B (preço atacado server-side, aprovação automática/manual).
- Painel admin com MFA AAL2 obrigatório (único admin: saulocmoreira@gmail.com).
- CRM/leads, automações WhatsApp, e-mails transacionais via Resend.
- Auditoria admin (triggers + helper semântico).
- LGPD: banner de cookies + carregamento condicional de pixels.
- Integração GA4 `G-7B7PLYJLNP`.
- Webhook Mercado Pago validado em produção (pedido #14, 06/mai/2026).

---

## Convenção de versões

- **MAJOR (x.0.0)** — mudança estrutural ou que quebra contrato.
- **MINOR (1.x.0)** — melhoria funcional sem quebra.
- **PATCH (1.0.x)** — hotfix, correção, ajuste visual.

## Tipos de alteração

`hotfix` · `melhoria` · `segurança` · `visual` · `operacional` ·
`integração` · `performance`

## Template para novas entradas

```md
## [x.y.z] — AAAA-MM-DD
**Tipo:** hotfix | melhoria | segurança | visual | operacional | integração | performance
**Responsável:** <nome>
**ChangeControl:** CC-AAAA-NNN
**Release:** ver RELEASES.md#xyz

### Adicionado
- ...

### Alterado
- ...

### Corrigido
- ...

### Removido
- ...

### Segurança
- ...

### Notas de rollback
- Versão anterior estável: x.y.z
- Backup pré-deploy: BACKUP_LOG#AAAA-MM-DD
```
