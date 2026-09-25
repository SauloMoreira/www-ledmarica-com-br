import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AuthCard,
  FieldLabel,
  FieldError,
  inputClass,
  inputStyle,
  inputFocusHandlers,
  PrimaryButton,
  GoogleButton,
  Divider,
} from "@/components/auth/AuthCard";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { checkLoginAttempt, recordAuthFailure } from "@/server/auth.functions";
import { LoginCodeFlow } from "@/components/auth/LoginCodeFlow";
import { useShopperIdentity } from "@/stores/shopperIdentity";

import { buildSeo } from "@/lib/seo";
import { translateAuthError } from "@/lib/authErrors";

export const Route = createFileRoute("/login")({
  head: () => buildSeo({ title: "Entrar na sua conta", url: "/login", noindex: true }),
  validateSearch: (
    search: Record<string, unknown>,
  ): { redirect?: string; modo?: "codigo" | "senha"; email?: string } => ({
    ...(typeof search.redirect === "string" && search.redirect.startsWith("/")
      ? { redirect: search.redirect }
      : {}),
    ...(search.modo === "codigo" || search.modo === "senha" ? { modo: search.modo } : {}),
    ...(typeof search.email === "string" ? { email: search.email.slice(0, 180) } : {}),
  }),
  beforeLoad: async ({ search }) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      if (search.redirect) {
        throw redirect({ to: search.redirect as never });
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .maybeSingle();
      throw redirect({ to: profile?.role === "admin" ? "/admin" : "/conta" });
    }
  },
  component: LoginPage,
});

const schema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

function LoginPage() {
  const navigate = useNavigate();
  const { redirect: redirectTo, modo, email: emailParam } = Route.useSearch();
  const identity = useShopperIdentity((s) => s.identity);
  const [mode, setMode] = useState<"codigo" | "senha">(
    modo ?? (redirectTo === "/checkout" || identity || emailParam ? "codigo" : "senha"),
  );
  const prefillEmail = emailParam ?? identity?.email ?? "";
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const validate = (values: { email: string; password: string }) => {
    const r = schema.safeParse(values);
    if (r.success) {
      setErrors({});
      return true;
    }
    const e: typeof errors = {};
    r.error.issues.forEach((i) => {
      e[i.path[0] as "email" | "password"] = i.message;
    });
    setErrors(e);
    return false;
  };

  const showAuthError = (message: string) => {
    setAuthError(message);
    toast.error(message);
  };

  const handleSubmit = async () => {
    if (loading) return;
    setAuthError(null);
    const nextEmail = emailRef.current?.value.trim() ?? "";
    const nextPassword = passwordRef.current?.value ?? "";
    if (!validate({ email: nextEmail, password: nextPassword })) {
      showAuthError("Confira os campos antes de continuar.");
      return;
    }
    setLoading(true);
    try {
      // Pré-checagem de rate limit (server-side) — não bloqueia em caso de falha de rede
      try {
        await checkLoginAttempt({ data: { email: nextEmail } });
      } catch (rlErr: unknown) {
        if (rlErr instanceof Response && rlErr.status === 429) {
          showAuthError("Muitas tentativas. Aguarde alguns minutos e tente novamente.");
          setLoading(false);
          return;
        }
        // Erro de rede no rate-limit não deve impedir login
        console.warn("Rate limit check falhou, prosseguindo:", rlErr);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email: nextEmail,
        password: nextPassword,
      });
      if (error) {
        void recordAuthFailure({ data: { email: nextEmail, reason: error.message } }).catch(
          () => {},
        );
        showAuthError(translateAuthError(error, "Não foi possível entrar. Tente novamente."));
        return;
      }
      const userId = data.user?.id;
      if (!userId) {
        showAuthError("Sessão inválida. Tente novamente.");
        return;
      }

      await finishLogin(userId);
    } catch (err) {
      console.error("Login error:", err);
      showAuthError(translateAuthError(err, "Erro inesperado ao entrar."));
    } finally {
      setLoading(false);
    }
  };

  // Pós-login comum (senha ou código): MFA de admin, status da conta e destino.
  const finishLogin = async (userId: string) => {
      // Verifica se a sessão precisa elevar para AAL2 (admin com TOTP cadastrado).
    try {
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (
        aalData?.currentLevel === "aal1" &&
        aalData?.nextLevel === "aal2"
      ) {
        toast.success("Confirme o código MFA para continuar.");
        navigate({
          to: "/mfa-challenge",
          search: { redirect: redirectTo || undefined },
        });
        return;
      }
    } catch (e) {
      console.warn("MFA AAL check failed:", e);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", userId)
      .maybeSingle();

    if (profile?.status && profile.status !== "active") {
      await supabase.auth.signOut();
      const msg =
        profile.status === "blocked"
          ? "Sua conta está bloqueada. Entre em contato com o suporte."
          : "Sua conta foi arquivada. Entre em contato com o suporte para reativá-la.";
      showAuthError(msg);
      return;
    }

    toast.success("Bem-vindo de volta!");
    if (redirectTo) {
      navigate({ to: redirectTo as never });
    } else {
      navigate({ to: profile?.role === "admin" ? "/admin" : "/conta" });
    }
  };

  const handleEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    void handleSubmit();
  };

  const handleGoogle = async () => {
    try {
      const { lovable } = await import("@/integrations/lovable/index");
      const loginUrl = redirectTo
        ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTo)}`
        : `${window.location.origin}/login`;
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: loginUrl,
      });
      if (result.error) {
        toast.error("Não foi possível conectar ao Google", {
          description: result.error.message ?? "Tente novamente em instantes.",
        });
        return;
      }
      if (result.redirected) return;
      navigate({ to: redirectTo || "/" });
    } catch (e: any) {
      toast.error("Não foi possível conectar ao Google", {
        description: e?.message ?? "Erro inesperado.",
      });
    }
  };

  return (
    <AuthCard
      title={mode === "codigo" ? "Entre sem senha" : "Bem-vindo de volta"}
      subtitle={
        mode === "codigo"
          ? "Enviamos um código de acesso para o seu e-mail"
          : "Acesse sua conta para continuar"
      }
      footer={
        <p className="text-center text-[12px] mt-6" style={{ color: "#94A3B8" }}>
          Não tem conta?{" "}
          <Link to={"/cadastro" as any} className="font-medium" style={{ color: "#1A56DB" }}>
            Cadastre-se
          </Link>
        </p>
      }
    >
      {mode === "codigo" ? (
        <>
          <LoginCodeFlow
            initialEmail={prefillEmail}
            onSuccess={(userId) => finishLogin(userId)}
          />
          <button
            type="button"
            onClick={() => setMode("senha")}
            className="mt-4 w-full text-center text-[12px] font-medium"
            style={{ color: "#1A56DB" }}
          >
            Prefiro entrar com senha
          </button>
        </>
      ) : (
      <>
      <div role="form" onKeyDown={handleEnter}>
        {authError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{authError}</AlertDescription>
          </Alert>
        )}

        <FieldLabel htmlFor="email">E-mail</FieldLabel>
        <input
          ref={emailRef}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="seu@email.com"
          onChange={() => setAuthError(null)}
          className={inputClass}
          style={inputStyle}
          {...inputFocusHandlers}
        />
        <FieldError message={errors.email} />

        <div className="mt-4">
          <FieldLabel htmlFor="password">Senha</FieldLabel>
          <div className="relative">
            <input
              ref={passwordRef}
              id="password"
              name="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              onChange={() => setAuthError(null)}
              className={inputClass + " pr-10"}
              style={inputStyle}
              {...inputFocusHandlers}
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-text-faint hover:text-foreground"
              aria-label={showPwd ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <FieldError message={errors.password} />
        </div>

        <div className="text-right mt-1.5 mb-6">
          <Link to={"/esqueci-senha" as any} className="text-[12px]" style={{ color: "#1A56DB" }}>
            Esqueci minha senha
          </Link>
        </div>

        <PrimaryButton type="button" loading={loading} onClick={() => void handleSubmit()}>
          {loading ? "Entrando..." : "Entrar"}
        </PrimaryButton>
        <button
          type="button"
          onClick={() => setMode("codigo")}
          className="mt-3 w-full text-center text-[12px] font-medium"
          style={{ color: "#1A56DB" }}
        >
          Entrar sem senha (código por e-mail)
        </button>
      </div>
      </>
      )}

      <Divider />
      <GoogleButton onClick={handleGoogle} />
    </AuthCard>
  );
}
