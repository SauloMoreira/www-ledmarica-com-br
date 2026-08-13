# RELEASES — Led Maricá

Registro detalhado de cada release publicada em produção.
Resumo curto vai em `CHANGELOG.md`; o dossiê completo fica aqui.

---

## v1.0.6 — Hotfix de variáveis públicas no build publicado (13/ago/2026)

| Campo               | Valor                                              |
|---------------------|----------------------------------------------------|
| Versão              | 1.0.6                                              |
| Data                | 13/ago/2026                                        |
| Responsável         | Saulo Moreira (saulocmoreira@gmail.com)            |
| Tipo                | hotfix crítico de configuração                     |
| Status              | aprovado para publicação                           |
| ChangeControl       | CC-2026-010                                        |
| Backup pré-deploy   | histórico versionado da configuração; banco inalterado |
| Plano de rollback   | restaurar commit `44756dc3` e republicar           |

### Descrição
Corrige a indisponibilidade do frontend publicado causada pela ausência das variáveis públicas `VITE_SUPABASE_*` no build do navegador. Os bindings server-side foram confirmados pelo healthcheck publicado e permanecem gerenciados pela plataforma.

### Arquivos alterados
- `.env.production` — somente configuração pública necessária ao bundle do navegador.
- Documentação de governança da release.

### Testes planejados
- Build automatizado da publicação.
- Reload sem cache em `/`, `/catalogo` e `/api/public/health` no domínio próprio e no domínio Lovable.
- Verificação de ausência do erro `Missing Supabase environment variables` no console.

### Pós-deploy / monitoramento
Janela crítica de 72h; rollback imediato se home, catálogo, auth ou funções server-side apresentarem erro 5xx ou falha de inicialização.

---

## v1.0.5 — Importação de produtos com códigos como texto (23/jun/2026)

| Campo               | Valor                                              |
|---------------------|----------------------------------------------------|
| Versão              | 1.0.5                                              |
| Data                | 23/jun/2026                                        |
| Responsável         | Saulo Moreira (saulocmoreira@gmail.com)            |
| Tipo                | correção crítica (importador de produtos)          |
| Status              | publicado; aceite operacional pendente de revalidação Excel |
| ChangeControl       | CC-2026-009                                        |
| Backup pré-deploy   | snapshot diário automático                         |
| Plano de rollback   | reverter arquivos + `DROP FUNCTION import_product_with_attrs` |

### Resumo
Planejada internamente como "v1.0.4 — códigos como texto"; entregue como v1.0.5
porque a numeração v1.0.4 já estava ocupada por CC-2026-008 (exclusão segura de
produtos com pedidos).

Trata SKU, EAN/GTIN, código de barras, NCM, CEST, CFOP, código do fornecedor, modelo e
marca como TEXTO em todo o pipeline: planilha modelo (`numFmtId=49` no nível da coluna e
células vazias pré-formatadas como Texto das linhas 2–10000, com tabela Excel e cache-buster no download), parser
(detecta célula numérica + notação científica), revisão editável, simulação e commit
atômico via RPC `import_product_with_attrs` com `SECURITY DEFINER`, whitelist de campos,
admin+AAL2 checados internamente, audit completo (`parse|simulate|commit|blocked|export_revised`).
Sem impacto em checkout, MP, webhook, pedidos, estoque pós-venda, e-mails, CRM ou MFA geral.

Detalhes técnicos completos no `CHANGELOG.md` (seção 1.0.5) e `CHANGE_CONTROL.md` (CC-2026-009).

### Hotfix de modelo Excel — 23/jun/2026
Após evidência manual de que o Excel ainda convertia SKU longo em notação científica, o
modelo oficial foi regenerado com formato Texto aplicado também no estilo das colunas críticas,
não apenas em células materializadas. Aceite operacional segue pendente até validação manual
com `7891234567890123` preservado exatamente no Excel.

### Hotfix reforçado de modelo Excel — 23/jun/2026
Após nova evidência manual mostrando `7891234567890123` como `7,89123E+15`, o arquivo
baixável foi substituído por `Cadastro_Minimo_Produtos_Led_Marica_IA_v1.0.5_Texto_ExcelSeguro.xlsx`.
As colunas críticas usam agora o formato Texto nativo do Excel (`numFmtId=49`) com
`quotePrefix=1`, além das validações `ISTEXT` em modo bloqueante. Aceite operacional continua
condicionado ao teste manual no Excel oficial baixado pela tela administrativa.

### Hotfix corretivo do XLSX oficial — 23/jun/2026
Após reprovação manual adicional, o arquivo oficial
`public/templates/Cadastro_Minimo_Produtos_Led_Marica_IA.xlsx` foi regenerado com `xlsxwriter`.
As colunas `sku`, `ean_gtin`, `codigo_barras`, `ncm`, `cest`, `cfop_default`,
`codigo_fornecedor`, `modelo` e `marca` receberam formato real de Texto (`numFmtId=49`) no
nível da coluna e células vazias pré-formatadas como Texto das linhas 2 até 10000. O botão
oficial voltou a apontar para o arquivo oficial único com cache-buster, removendo dependência
dos nomes antigos `v1.0.5_Texto` e `ExcelSeguro`. A v1.0.5 permanece pendente de aceite manual
enquanto o modelo baixável não for validado no Microsoft Excel com SKU numérico longo
preservado como Texto.

---



## v1.0.0 — Produção Assistida (3 meses)

| Campo               | Valor                                              |
|---------------------|----------------------------------------------------|
| Versão              | 1.0.0 (marco operacional)                          |
| Data                | 30/mai/2026                                        |
| Término previsto    | 30/ago/2026                                        |
| Responsável         | Saulo Moreira (saulocmoreira@gmail.com)            |
| Tipo                | operacional (governança)                           |
| Status              | em andamento                                       |
| ChangeControl       | CC-2026-002                                        |
| Backup pré-deploy   | snapshot diário Lovable Cloud (BACKUP_LOG)         |
| Plano de rollback   | não aplicável (marco operacional)                  |

### Descrição
Início oficial da janela de Produção Assistida de 3 meses. Define cadência
de monitoramento diário (dias 1–15) e semanal (semanas 3–12), regras de
correção em produção, classificação de incidentes, política de backup
reforçada e critérios de encerramento. Documento mestre:
`PRODUCAO_ASSISTIDA_3_MESES.md`.

### Arquivos criados
- `docs/production/PRODUCAO_ASSISTIDA_3_MESES.md`
- `docs/production/PRODUCAO_ASSISTIDA_SEMANA_01..04.md`
- `docs/production/INCIDENTES_PRODUCAO.md`
- `docs/production/MELHORIAS_PRODUCAO.md`

### Impacto esperado
- Operação interna passa a registrar incidentes/melhorias/relatórios
  semanais sistematicamente.
- Nenhum impacto funcional para o cliente final.

### Riscos
- Operacional: equipe precisa adotar a rotina de monitoramento.

### Testes realizados
- N/A (documentação e rotina).

---

## v1.0.0 — Baseline de produção

| Campo               | Valor                                              |
|---------------------|----------------------------------------------------|
| Versão              | 1.0.0                                              |
| Data                | 30/mai/2026                                        |
| Responsável         | Saulo Moreira (saulocmoreira@gmail.com)            |
| Tipo                | operacional (marco)                                |
| Status              | publicado                                          |
| ChangeControl       | CC-2026-001                                        |
| Backup pré-deploy   | snapshot Lovable Cloud do dia (ver BACKUP_LOG)     |
| Plano de rollback   | não aplicável (baseline)                           |

### Descrição
Congelamento do estado atual como referência oficial de produção da
plataforma Led Maricá. A partir desta versão, qualquer alteração entra
no fluxo de `CHANGE_CONTROL.md`.

### Arquivos alterados
- Nenhum (entrada de governança).

### Impacto esperado
- Nenhum impacto funcional para o cliente final.
- Operação interna passa a exigir versão + changelog + checklist.

### Riscos
- Nenhum risco técnico imediato.
- Risco operacional: equipe precisa adotar o fluxo a partir de hoje.

### Testes realizados
- Smoke test manual: home, catálogo, carrinho, login, painel admin.
- Webhook Mercado Pago validado (pedido #14, 06/mai/2026).

---

## Template para próximas releases

```md
## vX.Y.Z — <título curto>

| Campo               | Valor                                              |
|---------------------|----------------------------------------------------|
| Versão              | X.Y.Z                                              |
| Data                | dd/mmm/aaaa                                        |
| Responsável         |                                                    |
| Tipo                | hotfix / melhoria / segurança / visual / ...       |
| Status              | planejado / em teste / aprovado / publicado / revertido |
| ChangeControl       | CC-AAAA-NNN                                        |
| Backup pré-deploy   | BACKUP_LOG#AAAA-MM-DD                              |
| Plano de rollback   | ROLLBACK_PLAN.md#cenário-X                         |

### Descrição
...

### Arquivos alterados
- ...

### Impacto esperado
- ...

### Riscos
- Segurança: ...
- Regressão: ...

### Testes realizados
- ...

### Pós-deploy / monitoramento
- ...
```
