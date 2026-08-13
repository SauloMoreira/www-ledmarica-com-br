# BACKUP LOG — Led Maricá

Registro de backups manuais e testes de restauração.
O backup diário automático do Lovable Cloud não precisa ser registrado
linha a linha (é contínuo); registrar apenas verificações periódicas.

---

## Verificações do backup automático (mensal)

| Data       | Retenção configurada | Último backup visto | Responsável | OK? | Observações |
|------------|----------------------|---------------------|-------------|-----|-------------|
| 30/05/2026 | a verificar          | a verificar         | Saulo       |  ?  | Verificação inicial pendente — abrir Project Settings → Database → Backups |

## Backups manuais pré-deploy

| Data/Hora | Versão alvo | Escopo                     | Local seguro                | Retenção | Responsável | ChangeControl | Observações |
|-----------|-------------|----------------------------|-----------------------------|----------|-------------|---------------|-------------|
| —         | v1.0.0      | Baseline (snapshot diário) | Lovable Cloud (nativo)      | 7 dias   | Saulo       | CC-2026-001   | Marco inicial |
| 13/08/2026 14:55 UTC | v1.0.6 | configuração de build; banco inalterado | histórico versionado (commit 44756dc3) | indefinida | Saulo | CC-2026-010 | Rollback integral por versão anterior; nenhuma alteração de dados ou secrets privilegiados. |

## Testes de restauração

| Data       | Origem do backup | Destino do teste | Resultado | Tempo  | Responsável | Observações |
|------------|------------------|------------------|-----------|--------|-------------|-------------|
| —          | —                | —                | —         | —      | —           | Primeiro teste planejado até 30/ago/2026 |

---

## Template (copiar/colar para novas entradas)

```
| dd/mm/aaaa hh:mm | vX.Y.Z | banco + storage | <local> | 30 dias | <nome> | CC-AAAA-NNN | <obs> |
```
