import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import {
  ORDER_STATUS_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  orderStatusLabel,
} from "@/lib/orderStatus";
import {
  DataTable,
  DataTablePagination,
  DataTableToolbar,
  type DataTableColumn,
} from "@/components/admin/datatable";
import { useTableState } from "@/hooks/useTableState";
import { formatDateBR } from "@/lib/dateBR";

const SORTABLE_COLUMNS = ["created_at", "total", "status"] as const;

const searchSchema = z.object({
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(1).max(100), 25).default(25),
  q: fallback(z.string(), "").default(""),
  sort: fallback(z.string(), "created_at.desc").default("created_at.desc"),
  status: fallback(z.string(), "").default(""),
  payment: fallback(z.string(), "").default(""),
  delivery: fallback(z.string(), "").default(""),
  from: fallback(z.string(), "").default(""),
  to: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/admin/pedidos/")({
  validateSearch: zodValidator(searchSchema),
  component: PedidosAdmin,
});

type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  payment_status: string;
  total: number;
  created_at: string;
  address_snapshot: { recipient?: string } | null;
  delivery_method: string | null;
};

function PedidosAdmin() {
  const search = Route.useSearch();
  const t = useTableState({
    page: 1,
    pageSize: 25,
    sort: { column: "created_at", direction: "desc" },
  });

  const [rows, setRows] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const status = search.status;
  const payment = search.payment;
  const delivery = search.delivery;
  const from = search.from;
  const to = search.to;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const sortCol = (SORTABLE_COLUMNS as readonly string[]).includes(t.sort.column)
      ? t.sort.column
      : "created_at";

    const offset = (t.page - 1) * t.pageSize;

    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, payment_status, total, created_at, address_snapshot, delivery_method",
        { count: "exact" },
      )
      .order(sortCol, { ascending: t.sort.direction === "asc" })
      .range(offset, offset + t.pageSize - 1);

    if (status) query = query.eq("status", status);
    if (payment) query = query.eq("payment_status", payment);
    if (delivery) query = query.eq("delivery_method", delivery);
    if (from) query = query.gte("created_at", from);
    if (to) {
      // include the whole "to" day
      const end = new Date(`${to}T23:59:59.999`);
      query = query.lte("created_at", end.toISOString());
    }

    if (t.q.trim()) {
      const term = t.q.trim();
      const numeric = Number(term.replace(/[^0-9]/g, ""));
      const orParts: string[] = [
        `address_snapshot->>recipient.ilike.%${term}%`,
        `address_snapshot->>email.ilike.%${term}%`,
      ];
      if (!Number.isNaN(numeric) && numeric > 0) {
        orParts.push(`order_number.eq.${numeric}`);
      }
      query = query.or(orParts.join(","));
    }

    query.then(({ data, count, error }) => {
      if (cancelled) return;
      if (error) {
        console.error(error);
        setRows([]);
        setTotal(0);
      } else {
        setRows((data as OrderRow[]) ?? []);
        setTotal(count ?? 0);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    t.page,
    t.pageSize,
    t.q,
    t.sort.column,
    t.sort.direction,
    status,
    payment,
    delivery,
    from,
    to,
  ]);

  const fmt = (n: number) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const hasActive = !!(status || payment || delivery || from || to || t.q);

  const columns: DataTableColumn<OrderRow>[] = [
    {
      id: "order_number",
      header: "Nº",
      cell: (o) => <span className="font-mono text-xs">#{o.order_number}</span>,
    },
    {
      id: "created_at",
      header: "Data",
      sortable: true,
      hideOnMobile: true,
      cell: (o) => (
        <span className="text-xs">
          {formatDateBR(o.created_at)}
        </span>
      ),
    },
    {
      id: "recipient",
      header: "Cliente",
      cell: (o) => (
        <div className="flex items-center gap-2">
          <span>{o.address_snapshot?.recipient ?? "—"}</span>
          {o.delivery_method === "pickup" && (
            <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] uppercase font-bold tracking-wide">
              Retirada
            </span>
          )}
          {o.delivery_method === "local_delivery" && (
            <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] uppercase font-bold tracking-wide">
              Frete Local
            </span>
          )}
        </div>
      ),
    },
    {
      id: "total",
      header: "Total",
      sortable: true,
      cell: (o) => <span className="font-medium">{fmt(Number(o.total))}</span>,
    },
    {
      id: "payment_status",
      header: "Pgto",
      hideOnMobile: true,
      cell: (o) => <StatusBadge value={o.payment_status} />,
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (o) => <StatusBadge value={o.status} />,
    },
    {
      id: "actions",
      header: "",
      headerClassName: "w-[1%]",
      cell: (o) => (
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/pedidos/$orderId" params={{ orderId: o.id }}>
            <Eye className="w-4 h-4 mr-1" /> Detalhes
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <AdminLayout title="Pedidos">
      <div className="bg-card border border-border rounded-xl">
        <DataTableToolbar
          q={t.q}
          onQChange={t.setQ}
          searchPlaceholder="Buscar por nº, cliente ou e-mail…"
          hasActiveFilters={hasActive}
          onClearFilters={t.clearAll}
          filters={
            <>
              <Select
                value={status || "all"}
                onValueChange={(v) => t.setFilter("status", v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 w-[180px]">
                  <SelectValue placeholder="Status do pedido" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os status</SelectItem>
                  {ORDER_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {orderStatusLabel(s)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={payment || "all"}
                onValueChange={(v) => t.setFilter("payment", v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 w-[170px]">
                  <SelectValue placeholder="Pagamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos pagamentos</SelectItem>
                  {PAYMENT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {orderStatusLabel(s)}
                    </SelectItem>
                  ))}
                  <SelectItem value="approved">Aprovado (MP)</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={delivery || "all"}
                onValueChange={(v) => t.setFilter("delivery", v === "all" ? "" : v)}
              >
                <SelectTrigger className="h-9 w-[160px]">
                  <SelectValue placeholder="Entrega" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas entregas</SelectItem>
                  <SelectItem value="shipping">Correios/Envio</SelectItem>
                  <SelectItem value="local_delivery">Frete Local</SelectItem>
                  <SelectItem value="pickup">Retirada</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => t.setFilter("from", e.target.value)}
                  className="h-9 w-[140px]"
                  aria-label="De"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => t.setFilter("to", e.target.value)}
                  className="h-9 w-[140px]"
                  aria-label="Até"
                />
              </div>
            </>
          }
        />

        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          sort={t.sort}
          onSort={t.setSort}
          rowKey={(o) => o.id}
          emptyTitle="Nenhum pedido encontrado"
          emptyDescription={
            hasActive
              ? "Tente ajustar os filtros ou limpar a busca."
              : "Quando houver pedidos, eles aparecem aqui."
          }
        />

        <DataTablePagination
          page={t.page}
          pageSize={t.pageSize}
          total={total}
          onPageChange={t.setPage}
          onPageSizeChange={t.setPageSize}
        />
      </div>
    </AdminLayout>
  );
}

function StatusBadge({ value }: { value: string }) {
  const colors: Record<string, string> = {
    pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    confirmed: "bg-blue-500/10 text-blue-700 dark:text-blue-400",
    preparing: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    shipped: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
    delivered: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    paid: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    approved: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    cancelled: "bg-red-500/10 text-red-700 dark:text-red-400",
    failed: "bg-red-500/10 text-red-700 dark:text-red-400",
    refunded: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
        colors[value] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {orderStatusLabel(value)}
    </span>
  );
}
