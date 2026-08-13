import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const searchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  pageSize: fallback(z.number(), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "code.asc").default("code.asc"),
  status: fallback(z.enum(["all", "active", "inactive"]), "all").default("all"),
  type: fallback(z.enum(["all", "percent", "fixed"]), "all").default("all"),
});

export const Route = createFileRoute("/admin/cupons")({
  validateSearch: zodValidator(searchSchema),
  component: CuponsPage,
});

interface Coupon {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  min_order_value: number | null;
  max_uses: number | null;
  used_count: number | null;
  expires_at: string | null;
  active: boolean | null;
  auto_apply?: boolean | null;
  condition_type?: string | null;
  condition_value?: string | null;
}

/**
 * Condições disponíveis para aplicação automática.
 * Estruturado como lista para crescer com novas condições
 * (ex.: primeira compra, categoria, faixa de valor) sem mexer na UI.
 */
const AUTO_CONDITIONS = [
  {
    key: "payment_method:pix",
    label: "Forma de pagamento: Pix",
    conditionType: "payment_method",
    conditionValue: "pix",
  },
] as const;

function conditionKey(type?: string | null, value?: string | null) {
  return type && value ? `${type}:${value}` : "";
}

function conditionLabel(type?: string | null, value?: string | null) {
  const k = conditionKey(type, value);
  return AUTO_CONDITIONS.find((c) => c.key === k)?.label ?? k;
}

function CuponsPage() {
  const [list, setList] = useState<Coupon[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState({
    code: "",
    description: "",
    discount_type: "percent",
    discount_value: "10",
    min_order_value: "0",
    max_uses: "",
    expires_at: "",
    active: true,
    auto_apply: false,
    condition_key: AUTO_CONDITIONS[0].key as string,
  });


  const sp = Route.useSearch();
  const { page, pageSize, q, sort, setPage, setPageSize, setQ, setSort, setFilter, clearAll } =
    useTableState({ page: 1, pageSize: 25, sort: { column: "code", direction: "asc" } });

  const load = async () => {
    const { data } = await supabase
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });
    setList((data as any) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let arr = list ?? [];
    if (q) {
      const n = q.toLowerCase();
      arr = arr.filter(
        (c) =>
          c.code.toLowerCase().includes(n) || (c.description ?? "").toLowerCase().includes(n),
      );
    }
    if (sp.status === "active") arr = arr.filter((c) => c.active);
    else if (sp.status === "inactive") arr = arr.filter((c) => !c.active);
    if (sp.type !== "all") arr = arr.filter((c) => c.discount_type === sp.type);

    return [...arr].sort((a, b) => {
      const dir = sort.direction === "asc" ? 1 : -1;
      const av = (a as any)[sort.column];
      const bv = (b as any)[sort.column];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number") return (av - bv) * dir;
      if (typeof av === "boolean") return (Number(av) - Number(bv)) * dir;
      return String(av).localeCompare(String(bv), "pt-BR") * dir;
    });
  }, [list, q, sp.status, sp.type, sort]);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const openNew = () => {
    setEditing(null);
    setForm({
      code: "",
      description: "",
      discount_type: "percent",
      discount_value: "10",
      min_order_value: "0",
      max_uses: "",
      expires_at: "",
      active: true,
      auto_apply: false,
      condition_key: AUTO_CONDITIONS[0].key,
    });
    setOpen(true);
  };
  const openEdit = (c: Coupon) => {
    setEditing(c);
    setForm({
      code: c.code,
      description: c.description ?? "",
      discount_type: c.discount_type,
      discount_value: String(c.discount_value),
      min_order_value: String(c.min_order_value ?? 0),
      max_uses: c.max_uses ? String(c.max_uses) : "",
      expires_at: c.expires_at ? c.expires_at.slice(0, 16) : "",
      active: !!c.active,
      auto_apply: !!c.auto_apply,
      condition_key: conditionKey(c.condition_type, c.condition_value) || AUTO_CONDITIONS[0].key,
    });
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const condition = AUTO_CONDITIONS.find((c) => c.key === form.condition_key);
    if (form.auto_apply && !condition) {
      return toast.error("Selecione uma condição para a aplicação automática.");
    }

    // Regra: só pode existir 1 cupom automático ativo por condição.
    if (form.auto_apply && form.active && condition) {
      const conflict = (list ?? []).find(
        (c) =>
          c.id !== editing?.id &&
          c.active &&
          c.auto_apply &&
          conditionKey(c.condition_type, c.condition_value) === condition.key,
      );
      if (conflict) {
        return toast.error(
          `Já existe um cupom automático ativo para esta condição: ${conflict.code} (${condition.label})`,
        );
      }
    }

    const payload = {
      code: form.code.trim().toUpperCase(),
      description: form.description || null,
      discount_type: form.discount_type,
      discount_value: Number(form.discount_value),
      min_order_value: Number(form.min_order_value) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      active: form.active,
      auto_apply: form.auto_apply,
      condition_type: form.auto_apply ? (condition?.conditionType ?? null) : null,
      condition_value: form.auto_apply ? (condition?.conditionValue ?? null) : null,
    };
    const res = editing
      ? await supabase.from("coupons").update(payload).eq("id", editing.id)
      : await supabase.from("coupons").insert(payload);
    if (res.error) {
      const msg = res.error.message.includes("coupons_unique_active_auto_condition")
        ? "Já existe um cupom automático ativo para esta condição."
        : res.error.message;
      return toast.error(msg);
    }
    toast.success("Salvo");
    setOpen(false);
    load();
  };


  const del = async (id: string) => {
    if (!confirm("Excluir cupom?")) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const hasActiveFilters = !!q || sp.status !== "all" || sp.type !== "all";

  const columns: DataTableColumn<Coupon>[] = [
    {
      id: "code",
      header: "Código",
      sortable: true,
      cell: (c) => <span className="font-mono font-semibold">{c.code}</span>,
    },
    {
      id: "discount_value",
      header: "Desconto",
      sortable: true,
      cell: (c) =>
        c.discount_type === "percent"
          ? `${c.discount_value}%`
          : `R$ ${Number(c.discount_value).toFixed(2)}`,
    },
    {
      id: "min_order_value",
      header: "Mínimo",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => `R$ ${Number(c.min_order_value ?? 0).toFixed(2)}`,
    },
    {
      id: "used_count",
      header: "Usos",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-xs">
          {c.used_count ?? 0}
          {c.max_uses ? ` / ${c.max_uses}` : ""}
        </span>
      ),
    },
    {
      id: "expires_at",
      header: "Expira",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-xs">
          {c.expires_at ? new Date(c.expires_at).toLocaleDateString("pt-BR") : "—"}
        </span>
      ),
    },
    {
      id: "active",
      header: "Status",
      sortable: true,
      cell: (c) => (
        <span className={`text-xs ${c.active ? "text-emerald-600" : "text-muted-foreground"}`}>
          {c.active ? "Ativo" : "Inativo"}
        </span>
      ),
    },
    {
      id: "actions",
      header: <span className="sr-only">Ações</span>,
      headerClassName: "text-right",
      className: "text-right whitespace-nowrap",
      cell: (c) => (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            onClick={() => del(c.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </>
      ),
    },
  ];

  return (
    <AdminLayout
      title="Cupons"
      action={
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Novo cupom
        </Button>
      }
    >
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <DataTableToolbar
          q={q}
          onQChange={setQ}
          searchPlaceholder="Buscar por código ou descrição…"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          filters={
            <>
              <Select value={sp.status} onValueChange={(v) => setFilter("status", v)}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="active">Ativos</SelectItem>
                  <SelectItem value="inactive">Inativos</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sp.type} onValueChange={(v) => setFilter("type", v)}>
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos tipos</SelectItem>
                  <SelectItem value="percent">Percentual (%)</SelectItem>
                  <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />
        <DataTable
          columns={columns}
          rows={paged}
          loading={list === null}
          sort={sort}
          onSort={(c) => setSort(c)}
          rowKey={(c) => c.id}
          emptyTitle="Nenhum cupom"
          emptyDescription="Ajuste os filtros ou crie um novo cupom."
        />
        <DataTablePagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cupom" : "Novo cupom"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Código</Label>
              <Input
                required
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <select
                  value={form.discount_type}
                  onChange={(e) => setForm({ ...form, discount_type: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="percent">Percentual (%)</option>
                  <option value="fixed">Valor fixo (R$)</option>
                </select>
              </div>
              <div>
                <Label>Valor</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={form.discount_value}
                  onChange={(e) => setForm({ ...form, discount_value: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Pedido mínimo (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.min_order_value}
                  onChange={(e) => setForm({ ...form, min_order_value: e.target.value })}
                />
              </div>
              <div>
                <Label>Máx. de usos</Label>
                <Input
                  type="number"
                  value={form.max_uses}
                  onChange={(e) => setForm({ ...form, max_uses: e.target.value })}
                  placeholder="Ilimitado"
                />
              </div>
            </div>
            <div>
              <Label>Expira em</Label>
              <Input
                type="datetime-local"
                value={form.expires_at}
                onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativo</Label>
              <Switch
                checked={form.active}
                onCheckedChange={(v) => setForm({ ...form, active: v })}
              />
            </div>
            <DialogFooter>
              <Button type="submit">Salvar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
