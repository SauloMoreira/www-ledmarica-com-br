import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_STYLES,
  TEMPERATURE_LABELS,
  TEMPERATURE_STYLES,
  normalizeLeadStatus,
  type LeadStatus,
} from "@/lib/constants/leadStatus";
import { cn } from "@/lib/utils";
import { Loader2, Phone, ArrowRight, Flame, Thermometer, Snowflake } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/funil")({
  component: FunilKanbanPage,
});

type LeadRow = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  origin: string | null;
  estimated_value: number | null;
  score: number | null;
  score_temperature: string | null;
  score_reason: string | null;
  created_at: string;
  updated_at: string | null;
};

const tempIcon = (t?: string | null) => {
  if (t === "quente") return <Flame className="h-3.5 w-3.5" />;
  if (t === "morno") return <Thermometer className="h-3.5 w-3.5" />;
  return <Snowflake className="h-3.5 w-3.5" />;
};

function FunilKanbanPage() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<LeadStatus | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchAllRows<any>((fromIdx, toIdx) =>
        supabase
          .from("leads")
          .select(
            "id,name,phone,email,status,origin,estimated_value,score,score_temperature,score_reason,created_at,updated_at",
          )
          .order("score", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(fromIdx, toIdx),
      );
      setLeads((data ?? []) as LeadRow[]);
    } catch {
      toast.error("Erro ao carregar leads");
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<LeadStatus, LeadRow[]>();
    LEAD_STATUSES.forEach((s) => map.set(s, []));
    for (const l of leads) {
      const s = normalizeLeadStatus(l.status);
      map.get(s)!.push(l);
    }
    return map;
  }, [leads]);

  async function moveLead(leadId: string, to: LeadStatus) {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const from = normalizeLeadStatus(lead.status);
    if (from === to) return;
    setMoving(leadId);
    // optimistic
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: to } : l)));
    const { error } = await supabase.from("leads").update({ status: to }).eq("id", leadId);
    if (error) {
      toast.error("Erro ao mover lead");
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status: from } : l)));
    } else {
      toast.success(`Movido para ${LEAD_STATUS_LABELS[to]}`);
    }
    setMoving(null);
  }

  return (
    <AdminLayout
      title="Funil de Leads"
      action={
        <Link
          to="/admin/leads"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
        >
          Ver lista completa
        </Link>
      }
    >
      <div className="mb-4 text-sm text-muted-foreground">
        Arraste os cards entre as colunas para atualizar o status. Total: {leads.length} leads.
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando funil…
        </div>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-4">
          <div className="flex gap-3" style={{ minWidth: `${LEAD_STATUSES.length * 280}px` }}>
            {LEAD_STATUSES.map((status) => {
              const items = grouped.get(status) ?? [];
              const totalValue = items.reduce(
                (acc, l) => acc + (Number(l.estimated_value) || 0),
                0,
              );
              const isOver = dragOver === status;
              return (
                <div
                  key={status}
                  className={cn(
                    "flex w-[270px] shrink-0 flex-col rounded-lg border bg-card transition-colors",
                    isOver && "ring-2 ring-primary",
                  )}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(status);
                  }}
                  onDragLeave={() => setDragOver((s) => (s === status ? null : s))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const id = e.dataTransfer.getData("text/plain") || draggingId;
                    if (id) void moveLead(id, status);
                    setDraggingId(null);
                  }}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between rounded-t-lg border-b px-3 py-2 text-xs font-semibold",
                      LEAD_STATUS_STYLES[status],
                    )}
                  >
                    <span>{LEAD_STATUS_LABELS[status]}</span>
                    <span className="rounded-full bg-background/60 px-2 py-0.5 text-[10px] font-bold">
                      {items.length}
                    </span>
                  </div>
                  {totalValue > 0 && (
                    <div className="border-b px-3 py-1 text-[11px] text-muted-foreground">
                      {totalValue.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </div>
                  )}
                  <div className="flex-1 space-y-2 p-2">
                    {items.length === 0 ? (
                      <div className="rounded border border-dashed p-4 text-center text-[11px] text-muted-foreground">
                        Sem leads
                      </div>
                    ) : (
                      items.map((l) => (
                        <div
                          key={l.id}
                          draggable
                          onDragStart={(e) => {
                            setDraggingId(l.id);
                            e.dataTransfer.setData("text/plain", l.id);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDraggingId(null)}
                          className={cn(
                            "group cursor-grab rounded-md border bg-background p-2 text-xs shadow-sm transition-all hover:shadow-md active:cursor-grabbing",
                            draggingId === l.id && "opacity-50",
                            moving === l.id && "pointer-events-none opacity-60",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <Link
                              to="/admin/leads"
                              className="line-clamp-1 flex-1 font-semibold hover:text-primary"
                            >
                              {l.name || "Sem nome"}
                            </Link>
                            {l.score_temperature && (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                                  TEMPERATURE_STYLES[l.score_temperature],
                                )}
                                title={l.score_reason ?? ""}
                              >
                                {tempIcon(l.score_temperature)}
                                {TEMPERATURE_LABELS[l.score_temperature]}
                              </span>
                            )}
                          </div>
                          {l.phone && (
                            <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Phone className="h-3 w-3" /> {l.phone}
                            </div>
                          )}
                          {l.estimated_value ? (
                            <div className="mt-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                              {Number(l.estimated_value).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </div>
                          ) : null}
                          <div className="mt-2 flex items-center justify-between gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(l.created_at).toLocaleDateString("pt-BR")}
                            </span>
                            <select
                              value={status}
                              onChange={(e) => moveLead(l.id, e.target.value as LeadStatus)}
                              className="h-6 rounded border border-input bg-background px-1 text-[10px]"
                              title="Mover para…"
                            >
                              {LEAD_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {LEAD_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-2 rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
        <ArrowRight className="h-4 w-4" />
        Dica: arraste cards entre as colunas ou use o seletor no canto inferior direito de cada
        card.
      </div>
    </AdminLayout>
  );
}
