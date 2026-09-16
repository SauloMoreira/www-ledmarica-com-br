import { useEffect, useState } from "react";
import { Bell, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCartSessionId } from "@/lib/cartSession";
import { saveCartContact } from "@/server/cartSync.functions";

const STATUS_KEY = "led-marica-cart-contact-status";

type Status = "idle" | "expanded" | "submitting" | "done" | "dismissed";

function readStoredStatus(): Status {
  if (typeof window === "undefined") return "idle";
  try {
    const v = window.localStorage.getItem(STATUS_KEY);
    return v === "done" || v === "dismissed" ? v : "idle";
  } catch {
    return "idle";
  }
}

function persistStatus(status: "done" | "dismissed") {
  try {
    window.localStorage.setItem(STATUS_KEY, status);
  } catch {
    // Navegação privada/local storage bloqueado — só não persiste a preferência,
    // o prompt pode reaparecer na próxima visita. Não é crítico.
  }
}

function parseContact(raw: string): { email?: string; phone?: string } | null {
  const value = raw.trim();
  if (!value) return null;
  if (value.includes("@")) {
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRe.test(value) ? { email: value } : null;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13 ? { phone: digits } : null;
}

/**
 * Prompt discreto e opcional, mostrado assim que o carrinho tem itens, para
 * capturar e-mail/WhatsApp ANTES da etapa de dados do checkout.
 *
 * Existe porque `detect_abandoned_carts` (job hourly) só consegue avisar
 * quem abandonou o carrinho se tiver um contato — e hoje isso só é coletado
 * lá na frente do funil. Sem isso, todo carrinho abandonado antes do
 * checkout fica permanentemente "sem contato" na fila de recuperação.
 *
 * Nunca bloqueia a compra: 100% opcional, dispensável, e não aparece de novo
 * depois de usado ou dispensado (guardado em localStorage, mesmo mecanismo
 * de `cartSession.ts`).
 */
export function CartContactCapture() {
  const [status, setStatus] = useState<Status>("idle");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    setStatus(readStoredStatus());
  }, []);

  if (status === "done") {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-emerald-700">
        <Check className="w-3.5 h-3.5 shrink-0" />
        Combinado — avisamos se você esquecer o carrinho.
      </div>
    );
  }

  if (status === "dismissed") {
    return null;
  }

  const submit = async () => {
    const parsed = parseContact(value);
    if (!parsed) {
      setError(true);
      return;
    }
    const sessionId = getCartSessionId();
    if (!sessionId) {
      // Sem localStorage (nav. privada) não há como amarrar o contato ao
      // carrinho — melhor esconder a oferta do que prometer um aviso que
      // não vai acontecer.
      persistStatus("dismissed");
      setStatus("dismissed");
      return;
    }
    setError(false);
    setStatus("submitting");
    try {
      const res = await saveCartContact({ data: { sessionId, ...parsed } });
      if (res.ok) {
        persistStatus("done");
        setStatus("done");
      } else {
        setError(true);
        setStatus("expanded");
      }
    } catch {
      setError(true);
      setStatus("expanded");
    }
  };

  if (status === "idle") {
    return (
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <button
          type="button"
          onClick={() => setStatus("expanded")}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Bell className="w-3.5 h-3.5 text-primary shrink-0" />
          Quer que a gente te avise se esquecer o carrinho?
        </button>
        <button
          type="button"
          aria-label="Dispensar aviso de carrinho"
          onClick={() => {
            persistStatus("dismissed");
            setStatus("dismissed");
          }}
          className="text-text-faint hover:text-foreground p-0.5 shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Bell className="w-3.5 h-3.5 text-primary shrink-0" />
        Seu e-mail ou WhatsApp — só pra te avisar, sem spam
      </div>
      <div className="flex gap-1.5">
        <input
          type="text"
          inputMode="email"
          autoComplete="email"
          aria-label="E-mail ou WhatsApp"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="voce@email.com ou (21) 90000-0000"
          className={`flex-1 h-8 rounded-md border px-2 text-xs bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 ${
            error ? "border-destructive" : "border-border"
          }`}
        />
        <Button
          type="button"
          size="sm"
          className="h-8 px-3 text-xs shrink-0"
          disabled={status === "submitting"}
          onClick={() => void submit()}
        >
          Avisar
        </Button>
      </div>
      {error && <p className="text-[10px] text-destructive">E-mail ou WhatsApp inválido.</p>}
    </div>
  );
}
