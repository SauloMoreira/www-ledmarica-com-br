import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import {
  Eye,
  Trash2,
  Phone,
  Mail,
  LayoutGrid,
  List,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  LEAD_STATUS_OPTIONS,
  LEAD_STATUS_LABELS,
  leadStatusLabel,
  leadOriginLabel,
} from "@/lib/constants/leadStatus";
import { cn } from "@/lib/utils";

const SORT_VALUES = ["created_desc", "created_asc", "name_asc", "status", "value_desc"] as const;

const searchSchema = z.object({
  view: fallback(z.enum(["kanban", "list"]), "kanban").default("kanban"),
  sort: fallback(z.enum(SORT_VALUES), "created_desc").default("created_desc"),
  status: fallback(z.string(), "").default(""),
  origin: fallback(z.string(), "all").default("all"),
  interest: fallback(z.string(), "all").default("all"),
  q: fallback(z.string(), "").default(""),
  page: fallback(z.number().int().min(1), 1).default(1),
  pageSize: fallback(z.number().int().min(1).max(100), 20).default(20),
});

export const Route = createFileRoute("/admin/leads")({
  validateSearch: zodValidator(searchSchema),
  component: LeadsPage,
});

import {
  LEAD_STATUSES,
  LEAD_STATUS_STYLES,
  normalizeLeadStatus,
  type LeadStatus,
} from "@/lib/constants/leadStatus";

const STATUSES = LEAD_STATUSES;
type Status = LeadStatus;

const StatusBadge = ({ status }: { status?: string | null }) => {
  const s = normalizeLeadStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs px-2 py-0.5 rounded-md border font-medium",
        LEAD_STATUS_STYLES[s] ?? "bg-muted text-muted-foreground border-border",
      )}
    >
      {leadStatusLabel(s)}
    </span>
  );
};

function LeadsPage() {
  const sp = Route.useSearch();
  const navigate = useNavigate({ from: "/admin/leads" });

  // Pull URL-persisted state
  const filterStatus = sp.status;
  const search = sp.q;
  const filterOrigin = sp.origin;
  const filterInterest = sp.interest;
  const view = sp.view;
  const sortBy = sp.sort;
  const page = sp.page;
  const pageSize = sp.pageSize;

  // Setters write to URL (preserving other params)
  const updateSearch = (patch: Partial<typeof sp>) =>
    navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true });

  const setFilterStatus = (v: string) => updateSearch({ status: v, page: 1 });
  const setSearchQ = (v: string) => updateSearch({ q: v, page: 1 });
  const setFilterOrigin = (v: string) => updateSearch({ origin: v, page: 1 });
  const setFilterInterest = (v: string) => updateSearch({ interest: v, page: 1 });
  const setView = (v: "kanban" | "list") => updateSearch({ view: v });
  const setSortBy = (v: typeof sortBy) => updateSearch({ sort: v, page: 1 });
  const setPage = (v: number) => updateSearch({ page: v });
  const setPageSize = (v: number) => updateSearch({ pageSize: v, page: 1 });

  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(search);
  const isDebouncing = searchInput !== search;
  const isBusy = loading || isDebouncing;

  // Sync local input when URL changes externally (back/forward, clear filters)
  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  // Debounce: push input -> URL after 300ms of inactivity
  useEffect(() => {
    if (searchInput === search) return;
    const t = setTimeout(() => setSearchQ(searchInput), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const [kanbanLimits, setKanbanLimits] = useState<Record<string, number>>({});
  const KANBAN_PAGE = 20;
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [edit, setEdit] = useState<{ status: LeadStatus; notes: string; estimated_value: string }>({
    status: "novo",
    notes: "",
    estimated_value: "",
  });

  const load = async () => {
    setLoading(true);
    const rows = await fetchAllRows<any>((from, to) => {
      let q = supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);
      if (filterStatus && filterStatus !== "all") q = q.eq("status", filterStatus);
      return q;
    });
    setLeads(rows as any);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [filterStatus]);

  // Distinct origin/interest values from current dataset
  const originOptions = Array.from(new Set(leads.map((l) => l.origin).filter(Boolean))) as string[];
  const interestOptions = Array.from(
    new Set(leads.map((l) => l.interest).filter(Boolean)),
  ) as string[];

  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const STATUS_ORDER: Record<string, number> = Object.fromEntries(
    LEAD_STATUSES.map((s, i) => [s, i]),
  );

  const filteredLeads = leads
    .filter((l) => {
      if (filterOrigin !== "all" && (l.origin ?? "") !== filterOrigin) return false;
      if (filterInterest !== "all" && (l.interest ?? "") !== filterInterest) return false;
      if (search.trim()) {
        const q = norm(search.trim());
        const hay = norm(`${l.name ?? ""} ${l.company ?? ""}`);
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return norm(a.name ?? "").localeCompare(norm(b.name ?? ""));
        case "status":
          return (STATUS_ORDER[a.status ?? "new"] ?? 99) - (STATUS_ORDER[b.status ?? "new"] ?? 99);
        case "value_desc":
          return (Number(b.estimated_value) || 0) - (Number(a.estimated_value) || 0);
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  // Reset kanban "load more" limits when filters/sort change
  useEffect(() => {
    setKanbanLimits({});
  }, [search, filterOrigin, filterInterest, filterStatus, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLeads = filteredLeads.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    !!search.trim() || filterOrigin !== "all" || filterInterest !== "all" || !!filterStatus;

  const clearFilters = () => {
    updateSearch({ q: "", origin: "all", interest: "all", status: "", page: 1 });
  };

  const openDetail = (l: any) => {
    setSelected(l);
    setEdit({
      status: normalizeLeadStatus(l.status),
      notes: l.notes ?? "",
      estimated_value: l.estimated_value ? String(l.estimated_value) : "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!selected) return;
    const { error } = await supabase
      .from("leads")
      .update({
        status: edit.status,
        notes: edit.notes || null,
        estimated_value: edit.estimated_value ? Number(edit.estimated_value) : null,
      })
      .eq("id", selected.id);
    if (error) return toast.error(error.message);
    toast.success("Lead atualizado");
    setOpen(false);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir lead?")) return;
    const { error } = await supabase.from("leads").delete().eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };

  const updateStatus = async (id: string, status: Status) => {
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };
  const onDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    const lead = leads.find((l) => l.id === id);
    if (!lead || lead.status === status) return;
    updateStatus(id, status);
  };

  const leadsByStatus = (s: Status) =>
    filteredLeads.filter((l) => normalizeLeadStatus(l.status) === s);

  return (
    <AdminLayout title="Leads">
      <div className="bg-card border border-border rounded-xl">
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por nome ou empresa..."
                className="pl-9 pr-9 h-10"
              />
              {isBusy && (
                <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground animate-spin" />
              )}
            </div>
            <div className="inline-flex rounded-md border border-border bg-background p-0.5">
              <button
                onClick={() => setView("kanban")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 text-xs rounded-sm transition-colors",
                  view === "kanban"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Kanban
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 h-8 text-xs rounded-sm transition-colors",
                  view === "list"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <List className="w-3.5 h-3.5" /> Lista
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterStatus || "all"}
              onChange={(e) => setFilterStatus(e.target.value === "all" ? "" : e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              {LEAD_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>

            <select
              value={filterOrigin}
              onChange={(e) => setFilterOrigin(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="all">Todas as origens</option>
              {originOptions.map((o) => (
                <option key={o} value={o}>
                  {leadOriginLabel(o)}
                </option>
              ))}
            </select>

            <select
              value={filterInterest}
              onChange={(e) => setFilterInterest(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs max-w-[240px]"
            >
              <option value="all">Todos os interesses</option>
              {interestOptions.map((o) => (
                <option key={o} value={o}>
                  {o.length > 40 ? o.slice(0, 40) + "…" : o}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="created_desc">Mais recentes</option>
              <option value="created_asc">Mais antigos</option>
              <option value="name_asc">Nome (A–Z)</option>
              <option value="status">Status</option>
              <option value="value_desc">Maior valor</option>
            </select>

            <span className="text-xs text-muted-foreground ml-auto">
              {filteredLeads.length} de {leads.length} {leads.length === 1 ? "lead" : "leads"}
            </span>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-xs">
                <X className="w-3 h-3 mr-1" /> Limpar
              </Button>
            )}
          </div>
        </div>

        {loading && leads.length === 0 ? (
          view === "kanban" ? (
            <div className="p-4 overflow-x-auto">
              <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-full">
                {STATUSES.map((s) => (
                  <div
                    key={s}
                    className="bg-muted/30 border border-border rounded-lg min-h-[300px] p-2 space-y-2"
                  >
                    <Skeleton className="h-6 w-24 mb-2" />
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full rounded-md" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          )
        ) : view === "kanban" ? (
          <div className={cn("p-4 overflow-x-auto transition-opacity", isBusy && "opacity-60")}>
            <div className="grid grid-flow-col auto-cols-[minmax(260px,1fr)] gap-3 min-w-full">
              {STATUSES.map((s) => {
                const allItems = leadsByStatus(s);
                const limit = kanbanLimits[s] ?? KANBAN_PAGE;
                const items = allItems.slice(0, limit);
                const hasMore = allItems.length > items.length;
                return (
                  <div
                    key={s}
                    onDragOver={onDragOver}
                    onDrop={(e) => onDrop(e, s)}
                    className="bg-muted/30 border border-border rounded-lg flex flex-col min-h-[300px]"
                  >
                    <div className="px-3 py-2 border-b border-border flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={s} />
                      </div>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {allItems.length}
                      </Badge>
                    </div>
                    <div className="p-2 space-y-2 flex-1">
                      {allItems.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-6">
                          Nenhum lead
                        </p>
                      )}
                      {items.map((l) => (
                        <div
                          key={l.id}
                          draggable
                          onDragStart={(e) => onDragStart(e, l.id)}
                          onClick={() => openDetail(l)}
                          className="bg-card border border-border rounded-md p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/50 hover:shadow-sm transition-all"
                        >
                          <div className="font-medium text-sm truncate">{l.name}</div>
                          {l.company && (
                            <div className="text-xs text-muted-foreground truncate">
                              {l.company}
                            </div>
                          )}
                          <div className="mt-1.5 space-y-0.5">
                            {l.email && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Mail className="w-3 h-3 shrink-0" />
                                <span className="truncate">{l.email}</span>
                              </div>
                            )}
                            {l.phone && (
                              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Phone className="w-3 h-3 shrink-0" />
                                <span className="truncate">{l.phone}</span>
                              </div>
                            )}
                          </div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[10px] text-muted-foreground">
                              {leadOriginLabel(l.origin)}
                            </span>
                            {l.estimated_value && (
                              <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                R${" "}
                                {Number(l.estimated_value).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                      {hasMore && (
                        <button
                          onClick={() =>
                            setKanbanLimits((prev) => ({ ...prev, [s]: limit + KANBAN_PAGE }))
                          }
                          className="w-full text-xs text-muted-foreground hover:text-foreground py-2 border border-dashed border-border rounded-md hover:bg-muted/50 transition-colors"
                        >
                          Carregar mais ({allItems.length - items.length})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={cn("transition-opacity", isBusy && "opacity-60")}>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="px-4 py-3 font-medium">Nome</th>
                  <th className="px-4 py-3 font-medium">Contato</th>
                  <th className="px-4 py-3 font-medium">Origem</th>
                  <th className="px-4 py-3 font-medium">Interesse</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pagedLeads.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      Nenhum lead encontrado.
                    </td>
                  </tr>
                )}
                {pagedLeads.map((l) => (
                  <tr key={l.id} className="border-t border-border hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{l.name}</td>
                    <td className="px-4 py-3 text-xs space-y-0.5">
                      {l.email && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {l.email}
                        </div>
                      )}
                      {l.phone && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Phone className="w-3 h-3" />
                          {l.phone}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs">{leadOriginLabel(l.origin)}</td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate">{l.interest ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {new Date(l.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openDetail(l)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => del(l.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeads.length > 0 && (
              <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-3 flex-wrap text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span>
                    {(safePage - 1) * pageSize + 1}–
                    {Math.min(safePage * pageSize, filteredLeads.length)} de {filteredLeads.length}
                  </span>
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                  >
                    {[10, 20, 50, 100].map((n) => (
                      <option key={n} value={n}>
                        {n} / página
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={safePage <= 1}
                    onClick={() => setPage(safePage - 1)}
                  >
                    <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                  </Button>
                  <span className="px-2 text-muted-foreground">
                    Página {safePage} de {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage(safePage + 1)}
                  >
                    Próxima <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lead: {selected?.name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">E-mail</Label>
                  <p>{selected.email ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-xs">Telefone</Label>
                  <p>{selected.phone ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-xs">Empresa</Label>
                  <p>{selected.company ?? "—"}</p>
                </div>
                <div>
                  <Label className="text-xs">Origem</Label>
                  <p>{leadOriginLabel(selected.origin)}</p>
                </div>
              </div>
              {selected.interest && (
                <div>
                  <Label className="text-xs">Interesse</Label>
                  <p className="text-muted-foreground">{selected.interest}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border">
                <div>
                  <Label>Status</Label>
                  <select
                    value={edit.status}
                    onChange={(e) => setEdit({ ...edit, status: e.target.value as LeadStatus })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {LEAD_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Valor estimado (R$)</Label>
                  <input
                    type="number"
                    step="0.01"
                    value={edit.estimated_value}
                    onChange={(e) => setEdit({ ...edit, estimated_value: e.target.value })}
                    className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <Label>Notas</Label>
                <Textarea
                  rows={3}
                  value={edit.notes}
                  onChange={(e) => setEdit({ ...edit, notes: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
