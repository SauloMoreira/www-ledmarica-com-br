import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Building2, ShieldCheck, Tag, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { buildSeo } from "@/lib/seo";
import { formatCNPJ, isValidCNPJ, onlyDigits } from "@/lib/cnpj";
import { createCompany } from "@/server/companies.functions";
import { trackLeadCaptured } from "@/lib/tracking";

export const Route = createFileRoute("/cadastro-empresa")({
  head: () =>
    buildSeo({
      title: "Cadastrar empresa (CNPJ)",
      description:
        "Cadastre sua empresa para acessar preços de atacado e condições B2B na Led Maricá.",
      url: "/cadastro-empresa",
    }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({
        to: "/login",
        search: { redirect: "/cadastro-empresa" } as never,
      });
    }
  },
  component: CadastroEmpresaPage,
});

const schema = z.object({
  cnpj: z.string().refine((v) => isValidCNPJ(v), "CNPJ inválido"),
  legal_name: z.string().trim().min(2, "Informe a razão social").max(200),
  trade_name: z.string().trim().max(200).optional(),
  state_registration: z.string().trim().max(40).optional(),
  contact_name: z.string().trim().min(2, "Informe o responsável").max(120),
  contact_role: z.string().trim().max(80).optional(),
  contact_email: z.string().trim().email("E-mail inválido").max(255),
  contact_phone: z.string().trim().min(8, "Informe o telefone").max(40),
  address_zipcode: z.string().trim().max(20).optional(),
  address_street: z.string().trim().max(200).optional(),
  address_number: z.string().trim().max(20).optional(),
  address_complement: z.string().trim().max(120).optional(),
  address_neighborhood: z.string().trim().max(120).optional(),
  address_city: z.string().trim().max(120).optional(),
  address_state: z.string().trim().max(2).optional(),
});

type FormState = z.infer<typeof schema>;

const initial: FormState = {
  cnpj: "",
  legal_name: "",
  trade_name: "",
  state_registration: "",
  contact_name: "",
  contact_role: "",
  contact_email: "",
  contact_phone: "",
  address_zipcode: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
};

function CadastroEmpresaPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<{ approved: boolean; reason: string } | null>(null);

  const set =
    <K extends keyof FormState>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const onCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, cnpj: formatCNPJ(e.target.value) }));

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const r = schema.safeParse(form);
    if (!r.success) {
      const e: Record<string, string> = {};
      r.error.issues.forEach((i) => {
        e[i.path[0] as string] = i.message;
      });
      setErrors(e);
      toast.error("Confira os campos do formulário.");
      return;
    }
    setErrors({});
    setLoading(true);
    try {
      const res = await createCompany({
        data: { ...r.data, cnpj: onlyDigits(r.data.cnpj) },
      });
      // Empresa cadastrada para compras B2B = contato comercial interessado.
      trackLeadCaptured("b2b_company_signup");
      const approved = Boolean((res as { auto_approved?: boolean })?.auto_approved);
      const reason = String((res as { reason?: string })?.reason ?? "");
      toast.success(
        approved ? "Empresa aprovada automaticamente!" : "Cadastro enviado para aprovação!",
      );
      setSuccess({ approved, reason });
      setTimeout(() => {
        navigate({ to: "/conta/empresa" as never });
      }, 3500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao cadastrar";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background py-10 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 shadow-soft text-center">
          <div className="w-16 h-16 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground mb-2">
            {success.approved ? "Empresa aprovada!" : "Cadastro enviado!"}
          </h1>
          <p className="text-sm text-muted-foreground mb-2">
            {success.approved
              ? "Validamos seu CNPJ na Receita e seu acesso B2B já está liberado. Os preços de atacado aparecerão automaticamente para você."
              : "Recebemos os dados. Nosso time vai analisar e liberar os preços B2B em breve. Você receberá um e-mail assim que for aprovado."}
          </p>
          {success.reason && (
            <p className="text-xs text-muted-foreground mb-6 italic">{success.reason}</p>
          )}
          <div className="text-xs text-muted-foreground">
            Redirecionando para "Minha empresa"...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-10">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1.5 rounded-full text-xs font-semibold mb-3">
            <Building2 className="w-4 h-4" /> Área para empresas
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">Cadastre sua empresa</h1>
          <p className="text-muted-foreground mt-2">
            Após a aprovação você terá acesso a preços de atacado, condições B2B e negociação direta
            com nosso comercial.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <Benefit icon={Tag} title="Preço empresa" desc="Condições especiais para CNPJ" />
          <Benefit icon={ShieldCheck} title="Compra segura" desc="Mesmo checkout da loja" />
          <Benefit icon={Building2} title="Negociação direta" desc="Atendimento via WhatsApp" />
        </div>

        <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-md bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="text-sm text-foreground/90 space-y-2">
              <p className="font-semibold text-foreground">Como funciona a aprovação</p>
              <div>
                <p className="text-xs font-semibold text-success mb-1">
                  ✓ Aprovação automática (acesso B2B liberado na hora) se:
                </p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li>
                    CNPJ com situação <strong>ATIVA</strong> na Receita Federal
                  </li>
                  <li>Sem situação especial ou restrições</li>
                  <li>
                    Empresa aberta há <strong>mais de 6 meses</strong>
                  </li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold text-warning mb-1">
                  ⏱ Análise manual pelo administrador se:
                </p>
                <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                  <li>CNPJ recente, suspenso, baixado ou com restrição</li>
                  <li>Consulta à Receita indisponível no momento</li>
                </ul>
                <p className="text-xs text-muted-foreground mt-1">
                  Nesses casos, você recebe a resposta por e-mail em até 1 dia útil.
                </p>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="bg-card border border-border rounded-xl p-6 space-y-5 shadow-soft"
          noValidate
        >
          <Section title="Dados da empresa">
            <Field label="CNPJ *" error={errors.cnpj}>
              <input
                value={form.cnpj}
                onChange={onCnpjChange}
                inputMode="numeric"
                placeholder="00.000.000/0000-00"
                className={input}
              />
            </Field>
            <Field label="Razão social *" error={errors.legal_name}>
              <input value={form.legal_name} onChange={set("legal_name")} className={input} />
            </Field>
            <Field label="Nome fantasia" error={errors.trade_name}>
              <input value={form.trade_name} onChange={set("trade_name")} className={input} />
            </Field>
            <Field label="Inscrição estadual" error={errors.state_registration}>
              <input
                value={form.state_registration}
                onChange={set("state_registration")}
                className={input}
              />
            </Field>
          </Section>

          <Section title="Responsável">
            <Field label="Nome do responsável *" error={errors.contact_name}>
              <input value={form.contact_name} onChange={set("contact_name")} className={input} />
            </Field>
            <Field label="Cargo / função" error={errors.contact_role}>
              <input value={form.contact_role} onChange={set("contact_role")} className={input} />
            </Field>
            <Field label="E-mail corporativo *" error={errors.contact_email}>
              <input
                type="email"
                value={form.contact_email}
                onChange={set("contact_email")}
                className={input}
              />
            </Field>
            <Field label="Telefone / WhatsApp *" error={errors.contact_phone}>
              <input
                type="tel"
                value={form.contact_phone}
                onChange={set("contact_phone")}
                className={input}
              />
            </Field>
          </Section>

          <Section title="Endereço">
            <Field label="CEP" error={errors.address_zipcode}>
              <input
                value={form.address_zipcode}
                onChange={set("address_zipcode")}
                className={input}
              />
            </Field>
            <Field label="Rua / Logradouro" error={errors.address_street}>
              <input
                value={form.address_street}
                onChange={set("address_street")}
                className={input}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número" error={errors.address_number}>
                <input
                  value={form.address_number}
                  onChange={set("address_number")}
                  className={input}
                />
              </Field>
              <Field label="Complemento" error={errors.address_complement}>
                <input
                  value={form.address_complement}
                  onChange={set("address_complement")}
                  className={input}
                />
              </Field>
            </div>
            <Field label="Bairro" error={errors.address_neighborhood}>
              <input
                value={form.address_neighborhood}
                onChange={set("address_neighborhood")}
                className={input}
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Cidade" error={errors.address_city}>
                  <input
                    value={form.address_city}
                    onChange={set("address_city")}
                    className={input}
                  />
                </Field>
              </div>
              <Field label="UF" error={errors.address_state}>
                <input
                  value={form.address_state}
                  onChange={set("address_state")}
                  maxLength={2}
                  className={input + " uppercase"}
                />
              </Field>
            </div>
          </Section>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-md bg-primary text-primary-foreground font-semibold hover:brightness-110 transition disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar cadastro para aprovação"}
            </button>
            <p className="text-xs text-muted-foreground text-center mt-3">
              Após o envio, nosso time analisa o cadastro e libera os preços B2B. Você pode
              acompanhar o status em{" "}
              <Link to={"/conta/empresa" as never} className="text-primary underline">
                Minha empresa
              </Link>
              .
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}

const input =
  "w-full h-10 px-3 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-foreground mb-1">{label}</div>
      {children}
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}
    </label>
  );
}

function Benefit({
  icon: Icon,
  title,
  desc,
}: {
  icon: typeof Building2;
  title: string;
  desc: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </div>
  );
}
