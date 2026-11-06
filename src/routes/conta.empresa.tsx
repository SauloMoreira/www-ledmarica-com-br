import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, CheckCircle2, Clock, ShieldX, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildSeo } from "@/lib/seo";
import { formatCNPJ } from "@/lib/cnpj";
import { getMyCompany } from "@/server/companies.functions";
import { formatDateBR } from "@/lib/dateBR";

type Company = {
  id: string;
  cnpj: string;
  legal_name: string;
  trade_name: string | null;
  status: "pending" | "approved" | "blocked" | "rejected";
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  rejection_reason: string | null;
  approved_at: string | null;
  created_at: string;
};

export const Route = createFileRoute("/conta/empresa")({
  head: () => buildSeo({ title: "Minha empresa", url: "/conta/empresa", noindex: true }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { redirect: "/conta/empresa" } as never,
      });
    }
  },
  component: MinhaEmpresaPage,
});

function MinhaEmpresaPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { company } = await getMyCompany();
        setCompany((company as Company) ?? null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-16 text-muted-foreground">Carregando...</div>;
  }

  if (!company) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Building2 className="w-12 h-12 text-primary mx-auto mb-3" />
        <h1 className="text-2xl font-bold text-foreground">Você ainda não cadastrou sua empresa</h1>
        <p className="text-muted-foreground mt-2">
          Cadastre seu CNPJ para acessar preços B2B e condições especiais.
        </p>
        <Link
          to={"/cadastro-empresa" as never}
          className="inline-flex mt-5 h-11 px-5 rounded-md bg-primary text-primary-foreground font-semibold items-center"
        >
          Cadastrar empresa
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">Minha empresa</h1>

      <StatusCard status={company.status} reason={company.rejection_reason} />

      <div className="mt-6 bg-card border border-border rounded-xl p-6 space-y-3 shadow-soft">
        <Row label="Razão social" value={company.legal_name} />
        {company.trade_name && <Row label="Nome fantasia" value={company.trade_name} />}
        <Row label="CNPJ" value={formatCNPJ(company.cnpj)} />
        <Row label="Responsável" value={company.contact_name} />
        <Row label="E-mail" value={company.contact_email} />
        <Row label="Telefone" value={company.contact_phone} />
        {company.approved_at && (
          <Row
            label="Aprovada em"
            value={formatDateBR(company.approved_at)}
          />
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-6">
        Para alterações nos dados cadastrais ou para vincular outros usuários à empresa, fale com o
        atendimento da Led Maricá.
      </p>
    </div>
  );
}

function StatusCard({ status, reason }: { status: Company["status"]; reason: string | null }) {
  const map = {
    pending: {
      Icon: Clock,
      tone: "bg-warning/10 border-warning/40",
      title: "Cadastro em análise",
      body: "Assim que aprovado, você terá acesso às condições comerciais B2B.",
    },
    approved: {
      Icon: CheckCircle2,
      tone: "bg-success/10 border-success/40",
      title: "Empresa aprovada",
      body: "Você já pode comprar com preço empresa nos produtos com condição B2B.",
    },
    blocked: {
      Icon: ShieldX,
      tone: "bg-destructive/10 border-destructive/40",
      title: "Acesso B2B bloqueado",
      body: "Seu acesso B2B está temporariamente indisponível. Entre em contato com a loja.",
    },
    rejected: {
      Icon: XCircle,
      tone: "bg-destructive/10 border-destructive/40",
      title: "Cadastro recusado",
      body: reason ?? "Entre em contato com o atendimento para mais informações.",
    },
  } as const;
  const info = map[status];
  const Icon = info.Icon;
  return (
    <div className={`mt-6 p-5 rounded-xl border flex items-start gap-3 ${info.tone}`}>
      <Icon className="w-6 h-6 shrink-0 mt-0.5 text-foreground" />
      <div>
        <div className="font-semibold text-foreground">{info.title}</div>
        <div className="text-sm text-muted-foreground mt-1">{info.body}</div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm border-b border-border last:border-0 pb-2 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground text-right">{value}</span>
    </div>
  );
}
