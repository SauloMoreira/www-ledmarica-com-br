import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingBag,
  Ticket,
  Users,
  Megaphone,
  Image as ImageIcon,
  LogOut,
  Store,
  FileText,
  Building2,
  Mail,
  Shield,
  Truck,
  ChevronDown,
  Menu,
  X,
  Receipt,
  BarChart3,
  Settings as SettingsIcon,
  Boxes,
  Sparkles,
  Briefcase,
  Globe,
  AlertCircle,
  MessageSquareText,
  PackagePlus,
  DollarSign,
  ScrollText,
  Star,
} from "lucide-react";


import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/logo-navbar.png";
import { cn } from "@/lib/utils";
import { useAdminCounters, type CounterSeverity } from "@/hooks/useAdminCounters";
import { CounterBadge } from "./CounterBadge";

type Item = {
  to?: string;
  label: string;
  icon?: typeof LayoutDashboard;
  exact?: boolean;
  soon?: boolean;
  /** Id de um card de operations.functions cujo qty/severity vira badge. */
  counterId?: string;
  /** Soma de múltiplos counterIds (usado em itens "guarda-chuva"). */
  counterIds?: string[];
};

type Group = {
  id: string;
  label: string;
  icon: typeof LayoutDashboard;
  items: Item[];
};

const groups: Group[] = [
  {
    id: "painel",
    label: "Painel",
    icon: LayoutDashboard,
    items: [
      { to: "/admin", label: "Visão geral", icon: LayoutDashboard, exact: true },
      { to: "/admin/painel-do-dia", label: "Painel do dia", icon: Sparkles },
      {
        to: "/admin/pendencias",
        label: "Pendências",
        icon: AlertCircle,
        counterIds: [
          "paid-awaiting-shipping",
          "orders-awaiting-payment",
          "new-leads",
          "leads-no-response",
          "pending-companies",
          "b2b-open-negotiations",
          "low-stock",
          "out-of-stock",
          "inactive-products",
          "high-movement-low-stock",
          "no-image",
          "no-price",
          "no-weight",
          "local-zones-no-price",
          "abandoned-carts",
        ],
      },
    ],
  },
  {
    id: "vendas",
    label: "Vendas",
    icon: ShoppingBag,
    items: [
      {
        to: "/admin/pedidos",
        label: "Pedidos",
        icon: ShoppingBag,
        counterIds: ["paid-awaiting-shipping", "orders-awaiting-payment"],
      },
      {
        to: "/admin/carrinhos-abandonados",
        label: "Carrinhos abandonados",
        icon: ShoppingBag,
        counterId: "abandoned-carts",
      },
    ],
  },
  {
    id: "produtos",
    label: "Produtos",
    icon: Package,
    items: [
      {
        to: "/admin/produtos",
        label: "Produtos",
        icon: Package,
        counterIds: ["no-image", "no-price", "no-weight", "low-stock", "out-of-stock"],
      },
      { to: "/admin/categorias", label: "Categorias", icon: Tags },
      {
        to: "/admin/produtos/estoque",
        label: "Estoque",
        icon: Boxes,
        counterIds: ["low-stock", "out-of-stock", "inactive-products"],
      },
      {
        to: "/admin/produtos/revisao-comercial",
        label: "Revisão comercial",
        icon: DollarSign,
        counterIds: [
          "finance-products-no-cost",
          "finance-margin-critical",
          "commercial-b2b-critical",
          "no-price",
        ],
      },
      {
        to: "/admin/produtos/qualidade",
        label: "Qualidade do cadastro",
        icon: Package,
        counterIds: ["products-quality-low"],
      },
      { to: "/admin/produtos/atributos-rotulos", label: "Rótulos amigáveis", icon: Tags },
      { to: "/admin/produtos/combos", label: "Kits e Combos", icon: PackagePlus },
      { to: "/admin/produtos/importacao-ia", label: "Importação IA", icon: Sparkles },
      { to: "/admin/avaliacoes", label: "Avaliações", icon: Star },

    ],
  },
  {
    id: "crm",
    label: "Clientes & CRM",
    icon: Users,
    items: [
      {
        to: "/admin/usuarios",
        label: "Usuários e Clientes",
        icon: Users,
      },
      {
        to: "/admin/leads",
        label: "Leads",
        icon: Users,
        counterIds: ["new-leads", "leads-no-response"],
      },
      { to: "/admin/funil", label: "Funil comercial", icon: LayoutDashboard },
      { to: "/admin/contact-messages", label: "Atendimentos", icon: Mail },
      { to: "/admin/whatsapp-templates", label: "Modelos de WhatsApp", icon: MessageSquareText },
      { to: "/admin/comunicacao/emails", label: "Modelos de e-mail", icon: Mail },
    ],
  },
  {
    id: "b2b",
    label: "B2B / Atacado",
    icon: Briefcase,
    items: [
      {
        to: "/admin/empresas",
        label: "Empresas B2B",
        icon: Building2,
        counterId: "pending-companies",
      },
      { to: "/admin/orcamentos", label: "Orçamentos", icon: FileText },
      { to: "/admin/configuracoes-b2b", label: "Configurações B2B", icon: Briefcase },
      { to: "/atacado", label: "Vitrine atacado (loja)", icon: Store },
      { to: "/compra-rapida", label: "Compra rápida (loja)", icon: PackagePlus },
    ],
  },
  {
    id: "marketing",
    label: "Marketing",
    icon: Megaphone,
    items: [
      { to: "/admin/campanhas", label: "Campanhas", icon: Megaphone },
      { to: "/admin/banners", label: "Banners", icon: ImageIcon },
      { to: "/admin/cupons", label: "Cupons", icon: Ticket },
      { to: "/admin/seo", label: "SEO Insights", icon: Globe },
      { to: "/admin/integracoes", label: "Pixels e Analytics", icon: BarChart3 },
      { to: "/admin/automacoes", label: "Automações", icon: Sparkles },
      { to: "/admin/campanhas-performance", label: "Performance de campanhas", icon: Megaphone },
    ],
  },
  {
    id: "logistica",
    label: "Logística",
    icon: Truck,
    items: [
      {
        to: "/admin/settings/frete-local",
        label: "Frete local Maricá/RJ",
        icon: Truck,
        counterId: "local-zones-no-price",
      },
    ],
  },
  {
    id: "conteudo",
    label: "Conteúdo do site",
    icon: Globe,
    items: [
      { to: "/admin/conteudo/homepage", label: "Homepage", icon: LayoutDashboard },
      { to: "/admin/institutional-pages", label: "Páginas institucionais", icon: FileText },
    ],
  },
  {
    id: "financeiro",
    label: "Financeiro & Fiscal",
    icon: Receipt,
    items: [
      { to: "/admin/financeiro/resumo", label: "Resumo financeiro", icon: Receipt },
      { to: "/admin/financeiro/margem", label: "Margem de lucro", icon: Receipt },
      { to: "/admin/financeiro/mercadopago", label: "Mercado Pago", icon: Receipt },
      { to: "/admin/financeiro/configuracoes", label: "Configurações financeiras", icon: Receipt },
      {
        to: "/admin/financeiro/notas-fiscais",
        label: "Notas fiscais",
        icon: Receipt,
        counterId: "invoices-pending",
      },
      {
        to: "/admin/financeiro/impostos",
        label: "Impostos",
        icon: Receipt,
        counterId: "fiscal-pending",
      },
      { to: "/admin/financeiro/relatorios", label: "Relatórios financeiros", icon: Receipt },
    ],
  },
  {
    id: "config",
    label: "Configurações",
    icon: SettingsIcon,
    items: [{ to: "/admin/settings/company", label: "Dados da empresa", icon: Building2 }],
  },
  {
    id: "seguranca",
    label: "Segurança",
    icon: Shield,
    items: [
      { to: "/admin/seguranca", label: "Segurança", icon: Shield },
      { to: "/admin/seguranca/auditoria", label: "Auditoria", icon: ScrollText },
    ],
  },
];

const STORAGE_KEY = "admin.sidebar.openGroups";

function isItemActive(path: string, item: Item): boolean {
  if (!item.to) return false;
  if (item.exact) return path === item.to;
  return path === item.to || path.startsWith(item.to + "/");
}

function aggregateCounter(
  item: Item,
  counters: Record<string, { qty: number; severity: CounterSeverity }>,
): { qty: number; severity: CounterSeverity } {
  const ids = item.counterIds ?? (item.counterId ? [item.counterId] : []);
  if (ids.length === 0) return { qty: 0, severity: "info" };
  let qty = 0;
  let sev: CounterSeverity = "info";
  const order: Record<CounterSeverity, number> = { danger: 3, warn: 2, info: 1 };
  for (const id of ids) {
    const c = counters[id];
    if (!c) continue;
    qty += c.qty;
    if (order[c.severity] > order[sev]) sev = c.severity;
  }
  return { qty, severity: sev };
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const loc = useLocation();
  const path = loc.pathname;
  const { counters } = useAdminCounters();

  const initialOpen = useMemo(() => {
    // Open the group containing the active route by default
    const map: Record<string, boolean> = {};
    for (const g of groups) {
      map[g.id] = g.items.some((it) => isItemActive(path, it));
    }
    // Always open Painel by default
    map["painel"] = map["painel"] || path === "/admin";
    return map;
  }, [path]);

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    if (typeof window === "undefined") return initialOpen;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...initialOpen, ...JSON.parse(saved) };
    } catch {}
    return initialOpen;
  });

  useEffect(() => {
    // Make sure the group of the current route is open after navigation
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (g.items.some((it) => isItemActive(path, it))) next[g.id] = true;
      }
      return next;
    });
  }, [path]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(open));
    } catch {}
  }, [open]);

  const toggle = (id: string) => setOpen((p) => ({ ...p, [id]: !p[id] }));

  return (
    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
      {groups.map((g) => {
        const groupActive = g.items.some((it) => isItemActive(path, it));
        const isOpen = !!open[g.id];
        // Soma os contadores de todos os itens do grupo (sem duplicar entre itens
        // que apontam para o mesmo card — usamos um Set de ids únicos).
        const groupIds = new Set<string>();
        for (const it of g.items) {
          const ids = it.counterIds ?? (it.counterId ? [it.counterId] : []);
          ids.forEach((id) => groupIds.add(id));
        }
        const groupAgg = aggregateCounter(
          { label: "", counterIds: Array.from(groupIds) },
          counters,
        );
        return (
          <div key={g.id} className="space-y-1">
            <button
              type="button"
              onClick={() => toggle(g.id)}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                groupActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
              aria-expanded={isOpen}
            >
              <g.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">{g.label}</span>
              {!isOpen && <CounterBadge qty={groupAgg.qty} severity={groupAgg.severity} />}
              <ChevronDown
                className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")}
              />
            </button>
            {isOpen && (
              <div className="ml-2 pl-3 border-l border-border space-y-0.5">
                {g.items.map((it, idx) => {
                  if (it.soon || !it.to) {
                    return (
                      <div
                        key={`${g.id}-${idx}`}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-muted-foreground/60 cursor-not-allowed select-none"
                        title="Em breve"
                      >
                        <span className="flex-1 truncate">{it.label}</span>
                        <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground/70">
                          em breve
                        </span>
                      </div>
                    );
                  }
                  const active = isItemActive(path, it);
                  const agg = aggregateCounter(it, counters);
                  return (
                    <Link
                      key={`${g.id}-${idx}`}
                      to={it.to as any}
                      onClick={onNavigate}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                        active
                          ? "bg-primary text-primary-foreground font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      )}
                    >
                      {it.icon && <it.icon className="w-3.5 h-3.5 shrink-0" />}
                      <span className="flex-1 truncate">{it.label}</span>
                      <CounterBadge qty={agg.qty} severity={agg.severity} />
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function SidebarFooter() {
  const nav = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  };
  return (
    <div className="p-3 border-t border-border space-y-1">
      <Link
        to="/"
        className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <Store className="w-4 h-4" /> Ver loja
      </Link>
      <button
        onClick={handleLogout}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <LogOut className="w-4 h-4" /> Sair
      </button>
    </div>
  );
}

function SidebarHeader() {
  return (
    <div className="h-16 px-4 flex items-center border-b border-border shrink-0">
      <Link to={"/admin" as any} className="flex items-center gap-2">
        <img src={logo} alt="Led Maricá" className="h-8 w-auto" />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Admin
        </span>
      </Link>
    </div>
  );
}

export function AdminSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const loc = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [loc.pathname]);

  return (
    <>
      {/* Mobile top bar trigger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 inline-flex items-center justify-center h-10 w-10 rounded-lg bg-card border border-border shadow-sm"
        aria-label="Abrir menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 bg-card border-r border-border flex-col h-screen sticky top-0">
        <SidebarHeader />
        <SidebarContent />
        <SidebarFooter />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative w-72 max-w-[85vw] bg-card border-r border-border flex flex-col h-full">
            <div className="flex items-center justify-between border-b border-border h-16 px-4">
              <Link to={"/admin" as any} className="flex items-center gap-2">
                <img src={logo} alt="Led Maricá" className="h-7 w-auto" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Admin
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-muted"
                aria-label="Fechar menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
            <SidebarFooter />
          </aside>
        </div>
      )}
    </>
  );
}
