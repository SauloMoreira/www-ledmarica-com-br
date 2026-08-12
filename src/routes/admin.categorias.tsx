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
  sort: fallback(z.string(), "sort_order.asc").default("sort_order.asc"),
  status: fallback(z.enum(["all", "active", "inactive"]), "all").default("all"),
});

export const Route = createFileRoute("/admin/categorias")({
  validateSearch: zodValidator(searchSchema),
  component: CategoriasPage,
});

interface Cat {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number | null;
  active: boolean | null;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function CategoriasPage() {
  const [cats, setCats] = useState<Cat[] | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    sort_order: "0",
    active: true,
  });

  const sp = Route.useSearch();
  const { page, pageSize, q, sort, setPage, setPageSize, setQ, setSort, setFilter, clearAll } =
    useTableState({ page: 1, pageSize: 25, sort: { column: "sort_order", direction: "asc" } });

  const load = async () => {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order")
      .order("name");
    setCats((data as any) ?? []);
  };
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    let arr = cats ?? [];
    if (q) {
      const n = q.toLowerCase();
      arr = arr.filter(
        (c) => c.name.toLowerCase().includes(n) || c.slug.toLowerCase().includes(n),
      );
    }
    if (sp.status === "active") arr = arr.filter((c) => c.active);
    else if (sp.status === "inactive") arr = arr.filter((c) => !c.active);

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
  }, [cats, q, sp.status, sort]);

  const total = filtered.length;
  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const openNew = () => {
    setEditing(null);
    setForm({ name: "", slug: "", description: "", sort_order: "0", active: true });
    setOpen(true);
  };
  const openEdit = (c: Cat) => {
    setEditing(c);
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      sort_order: String(c.sort_order ?? 0),
      active: !!c.active,
    });
    setOpen(true);
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim(),
      slug: slugify(form.slug.trim() || form.name),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order),
      active: form.active,
    };
    const res = editing
      ? await supabase.from("categories").update(payload).eq("id", editing.id)
      : await supabase.from("categories").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success("Salvo");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Excluída");
    load();
  };

  const hasActiveFilters = !!q || sp.status !== "all";

  const columns: DataTableColumn<Cat>[] = [
    {
      id: "name",
      header: "Nome",
      sortable: true,
      cell: (c) => <span className="font-medium">{c.name}</span>,
    },
    {
      id: "slug",
      header: "Slug",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => <span className="font-mono text-xs text-muted-foreground">{c.slug}</span>,
    },
    {
      id: "sort_order",
      header: "Ordem",
      sortable: true,
      hideOnMobile: true,
      cell: (c) => c.sort_order ?? 0,
    },
    {
      id: "active",
      header: "Status",
      sortable: true,
      cell: (c) => (
        <span className={`text-xs ${c.active ? "text-emerald-600" : "text-muted-foreground"}`}>
          {c.active ? "Ativa" : "Inativa"}
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
      title="Categorias"
      action={
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 mr-1" /> Nova categoria
        </Button>
      }
    >
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <DataTableToolbar
          q={q}
          onQChange={setQ}
          searchPlaceholder="Buscar por nome ou slug…"
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAll}
          filters={
            <Select value={sp.status} onValueChange={(v) => setFilter("status", v)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                <SelectItem value="active">Ativas</SelectItem>
                <SelectItem value="inactive">Inativas</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <DataTable
          columns={columns}
          rows={paged}
          loading={cats === null}
          sort={sort}
          onSort={(c) => setSort(c)}
          rowKey={(c) => c.id}
          emptyTitle="Nenhuma categoria"
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
            <DialogTitle>{editing ? "Editar categoria" : "Nova categoria"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input
                required
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: e.target.value,
                    slug: form.slug || slugify(e.target.value),
                  })
                }
              />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div>
              <Label>Ordem</Label>
              <Input
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Ativa</Label>
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
