import { useState } from "react";
import { Mail, Check, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { trackNewsletterSignup } from "@/lib/tracking";

const WELCOME_COUPON_CODE = "BEMVINDO10";

export function NewsletterSignup({ compact = false }: { compact?: boolean } = {}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;
    setStatus("loading");
    const { error } = await supabase.from("leads").insert({
      name: "Assinante Newsletter",
      email: trimmed,
      origin: "site",
      interest: "newsletter",
      status: "novo",
    });
    // Newsletter tem evento próprio (NewsletterSignup) — não é Lead.
    if (!error) trackNewsletterSignup("site");
    setStatus(error ? "error" : "done");
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(WELCOME_COUPON_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const card = (
    <div
      className={`rounded-2xl bg-gradient-to-br from-primary via-primary to-primary/80 text-primary-foreground ${compact ? "p-6 md:p-8" : "p-8 md:p-12"} text-center shadow-elevated`}
    >
      <div className="max-w-lg mx-auto">
          {status === "done" ? (
            <>
              <Check className="w-12 h-12 mx-auto mb-4 opacity-90" />
              <h2 className="text-2xl md:text-3xl font-bold mb-2">Cadastro confirmado!</h2>
              <p className="text-primary-foreground/90 mb-6">
                Use o cupom abaixo na sua primeira compra:
              </p>
              <div className="inline-flex items-center gap-2 bg-white text-foreground rounded-pill px-5 py-3 font-mono text-lg font-bold shadow-md">
                <span>{WELCOME_COUPON_CODE}</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label="Copiar cupom"
                  className="ml-2 p-1.5 rounded-full hover:bg-muted transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              {copied && (
                <p className="mt-3 text-sm text-primary-foreground/90">Código copiado!</p>
              )}
            </>
          ) : (
            <>
              <Mail className="w-12 h-12 mx-auto mb-4 opacity-90" />
              <h2 className="text-2xl md:text-3xl font-bold mb-2">
                Ganhe 10% de desconto na primeira compra
              </h2>
              <p className="text-primary-foreground/90 mb-6">
                Cadastre seu e-mail e receba novidades, promoções e o seu cupom de boas-vindas.
              </p>
              <form
                onSubmit={handleSubmit}
                className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto"
              >
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Seu melhor e-mail"
                  className="flex-1 rounded-pill px-4 py-2.5 text-sm text-foreground bg-white placeholder:text-muted-foreground outline-none"
                />
                <button
                  type="submit"
                  disabled={status === "loading"}
                  className="rounded-pill bg-foreground text-background px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {status === "loading" ? "Enviando..." : "Quero meu cupom"}
                </button>
              </form>
              {status === "error" && (
                <p className="mt-3 text-sm text-primary-foreground/90">
                  Não foi possível cadastrar agora. Tente novamente em instantes.
                </p>
              )}
            </>
          )}
      </div>
    </div>
  );
  if (compact) return card;
  return <section className="container mx-auto px-4 pb-12">{card}</section>;
}
