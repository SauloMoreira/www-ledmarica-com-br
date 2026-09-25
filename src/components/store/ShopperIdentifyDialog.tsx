import { useEffect, useId, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { CheckCircle2, Lock, MessageCircle, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/stores/cartStore";
import { useShopperIdentity } from "@/stores/shopperIdentity";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { identifyShopper } from "@/server/shopperIdentity.functions";
import { formatBrMobile, normalizeBrMobile } from "@/lib/brPhone";
import { GoogleButton } from "@/components/auth/AuthCard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Errors = { name?: string; email?: string; phone?: string };

/**
 * Identificação no 1º "Adicionar ao carrinho": nome, e-mail e WhatsApp.
 *
 * - Visitante: capta o lead, salva o contato do carrinho e cria a conta sem
 *   senha em segundo plano (acesso depois por código no e-mail ou Google).
 * - Logado sem WhatsApp no perfil: pede só o WhatsApp.
 * - Logado com WhatsApp: nunca aparece.
 *
 * Abre automaticamente quando um item entra no carrinho; "Agora não" fecha e
 * o pedido reaparece no próximo item adicionado ou ao tentar finalizar.
 */
export function ShopperIdentifyDialog() {
  const { user, loading: authLoading } = useAuth();
  const identity = useShopperIdentity((s) => s.identity);
  const prompt = useShopperIdentity((s) => s.prompt);
  const openPrompt = useShopperIdentity((s) => s.openPrompt);
  const closePrompt = useShopperIdentity((s) => s.closePrompt);
  const saveIdentity = useShopperIdentity((s) => s.saveIdentity);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // WhatsApp do perfil do cliente logado (null = ainda não sabemos).
  const [profilePhone, setProfilePhone] = useState<string | null | undefined>(undefined);
  const [profileName, setProfileName] = useState<string>("");
  useEffect(() => {
    let alive = true;
    if (!user) {
      setProfilePhone(undefined);
      return;
    }
    supabase
      .from("profiles")
      .select("name, phone")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!alive) return;
        setProfilePhone(normalizeBrMobile(data?.phone ?? null));
        setProfileName(data?.name ?? "");
      });
    return () => {
      alive = false;
    };
  }, [user]);

  const phoneOnly = Boolean(user);
  const alreadyKnown = user ? Boolean(profilePhone) : Boolean(identity);

  // Abre automaticamente quando um item novo entra no carrinho.
  useEffect(() => {
    return useCart.subscribe((state, prev) => {
      // Reidratação do carrinho salvo (localStorage) não é "adicionar item".
      if (!useCart.persist?.hasHydrated?.()) return;
      const prevQty = new Map(prev.items.map((i) => [i.productId, i.qty]));
      const added = state.items.find((i) => i.qty > (prevQty.get(i.productId) ?? 0));
      if (!added) return;
      const s = useShopperIdentity.getState();
      if (s.prompt.open) return;
      window.setTimeout(() => {
        const st = useShopperIdentity.getState();
        const known = st.identity !== null;
        // Visitante: pergunta se ainda não se identificou. Logado: decide no render (perfil).
        if (!known || user) {
          st.openPrompt({ productId: added.productId, productName: added.name });
        }
      }, 350); // deixa a gaveta do carrinho abrir primeiro
    });
  }, [user]);

  const open = prompt.open && !authLoading && !(user && profilePhone === undefined) && !alreadyKnown;

  // Logado e já com WhatsApp: fecha qualquer pedido pendente sem mostrar nada.
  useEffect(() => {
    if (prompt.open && alreadyKnown) {
      closePrompt();
      if (prompt.next) navigate({ to: prompt.next as never });
    }
  }, [prompt.open, prompt.next, alreadyKnown, closePrompt, navigate]);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const ids = { name: useId(), email: useId(), phone: useId() };

  useEffect(() => {
    if (open) {
      setName(identity?.name ?? profileName ?? "");
      setEmail(identity?.email ?? user?.email ?? "");
      setPhone(identity?.phone ? formatBrMobile(identity.phone) : "");
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const validate = (): Errors => {
    const e: Errors = {};
    if (!phoneOnly) {
      if (name.trim().length < 2) e.name = "Informe seu nome.";
      if (!EMAIL_RE.test(email.trim())) e.email = "Informe um e-mail válido.";
    }
    if (!normalizeBrMobile(phone)) e.phone = "Informe um celular com DDD, ex.: (21) 99999-8888.";
    return e;
  };

  const submit = async () => {
    if (submitting) return;
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setSubmitting(true);
    try {
      const { getLeadTrackingPayload } = await import("@/lib/leadTracking");
      const normalizedPhone = normalizeBrMobile(phone)!;
      const res = await identifyShopper({
        data: {
          name: phoneOnly ? undefined : name.trim(),
          email: phoneOnly ? undefined : email.trim().toLowerCase(),
          phone: normalizedPhone,
          productId: prompt.productId ?? null,
          productName: prompt.productName ?? null,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
          tracking: getLeadTrackingPayload({ origin_context: "add_to_cart" }),
        },
      });
      if (res.mode === "profile") {
        setProfilePhone(normalizedPhone);
        toast.success("WhatsApp salvo! Vamos te avisar sobre o seu pedido por lá.");
      } else {
        saveIdentity({ name: name.trim(), email: email.trim().toLowerCase(), phone: normalizedPhone });
        toast.success("Carrinho salvo!", {
          description:
            res.account === "created"
              ? `Criamos seu acesso sem senha — enviamos os detalhes para ${email.trim()}.`
              : "Pode continuar comprando tranquilo.",
        });
      }
      const next = prompt.next;
      closePrompt();
      if (next) navigate({ to: next as never });
    } catch (err) {
      const msg =
        err instanceof Response && err.status === 429
          ? "Muitas tentativas. Aguarde alguns minutos."
          : err instanceof Error && err.message
            ? err.message
            : "Não foi possível salvar agora. Tente novamente.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogle = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const back = prompt.next ?? pathname ?? "/";
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/login?redirect=${encodeURIComponent(back)}`,
      });
      if (result.error) toast.error("Não foi possível conectar ao Google. Tente novamente.");
    } catch {
      toast.error("Não foi possível conectar ao Google. Tente novamente.");
    }
  };

  const dismiss = () => {
    if (prompt.required) return;
    closePrompt();
  };

  const inputBase =
    "w-full h-11 rounded-lg border bg-background px-3 text-[15px] outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-foreground/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            firstFieldRef.current?.focus();
          }}
          onEscapeKeyDown={(e) => prompt.required && e.preventDefault()}
          onPointerDownOutside={(e) => prompt.required && e.preventDefault()}
          className="fixed z-[71] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-24px)] max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-card shadow-2xl border border-border data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          {prompt.productName && (
            <div className="flex items-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-800 border-b border-emerald-100 rounded-t-2xl">
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
              <p className="text-[13px] leading-tight min-w-0">
                <span className="font-semibold">Adicionado ao carrinho:</span>{" "}
                <span className="truncate">{prompt.productName}</span>
              </p>
            </div>
          )}

          {!prompt.required && (
            <DialogPrimitive.Close
              aria-label="Fechar"
              className="absolute right-3 top-3 rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              style={prompt.productName ? { top: 56 } : undefined}
            >
              <X className="w-4 h-4" />
            </DialogPrimitive.Close>
          )}

          <div className="px-5 pt-5 pb-5 sm:px-6">
            <DialogPrimitive.Title className="font-display text-xl font-bold text-foreground pr-8">
              {phoneOnly ? "Qual é o seu WhatsApp?" : "Salve seu carrinho"}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="mt-1.5 text-[14px] text-muted-foreground leading-relaxed">
              {phoneOnly
                ? "Usamos para confirmar retirada, entrega e tirar dúvidas sobre o seu pedido."
                : "Informe seus contatos para guardarmos seu carrinho e te avisarmos sobre frete, estoque e o seu pedido. Sem senha."}
            </DialogPrimitive.Description>

            <form
              className="mt-5 space-y-3.5"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {!phoneOnly && (
                <>
                  <div>
                    <label htmlFor={ids.name} className="block text-[13px] font-medium mb-1">
                      Nome
                    </label>
                    <input
                      ref={firstFieldRef}
                      id={ids.name}
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => name && setErrors((p) => ({ ...p, name: validate().name }))}
                      aria-invalid={Boolean(errors.name)}
                      aria-describedby={errors.name ? `${ids.name}-err` : undefined}
                      className={`${inputBase} ${errors.name ? "border-destructive" : "border-border"}`}
                      placeholder="Como podemos te chamar?"
                      maxLength={120}
                    />
                    {errors.name && (
                      <p id={`${ids.name}-err`} className="mt-1 text-[12px] text-destructive">
                        {errors.name}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={ids.email} className="block text-[13px] font-medium mb-1">
                      E-mail
                    </label>
                    <input
                      id={ids.email}
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => email && setErrors((p) => ({ ...p, email: validate().email }))}
                      aria-invalid={Boolean(errors.email)}
                      aria-describedby={errors.email ? `${ids.email}-err` : undefined}
                      className={`${inputBase} ${errors.email ? "border-destructive" : "border-border"}`}
                      placeholder="seu@email.com"
                      maxLength={180}
                    />
                    {errors.email && (
                      <p id={`${ids.email}-err`} className="mt-1 text-[12px] text-destructive">
                        {errors.email}
                      </p>
                    )}
                  </div>
                </>
              )}
              <div>
                <label htmlFor={ids.phone} className="block text-[13px] font-medium mb-1">
                  WhatsApp
                </label>
                <div className="relative">
                  <MessageCircle
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-600"
                    aria-hidden
                  />
                  <input
                    ref={phoneOnly ? firstFieldRef : undefined}
                    id={ids.phone}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    value={phone}
                    onChange={(e) => setPhone(formatBrMobile(e.target.value))}
                    onBlur={() => phone && setErrors((p) => ({ ...p, phone: validate().phone }))}
                    aria-invalid={Boolean(errors.phone)}
                    aria-describedby={errors.phone ? `${ids.phone}-err` : undefined}
                    className={`${inputBase} pl-9 ${errors.phone ? "border-destructive" : "border-border"}`}
                    placeholder="(21) 99999-8888"
                  />
                </div>
                {errors.phone && (
                  <p id={`${ids.phone}-err`} className="mt-1 text-[12px] text-destructive">
                    {errors.phone}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-11 rounded-lg bg-primary text-primary-foreground font-semibold text-[15px] hover:bg-primary/90 active:scale-[0.99] transition disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {submitting && (
                  <span className="inline-block w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                )}
                {submitting ? "Salvando…" : prompt.next ? "Salvar e finalizar pedido" : "Salvar e continuar"}
              </button>
            </form>

            {!phoneOnly && (
              <>
                <div className="flex items-center gap-3 my-4" aria-hidden>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[12px] text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <GoogleButton onClick={() => void handleGoogle()} disabled={submitting} />
              </>
            )}

            <ul className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              <li className="inline-flex items-center gap-1">
                <Lock className="w-3 h-3" aria-hidden /> Sem senha
              </li>
              <li className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" aria-hidden /> Dados protegidos (LGPD)
              </li>
              <li>Sem spam</li>
            </ul>
            <p className="mt-2 text-center text-[11px] leading-snug text-muted-foreground">
              Ao continuar, você concorda em receber contato da Led Maricá por e-mail e WhatsApp
              sobre este carrinho e seus pedidos. Você pode sair quando quiser.{" "}
              <a href="/privacidade" target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                Política de privacidade
              </a>
            </p>

            {!prompt.required && (
              <button
                type="button"
                onClick={dismiss}
                className="mt-3 w-full text-center text-[13px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
              >
                Agora não
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
