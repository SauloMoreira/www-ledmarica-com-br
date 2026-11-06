import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Users,
  ShieldCheck,
  Building2,
  Clock,
  ShieldX,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { buildSeo } from "@/lib/seo";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  adminListUsers,
  adminUsersSummary,
  adminGetUserDetail,
  adminBlockUser,
  adminUnblockUser,
  adminArchiveUser,
  adminRestoreUser,
  adminSendPasswordReset,
  adminPromoteToAdmin,
  adminDemoteToUser,
  adminAnonymizeUser,
  adminDeleteUser,
  type AdminUserRow,
  type AdminUserType,
} from "@/server/users.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableToolbar,
  DataTablePagination,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { formatDateBR, formatDateTimeBR } from "@/lib/dateBR";

type FilterValue =
  | "all"
  | "admins"
  | "b2c"
  | "b2b_approved"
  | "b2b_pending"
  | "blocked"
  | "active"
  | "with_orders"
  | "without_orders";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "admins", label: "Administradores" },
  { value: "b2c", label: "Clientes B2C" },
  { value: "b2b_approved", label: "B2B aprovados" },
  { value: "b2b_pending", label: "B2B pendentes" },
  { value: "active", label: "Ativos" },
  { value: "blocked", label: "Bloqueados / arquivados" },
  { value: "with_orders", label: "Com pedido" },
  { value: "without_orders", label: "Sem pedido" },
];

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "created_at.desc").default("created_at.desc"),
  filter: fallback(
    z.enum([
      "all",
      "admins",
      "b2c",
      "b2b_approved",
      "b2b_pending",
      "blocked",
      "active",
      "with_orders",
      "without_orders",
    ]),
    "all",
  ).default("all"),
});

export const Route = createFileRoute("/admin/usuarios")({
  validateSearch: zodValidator(searchSchema),
  head: () =>
    buildSeo({
      title: "Usuários e Clientes",
      url: "/admin/usuarios",
      noindex: true,
    }),
  component: AdminUsuariosPage,
});

function AdminUsuariosPage() {
  const ts = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "created_at", direction: "desc" },
  });
  const filter = ((ts.search.filter as string) ?? "all") as FilterValue;

  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total: number;
    admins: number;
    blocked: number;
    b2b_pending: number;
    b2b_approved: number;
    b2c_approx: number;
  } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await adminListUsers({
        data: { search: ts.q, filter, limit: 500 },
      });
      setItems(list.users);
      if (!summary) {
        const s = await adminUsersSummary();
        setSummary(s);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erro ao carregar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, ts.q]);

  const sorted = useMemo(() => {
    const dir = ts.sort.direction === "asc" ? 1 : -1;
    const col = ts.sort.column;
    return [...items].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[col];
      const bv = (b as unknown as Record<string, unknown>)[col];
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [items, ts.sort]);

  const total = sorted.length;
  const paged = useMemo(() => {
    const start = (ts.page - 1) * ts.pageSize;
    return sorted.slice(start, start + ts.pageSize);
  }, [sorted, ts.page, ts.pageSize]);

  const hasFilters = ts.q !== "" || filter !== "all";

  const columns: DataTableColumn<AdminUserRow>[] = [
    {
      id: "name",
      header: "Usuário",
      sortable: true,
      cell: (u) => (
        <div>
          <div className="font-medium text-foreground">{u.name || "(sem nome)"}</div>
          <div className="text-xs text-muted-foreground">{u.email}</div>
        </div>
      ),
    },
    {
      id: "derived_type",
      header: "Tipo",
      sortable: true,
      hideOnMobile: true,
      cell: (u) => <UserTypeBadge type={u.derived_type} />,
    },
    {
      id: "company_name",
      header: "Empresa",
      sortable: true,
      hideOnMobile: true,
      cell: (u) =>
        u.company_name ? (
          <div className="text-xs">
            <div className="text-foreground/90">{u.company_name}</div>
            <div className="text-muted-foreground">{u.company_status}</div>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "orders_count",
      header: "Pedidos",
      sortable: true,
      hideOnMobile: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (u) => <span className="text-foreground/80">{u.orders_count}</span>,
    },
    {
      id: "created_at",
      header: "Cadastro",
      sortable: true,
      hideOnMobile: true,
      cell: (u) => (
        <span className="text-xs text-muted-foreground">
          {u.created_at ? formatDateBR(u.created_at) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      className: "text-right",
      headerClassName: "text-right",
      cell: (u) => <StatusBadge status={u.status} />,
    },
  ];

  return (
    <AdminLayout title="Usuários e Clientes">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link
            to={"/admin" as never}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar ao painel
          </Link>
        </div>
        <div className="flex items-center gap-3 mb-2">
          <Users className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-display font-bold text-foreground">
            Usuários e Clientes
          </h2>
        </div>
        <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
          Gerencie clientes cadastrados, empresas B2B e permissões
          administrativas. Esta primeira fase é de leitura — ações de bloqueio,
          alteração de função e reset de senha serão habilitadas nas próximas
          etapas (v1.1.0-b e v1.1.0-c) com auditoria completa.
        </p>

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
            <SummaryCard label="Total" value={summary.total} />
            <SummaryCard label="Admins" value={summary.admins} />
            <SummaryCard label="Clientes B2C" value={summary.b2c_approx} />
            <SummaryCard label="B2B aprovados" value={summary.b2b_approved} />
            <SummaryCard label="B2B pendentes" value={summary.b2b_pending} />
            <SummaryCard label="Bloqueados" value={summary.blocked} />
          </div>
        )}

        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <DataTableToolbar
            q={ts.q}
            onQChange={ts.setQ}
            searchPlaceholder="Buscar por nome, e-mail, telefone ou empresa…"
            hasActiveFilters={hasFilters}
            onClearFilters={() => {
              ts.clearAll();
              ts.setFilter("filter", "all");
            }}
            filters={
              <Select
                value={filter}
                onValueChange={(v) => ts.setFilter("filter", v)}
              >
                <SelectTrigger className="h-9 w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FILTERS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <DataTable<AdminUserRow>
            columns={columns}
            rows={paged}
            loading={loading}
            sort={ts.sort}
            onSort={ts.setSort}
            rowKey={(u) => u.id}
            onRowClick={(u) => setSelectedId(u.id)}
            emptyTitle="Nenhum usuário"
            emptyDescription="Nenhum usuário encontrado com os filtros atuais."
          />

          <DataTablePagination
            page={ts.page}
            pageSize={ts.pageSize}
            total={total}
            onPageChange={ts.setPage}
            onPageSizeChange={ts.setPageSize}
          />
        </div>

        {selectedId && (
          <UserDrawer
            userId={selectedId}
            onClose={() => setSelectedId(null)}
            onChanged={() => {
              setSummary(null);
              load();
            }}
          />
        )}
      </div>
    </AdminLayout>
  );
}

// ---------- Componentes auxiliares ----------

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-lg p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
    </div>
  );
}

const TYPE_LABEL: Record<AdminUserType, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "bg-primary/15 text-primary" },
  cliente_b2b_aprovado: {
    label: "B2B aprovado",
    cls: "bg-success/15 text-success",
  },
  cliente_b2b_pendente: {
    label: "B2B pendente",
    cls: "bg-warning/15 text-warning",
  },
  cliente_b2b_bloqueado: {
    label: "B2B bloqueado",
    cls: "bg-destructive/15 text-destructive",
  },
  cliente_b2c: { label: "Cliente B2C", cls: "bg-muted text-muted-foreground" },
  cliente_bloqueado: {
    label: "Bloqueado",
    cls: "bg-destructive/15 text-destructive",
  },
  cliente_arquivado: {
    label: "Arquivado",
    cls: "bg-muted text-muted-foreground",
  },
};

function UserTypeBadge({ type }: { type: AdminUserType }) {
  const info = TYPE_LABEL[type];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${info.cls}`}
    >
      {info.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { Icon: typeof Clock; cls: string; label: string }> = {
    active: {
      Icon: CheckCircle2,
      cls: "bg-success/15 text-success",
      label: "Ativo",
    },
    blocked: {
      Icon: ShieldX,
      cls: "bg-destructive/15 text-destructive",
      label: "Bloqueado",
    },
    archived: {
      Icon: ShieldX,
      cls: "bg-muted text-muted-foreground",
      label: "Arquivado",
    },
  };
  const info = map[status] ?? map.active;
  const Icon = info.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold ${info.cls}`}
    >
      <Icon className="w-3 h-3" /> {info.label}
    </span>
  );
}

// ---------- Drawer de detalhe (leitura) ----------

type DetailData = Awaited<ReturnType<typeof adminGetUserDetail>>;

function UserDrawer({
  userId,
  onClose,
  onChanged,
}: {
  userId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = () => {
    setLoading(true);
    adminGetUserDetail({ data: { user_id: userId } })
      .then((d) => setData(d))
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : "Erro ao carregar";
        toast.error(msg);
        onClose();
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const runAction = async (
    label: string,
    fn: () => Promise<unknown>,
    successMsg: string,
  ) => {
    setBusy(label);
    try {
      await fn();
      toast.success(successMsg);
      reload();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na operação");
    } finally {
      setBusy(null);
    }
  };

  const handleBlock = () => {
    const reason = window.prompt(
      "Motivo do bloqueio (será gravado em auditoria):",
      "",
    );
    if (reason === null) return;
    runAction(
      "block",
      () =>
        adminBlockUser({ data: { user_id: userId, reason: reason || null } }),
      "Usuário bloqueado.",
    );
  };
  const handleUnblock = () => {
    if (!window.confirm("Desbloquear este usuário?")) return;
    runAction(
      "unblock",
      () => adminUnblockUser({ data: { user_id: userId, reason: null } }),
      "Usuário desbloqueado.",
    );
  };
  const handleArchive = () => {
    const reason = window.prompt(
      "Arquivar usuário. Motivo (gravado em auditoria):",
      "",
    );
    if (reason === null) return;
    runAction(
      "archive",
      () =>
        adminArchiveUser({ data: { user_id: userId, reason: reason || null } }),
      "Usuário arquivado.",
    );
  };
  const handleRestore = () => {
    if (!window.confirm("Restaurar este usuário arquivado?")) return;
    runAction(
      "restore",
      () => adminRestoreUser({ data: { user_id: userId, reason: null } }),
      "Usuário restaurado.",
    );
  };
  const handleReset = () => {
    if (
      !window.confirm(
        "Enviar e-mail de redefinição de senha para este usuário?",
      )
    )
      return;
    runAction(
      "reset",
      () => adminSendPasswordReset({ data: { user_id: userId } }),
      "E-mail de redefinição enviado.",
    );
  };

  // ----- v1.1.0-c: ações sensíveis (exigem MFA/AAL2) -----

  const ensureAal2 = async (): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (data?.currentLevel === "aal2") return true;
      toast.error(
        "Esta ação exige verificação em duas etapas (MFA). Faça logout e entre novamente confirmando o código.",
      );
      return false;
    } catch {
      toast.error("Não foi possível verificar o MFA. Tente novamente.");
      return false;
    }
  };

  const handlePromote = async () => {
    if (!(await ensureAal2())) return;
    const reason = window.prompt(
      "PROMOVER A ADMINISTRADOR.\nMotivo (gravado em auditoria, mín. 3 caracteres):",
      "",
    );
    if (!reason || reason.trim().length < 3) return;
    const c = window.prompt(
      "Digite CONFIRMAR para promover este usuário a ADMIN:",
      "",
    );
    if (c !== "CONFIRMAR") return;
    runAction(
      "promote",
      () =>
        adminPromoteToAdmin({
          data: { user_id: userId, reason: reason.trim(), confirm: "CONFIRMAR" },
        }),
      "Usuário promovido a administrador.",
    );
  };

  const handleDemote = async () => {
    if (!(await ensureAal2())) return;
    const reason = window.prompt(
      "REMOVER PRIVILÉGIOS DE ADMIN.\nMotivo (gravado em auditoria, mín. 3 caracteres):",
      "",
    );
    if (!reason || reason.trim().length < 3) return;
    const c = window.prompt(
      "Digite CONFIRMAR para remover privilégios de admin:",
      "",
    );
    if (c !== "CONFIRMAR") return;
    runAction(
      "demote",
      () =>
        adminDemoteToUser({
          data: { user_id: userId, reason: reason.trim(), confirm: "CONFIRMAR" },
        }),
      "Privilégios de admin removidos.",
    );
  };

  const handleAnonymize = async () => {
    if (!(await ensureAal2())) return;
    const reason = window.prompt(
      "ANONIMIZAÇÃO LGPD.\nIrá apagar nome/e-mail/telefone e bloquear o login.\nMantém pedidos e histórico para integridade fiscal.\nMotivo (mín. 3 caracteres):",
      "",
    );
    if (!reason || reason.trim().length < 3) return;
    const c = window.prompt(
      "Digite ANONIMIZAR para confirmar (irreversível):",
      "",
    );
    if (c !== "ANONIMIZAR") return;
    runAction(
      "anonymize",
      () =>
        adminAnonymizeUser({
          data: { user_id: userId, reason: reason.trim(), confirm: "ANONIMIZAR" },
        }),
      "Usuário anonimizado.",
    );
  };

  const handleDelete = async () => {
    if (!(await ensureAal2())) return;
    const reason = window.prompt(
      "EXCLUSÃO DEFINITIVA.\nSó funciona se o usuário NÃO tiver pedidos.\nMotivo (mín. 3 caracteres):",
      "",
    );
    if (!reason || reason.trim().length < 3) return;
    const c = window.prompt(
      "Digite EXCLUIR para confirmar a remoção definitiva:",
      "",
    );
    if (c !== "EXCLUIR") return;
    runAction(
      "delete",
      () =>
        adminDeleteUser({
          data: { user_id: userId, reason: reason.trim(), confirm: "EXCLUIR" },
        }),
      "Usuário excluído.",
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40" onClick={onClose} />
      <div className="w-full max-w-2xl bg-background border-l border-border h-full overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-foreground">
            {data?.profile?.name || "Detalhes do usuário"}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {loading || !data ? (
          <div className="text-sm text-muted-foreground">Carregando…</div>
        ) : (
          <div className="space-y-6">
            <section>
              <SectionTitle icon={<Users className="w-4 h-4" />} label="Dados" />
              <div className="space-y-2">
                <Info label="Nome" value={data.profile.name} />
                <Info label="E-mail" value={data.profile.email} />
                <Info label="Telefone" value={data.profile.phone ?? "—"} />
                <Info
                  label="Cadastro"
                  value={
                    data.profile.created_at
                      ? formatDateTimeBR(data.profile.created_at)
                      : "—"
                  }
                />
                <Info
                  label="Função"
                  value={
                    data.profile.role === "admin" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-[11px] font-semibold">
                        <ShieldCheck className="w-3 h-3" /> Administrador
                      </span>
                    ) : (
                      "Cliente"
                    )
                  }
                />
                <Info
                  label="Status"
                  value={<StatusBadge status={data.profile.status} />}
                />
              </div>
            </section>

            {data.companies.length > 0 && (
              <section>
                <SectionTitle
                  icon={<Building2 className="w-4 h-4" />}
                  label="Empresa(s) vinculada(s)"
                />
                <div className="space-y-3">
                  {data.companies.map((c) => (
                    <div
                      key={c.id}
                      className="border border-border rounded-lg p-3 text-sm"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="font-medium text-foreground">
                          {c.trade_name || c.legal_name}
                        </div>
                        <Link
                          to={"/admin/empresas" as never}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          Abrir <ExternalLink className="w-3 h-3" />
                        </Link>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        CNPJ {c.cnpj}
                      </div>
                      <div className="text-xs mt-1">Status: {c.status}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle label={`Pedidos (${data.orders.length})`} />
              {data.orders.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  Nenhum pedido encontrado.
                </div>
              ) : (
                <div className="space-y-1">
                  {data.orders.slice(0, 10).map((o) => (
                    <Link
                      key={o.id}
                      to={"/admin/pedidos/$orderId" as never}
                      params={{ orderId: o.id } as never}
                      className="flex items-center justify-between text-sm border-b border-border py-2 hover:bg-muted/40 px-2 -mx-2 rounded"
                    >
                      <span className="text-foreground">#{o.order_number}</span>
                      <span className="text-xs text-muted-foreground">
                        {o.created_at
                          ? formatDateBR(o.created_at)
                          : ""}
                      </span>
                      <span className="text-xs">{o.status}</span>
                      <span className="text-foreground font-medium">
                        R$ {Number(o.total ?? 0).toFixed(2)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {data.addresses.length > 0 && (
              <section>
                <SectionTitle label={`Endereços (${data.addresses.length})`} />
                <div className="space-y-2 text-sm">
                  {data.addresses.map((a) => (
                    <div
                      key={a.id}
                      className="border border-border rounded p-2 text-xs text-foreground/80"
                    >
                      <div className="font-medium">{a.label || "Endereço"}</div>
                      <div>
                        {a.street}, {a.number} {a.complement && `- ${a.complement}`}
                      </div>
                      <div>
                        {a.neighborhood} — {a.city}/{a.state} — CEP {a.zip_code}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {data.leads.length > 0 && (
              <section>
                <SectionTitle label={`Leads vinculados (${data.leads.length})`} />
                <div className="text-xs text-muted-foreground">
                  {data.leads.length} lead(s) com o mesmo e-mail.
                </div>
              </section>
            )}

            {data.audit_logs.length > 0 && (
              <section>
                <SectionTitle label="Auditoria recente" />
                <div className="space-y-1 text-xs">
                  {data.audit_logs.map((l) => (
                    <div key={l.id} className="border-b border-border py-1">
                      <div className="text-foreground/90">{l.action}</div>
                      <div className="text-muted-foreground">
                        {l.created_at
                          ? formatDateTimeBR(l.created_at)
                          : ""}{" "}
                        — {l.admin_email ?? "sistema"}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section>
              <SectionTitle label="Ações administrativas" />
              <div className="flex flex-wrap gap-2">
                {data.profile.status === "active" && (
                  <>
                    <ActionBtn
                      onClick={handleReset}
                      disabled={busy !== null}
                      busy={busy === "reset"}
                    >
                      Enviar redefinição de senha
                    </ActionBtn>
                    <ActionBtn
                      onClick={handleBlock}
                      disabled={busy !== null}
                      busy={busy === "block"}
                      variant="destructive"
                    >
                      Bloquear
                    </ActionBtn>
                    <ActionBtn
                      onClick={handleArchive}
                      disabled={busy !== null}
                      busy={busy === "archive"}
                      variant="muted"
                    >
                      Arquivar
                    </ActionBtn>
                  </>
                )}
                {data.profile.status === "blocked" && (
                  <ActionBtn
                    onClick={handleUnblock}
                    disabled={busy !== null}
                    busy={busy === "unblock"}
                  >
                    Desbloquear
                  </ActionBtn>
                )}
                {data.profile.status === "archived" && (
                  <ActionBtn
                    onClick={handleRestore}
                    disabled={busy !== null}
                    busy={busy === "restore"}
                  >
                    Restaurar
                  </ActionBtn>
                )}
              </div>

              {/* v1.1.0-c — Ações sensíveis (exigem MFA/AAL2) */}
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
                  Ações sensíveis · exigem MFA
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.profile.status === "active" && data.profile.role !== "admin" && (
                    <ActionBtn
                      onClick={handlePromote}
                      disabled={busy !== null}
                      busy={busy === "promote"}
                      variant="muted"
                    >
                      Promover a admin
                    </ActionBtn>
                  )}
                  {data.profile.status === "active" && data.profile.role === "admin" && (
                    <ActionBtn
                      onClick={handleDemote}
                      disabled={busy !== null}
                      busy={busy === "demote"}
                      variant="muted"
                    >
                      Remover admin
                    </ActionBtn>
                  )}
                  <ActionBtn
                    onClick={handleAnonymize}
                    disabled={busy !== null}
                    busy={busy === "anonymize"}
                    variant="destructive"
                  >
                    Anonimizar (LGPD)
                  </ActionBtn>
                  <ActionBtn
                    onClick={handleDelete}
                    disabled={busy !== null}
                    busy={busy === "delete"}
                    variant="destructive"
                  >
                    Excluir definitivamente
                  </ActionBtn>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Exclusão só é permitida se o usuário não tiver pedidos.
                  Caso contrário, use a anonimização LGPD para preservar
                  histórico fiscal.
                </p>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  label,
  icon,
}: {
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
      {icon}
      {label}
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b border-border pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-foreground text-right">{value}</span>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled,
  busy,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "destructive" | "muted";
}) {
  const cls =
    variant === "destructive"
      ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : variant === "muted"
        ? "bg-muted text-foreground hover:bg-muted/80"
        : "bg-primary text-primary-foreground hover:bg-primary/90";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}
    >
      {busy ? "Processando…" : children}
    </button>
  );
}
