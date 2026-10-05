import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  MessageCircle,
  Send,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { getPublicCompanySettings, submitContactMessage } from "@/server/institutional.functions";
import { buildSeo, SITE_URL } from "@/lib/seo";
import { trackLeadCaptured } from "@/lib/tracking";

export const Route = createFileRoute("/contato")({
  head: () =>
    buildSeo({
      title: "Contato — Fale Conosco",
      description:
        "Fale com a Led Maricá: telefone, WhatsApp, e-mail e formulário de contato. Atendimento rápido para dúvidas, orçamentos e suporte em material elétrico e iluminação LED.",
      url: "/contato",
    }),
  component: ContatoPage,
});

function onlyDigits(s: string) {
  return s.replace(/\D/g, "");
}

function ContatoPage() {
  const { data } = useQuery({
    queryKey: ["public-company"],
    queryFn: () => getPublicCompanySettings(),
  });
  const company = data?.company;

  const [form, setForm] = useState({ name: "", email: "", phone: "", subject: "", message: "" });
  const [accept, setAccept] = useState(false);
  const [done, setDone] = useState(false);

  const submit = useMutation({
    mutationFn: () =>
      submitContactMessage({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || undefined,
          subject: form.subject.trim() || undefined,
          message: form.message.trim(),
        },
      }),
    onSuccess: () => {
      trackLeadCaptured("contact_form");
      setDone(true);
      setForm({ name: "", email: "", phone: "", subject: "", message: "" });
      setAccept(false);
      toast.success("Mensagem enviada com sucesso. Nossa equipe retornará em breve.");
    },
    onError: () =>
      toast.error("Não foi possível enviar agora. Tente novamente em alguns instantes."),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accept) {
      toast.error("É necessário concordar com o uso dos dados.");
      return;
    }
    if (!form.name.trim() || !form.email.trim() || !form.message.trim()) {
      toast.error("Preencha nome, e-mail e mensagem.");
      return;
    }
    submit.mutate();
  };

  const fullAddress = company
    ? [
        [company.address_street, company.address_number].filter(Boolean).join(", "),
        company.address_complement,
        company.address_neighborhood,
        [company.address_city, company.address_state].filter(Boolean).join("/"),
        company.address_zipcode ? `CEP ${company.address_zipcode}` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : "";




  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="max-w-3xl mx-auto text-center mb-10">
          <h1 className="font-display text-3xl lg:text-4xl font-bold tracking-tight">
            Fale Conosco
          </h1>
          <p className="mt-3 text-muted-foreground">
            Tire dúvidas, envie sugestões ou solicite atendimento. Retornaremos o mais breve
            possível.
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-6 max-w-6xl mx-auto">
          {/* Info */}
          <div className="lg:col-span-2 space-y-3">
            {company?.support_email && (
              <InfoCard icon={<Mail className="w-5 h-5" />} label="E-mail">
                <a
                  href={`mailto:${company.support_email}`}
                  className="text-primary hover:underline break-all"
                >
                  {company.support_email}
                </a>
              </InfoCard>
            )}
            {company?.support_phone && (
              <InfoCard icon={<Phone className="w-5 h-5" />} label="Telefone">
                <a
                  href={`tel:${onlyDigits(company.support_phone)}`}
                  className="text-primary hover:underline"
                >
                  {company.support_phone}
                </a>
              </InfoCard>
            )}
            {company?.support_whatsapp && (
              <InfoCard icon={<MessageCircle className="w-5 h-5" />} label="WhatsApp">
                <a
                  href={`https://wa.me/${onlyDigits(company.support_whatsapp)}`}
                  data-wa-origin="contato"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {company.support_whatsapp}
                </a>
              </InfoCard>
            )}
            {company?.business_hours && (
              <InfoCard icon={<Clock className="w-5 h-5" />} label="Atendimento">
                <span className="text-foreground">{company.business_hours}</span>
              </InfoCard>
            )}
            {fullAddress && (
              <InfoCard icon={<MapPin className="w-5 h-5" />} label="Endereço">
                <span className="text-foreground">{fullAddress}</span>
                <a
                  href="https://maps.app.goo.gl/hMuYV3QsZf5nL1Fk6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block mt-1 text-xs text-primary hover:underline"
                >
                  Abrir no Google Maps
                </a>
              </InfoCard>
            )}
          </div>

          {/* Form */}
          <Card className="lg:col-span-3">
            <CardContent className="p-6">
              {done ? (
                <div className="py-12 text-center">
                  <CheckCircle2 className="w-12 h-12 text-primary mx-auto mb-4" />
                  <h2 className="text-xl font-semibold mb-2">Mensagem enviada!</h2>
                  <p className="text-muted-foreground mb-6">
                    Recebemos sua mensagem. Nossa equipe retornará em breve no e-mail informado.
                  </p>
                  <Button variant="outline" onClick={() => setDone(false)}>
                    Enviar outra mensagem
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Nome *</Label>
                      <Input
                        id="name"
                        required
                        maxLength={200}
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">E-mail *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        maxLength={255}
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input
                        id="phone"
                        maxLength={40}
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="subject">Assunto</Label>
                      <Input
                        id="subject"
                        maxLength={200}
                        value={form.subject}
                        onChange={(e) => setForm({ ...form, subject: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="message">Mensagem *</Label>
                    <Textarea
                      id="message"
                      required
                      maxLength={5000}
                      rows={6}
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                    />
                  </div>
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={accept}
                      onChange={(e) => setAccept(e.target.checked)}
                    />
                    <span>
                      Usaremos seus dados apenas para responder à sua solicitação, conforme nossa{" "}
                      <a href="/privacidade" className="underline hover:text-foreground">
                        política de privacidade
                      </a>
                      .
                    </span>
                  </label>
                  <Button type="submit" disabled={submit.isPending} className="w-full sm:w-auto">
                    {submit.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" /> Enviar mensagem
                      </>
                    )}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ContactPage",
            name: "Contato — Fale Conosco",
            url: `${SITE_URL}/contato`,
            description:
              "Fale com a Led Maricá: telefone, WhatsApp, e-mail e formulário de contato. Atendimento rápido para dúvidas, orçamentos e suporte em material elétrico e iluminação LED.",
          }),
        }}
      />
      {company && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": ["Store", "LocalBusiness"],
              name: "Led Maricá",
              url: SITE_URL,
              telephone: company.support_phone || undefined,
              email: company.support_email || undefined,
              address: {
                "@type": "PostalAddress",
                streetAddress: [company.address_street, company.address_number]
                  .filter(Boolean)
                  .join(", "),
                addressLocality: company.address_city,
                addressRegion: company.address_state,
                postalCode: company.address_zipcode,
                addressCountry: "BR",
              },
              openingHours: company.business_hours,
              contactPoint: company.support_phone
                ? {
                    "@type": "ContactPoint",
                    telephone: company.support_phone,
                    contactType: "customer service",
                    availableLanguage: "Portuguese",
                  }
                : undefined,
            }),
          }}
        />
      )}
    </StoreLayout>
  );
}

function InfoCard({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-0.5">
            {label}
          </div>
          <div className="text-sm">{children}</div>
        </div>
      </CardContent>
    </Card>
  );
}
