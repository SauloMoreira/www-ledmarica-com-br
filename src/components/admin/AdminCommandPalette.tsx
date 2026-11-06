import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Package,
  ShoppingBag,
  User,
  Building2,
  Sparkles,
  Ticket,
  Megaphone,
  FileText,
  Layers,
  Settings,
  Search as SearchIcon,
  Plus,
  BarChart3,
  Calendar,
  Award,
  Boxes,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  adminGlobalSearch,
  type AdminSearchGroup,
  type AdminSearchHit,
} from "@/server/adminSearch.functions";
import { Badge } from "@/components/ui/badge";

const GROUP_META: Record<AdminSearchGroup, { label: string; icon: any }> = {
  product: { label: "Produtos", icon: Package },
  order: { label: "Pedidos", icon: ShoppingBag },
  customer: { label: "Clientes", icon: User },
  company: { label: "Empresas B2B", icon: Building2 },
  lead: { label: "Leads", icon: Sparkles },
  coupon: { label: "Cupons", icon: Ticket },
  campaign: { label: "Campanhas", icon: Megaphone },
  invoice: { label: "Notas fiscais", icon: FileText },
  bundle: { label: "Kits e combos", icon: Layers },
};

const QUICK_LINKS: Array<{ label: string; to: string; icon: any }> = [
  { label: "Painel do Dia", to: "/admin/painel-do-dia", icon: Calendar },
  { label: "Novo produto", to: "/admin/produtos", icon: Plus },
  { label: "Pedidos", to: "/admin/pedidos", icon: ShoppingBag },
  { label: "Empresas B2B", to: "/admin/empresas", icon: Building2 },
  { label: "Orçamentos PJ", to: "/admin/orcamentos", icon: FileText },
  { label: "Novo orçamento PJ", to: "/admin/orcamentos/novo", icon: Plus },
  { label: "Leads (CRM)", to: "/admin/leads", icon: Sparkles },
  { label: "Cupons", to: "/admin/cupons", icon: Ticket },
  { label: "Campanhas", to: "/admin/campanhas", icon: Megaphone },
  { label: "Relatórios financeiros", to: "/admin/financeiro/relatorios", icon: BarChart3 },
  { label: "Qualidade do cadastro", to: "/admin/produtos/qualidade", icon: Award },
  { label: "Kits e Combos", to: "/admin/produtos/combos", icon: Boxes },
  { label: "Configurações da empresa", to: "/admin/settings/company", icon: Settings },
  { label: "Integrações / Pixels", to: "/admin/integracoes", icon: Settings },
  { label: "Homepage", to: "/admin/conteudo/homepage", icon: Settings },
  { label: "Frete local", to: "/admin/settings/frete-local", icon: Settings },
];

function useDebounced<T>(value: T, delay = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}

export interface AdminCommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AdminCommandPalette({ open, onOpenChange }: AdminCommandPaletteProps) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const debounced = useDebounced(q.trim(), 220);
  const enabled = debounced.length >= 2;

  const { data, isFetching } = useQuery({
    queryKey: ["admin-global-search", debounced],
    queryFn: () => adminGlobalSearch({ data: { q: debounced } }),
    enabled: open && enabled,
    staleTime: 15_000,
  });

  // reset when opening
  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const grouped = useMemo(() => {
    const map = new Map<AdminSearchGroup, AdminSearchHit[]>();
    for (const hit of data?.hits ?? []) {
      const arr = map.get(hit.group) ?? [];
      arr.push(hit);
      map.set(hit.group, arr);
    }
    return Array.from(map.entries());
  }, [data]);

  const go = (to: string) => {
    onOpenChange(false);
    // small timeout so the dialog can close before navigation flicker
    setTimeout(() => navigate({ to } as any), 0);
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar produto, pedido, cliente, lead, empresa, cupom…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        {!enabled && (
          <>
            <CommandGroup heading="Atalhos rápidos">
              {QUICK_LINKS.map((q) => {
                const Icon = q.icon;
                return (
                  <CommandItem key={q.to} value={q.label} onSelect={() => go(q.to)}>
                    <Icon className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span>{q.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandEmpty>Comece a digitar para buscar…</CommandEmpty>
          </>
        )}

        {enabled && isFetching && (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            <SearchIcon className="mx-auto mb-2 h-5 w-5 animate-pulse" />
            Buscando…
          </div>
        )}

        {enabled && !isFetching && grouped.length === 0 && (
          <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        )}

        {enabled &&
          grouped.map(([group, items], idx) => {
            const meta = GROUP_META[group];
            const Icon = meta.icon;
            return (
              <div key={group}>
                {idx > 0 && <CommandSeparator />}
                <CommandGroup heading={meta.label}>
                  {items.map((hit) => (
                    <CommandItem
                      key={`${group}-${hit.id}`}
                      value={`${meta.label} ${hit.title} ${hit.subtitle ?? ""} ${hit.id}`}
                      onSelect={() => go(hit.to)}
                    >
                      <Icon className="mr-2 h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-sm">{hit.title}</div>
                        {hit.subtitle && (
                          <div className="truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </div>
                        )}
                      </div>
                      {hit.badge && (
                        <Badge variant="secondary" className="ml-2 shrink-0 text-[10px] uppercase">
                          {hit.badge}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            );
          })}
      </CommandList>
    </CommandDialog>
  );
}
