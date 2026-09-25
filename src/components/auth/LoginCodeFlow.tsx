import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { sendLoginCode } from "@/server/shopperIdentity.functions";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import {
  FieldError,
  FieldLabel,
  inputClass,
  inputFocusHandlers,
  inputStyle,
  PrimaryButton,
} from "@/components/auth/AuthCard";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 30;

/**
 * Login sem senha: e-mail → código de 6 dígitos → sessão.
 * Serve também para quem teve a conta criada automaticamente no carrinho.
 */
export function LoginCodeFlow({
  initialEmail,
  onSuccess,
}: {
  initialEmail?: string;
  onSuccess: (userId: string) => Promise<void> | void;
}) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail ?? "");
  const [emailError, setEmailError] = useState<string>();
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string>();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const requestCode = async () => {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setEmailError("Informe um e-mail válido.");
      return;
    }
    setEmailError(undefined);
    setSending(true);
    try {
      await sendLoginCode({ data: { email: value } });
      setEmail(value);
      setStep("code");
      setCode("");
      setCodeError(undefined);
      setCooldown(RESEND_SECONDS);
      toast.success("Código enviado!", { description: `Confira a caixa de entrada de ${value}.` });
    } catch (e) {
      const msg =
        e instanceof Response && e.status === 429
          ? "Muitas tentativas. Aguarde alguns minutos e tente de novo."
          : e instanceof Error && e.message
            ? e.message
            : "Não foi possível enviar o código.";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const verify = async (token: string) => {
    if (verifyingRef.current || token.length !== 6) return;
    verifyingRef.current = true;
    setVerifying(true);
    setCodeError(undefined);
    try {
      let { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
      if (error) {
        const retry = await supabase.auth.verifyOtp({ email, token, type: "magiclink" });
        if (!retry.error) ({ data, error } = retry);
      }
      if (error || !data?.user?.id) {
        setCodeError("Código inválido ou expirado. Confira o e-mail ou peça um novo.");
        setCode("");
        return;
      }
      await onSuccess(data.user.id);
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  };

  if (step === "email") {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void requestCode();
        }}
      >
        <FieldLabel htmlFor="login-code-email">E-mail</FieldLabel>
        <input
          id="login-code-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(undefined);
          }}
          aria-invalid={Boolean(emailError)}
          className={inputClass}
          style={inputStyle}
          {...inputFocusHandlers}
        />
        <FieldError message={emailError} />
        <p className="mt-2 mb-5 text-[12px]" style={{ color: "#64748B" }}>
          Sem senha: enviamos um código de 6 dígitos para você entrar. Se ainda não tem conta, ela é
          criada automaticamente.
        </p>
        <PrimaryButton type="submit" loading={sending}>
          {sending ? "Enviando..." : "Receber código por e-mail"}
        </PrimaryButton>
      </form>
    );
  }

  return (
    <div>
      <div
        className="flex items-start gap-3 rounded-lg p-3 mb-5"
        style={{ backgroundColor: "#EEF6FF", color: "#0F3D75" }}
      >
        <MailCheck className="w-5 h-5 shrink-0 mt-0.5" aria-hidden />
        <p className="text-[13px] leading-snug">
          Enviamos um código para <strong className="break-all">{email}</strong>. Pode levar até 1
          minuto — confira também o spam.
        </p>
      </div>
      <FieldLabel htmlFor="login-code-otp">Código de acesso</FieldLabel>
      <div className="flex justify-center">
        <InputOTP
          id="login-code-otp"
          maxLength={6}
          value={code}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          disabled={verifying}
          onChange={(v) => {
            const digits = v.replace(/\D/g, "");
            setCode(digits);
            if (digits.length === 6) void verify(digits);
          }}
        >
          <InputOTPGroup>
            {Array.from({ length: 6 }).map((_, i) => (
              <InputOTPSlot key={i} index={i} className="w-11 h-12 text-lg" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
      <FieldError message={codeError} />
      <div className="mt-5">
        <PrimaryButton
          type="button"
          loading={verifying}
          disabled={code.length !== 6}
          onClick={() => void verify(code)}
        >
          {verifying ? "Entrando..." : "Entrar"}
        </PrimaryButton>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px]">
        <button
          type="button"
          onClick={() => setStep("email")}
          className="font-medium"
          style={{ color: "#1A56DB" }}
        >
          Usar outro e-mail
        </button>
        <button
          type="button"
          disabled={cooldown > 0 || sending}
          onClick={() => void requestCode()}
          className="font-medium disabled:opacity-50"
          style={{ color: "#1A56DB" }}
        >
          {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
        </button>
      </div>
    </div>
  );
}
