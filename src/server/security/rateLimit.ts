// Server-only rate limit helper. Uses Postgres (rate_limit_events + check_rate_limit RPC).
// NÃO importar em client-side.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequest } from "@tanstack/react-start/server";

export type RateLimitAction =
  | "login"
  | "signup"
  | "password_reset"
  | "contact"
  | "chat"
  | "chat_history"
  | "coupon"
  | "webhook_invalid"
  | "admin_action"
  | "lead_handoff"
  | "identify"
  | "login_code";

export interface RateLimitConfig {
  maxAttempts: number;
  windowSeconds: number;
}

export const DEFAULT_LIMITS: Record<RateLimitAction, RateLimitConfig> = {
  login: { maxAttempts: 8, windowSeconds: 15 * 60 },
  signup: { maxAttempts: 5, windowSeconds: 60 * 60 },
  password_reset: { maxAttempts: 5, windowSeconds: 60 * 60 },
  contact: { maxAttempts: 5, windowSeconds: 10 * 60 },
  chat: { maxAttempts: 30, windowSeconds: 5 * 60 },
  chat_history: { maxAttempts: 30, windowSeconds: 5 * 60 },
  coupon: { maxAttempts: 20, windowSeconds: 10 * 60 },
  webhook_invalid: { maxAttempts: 50, windowSeconds: 60 * 60 },
  admin_action: { maxAttempts: 200, windowSeconds: 60 * 60 },
  lead_handoff: { maxAttempts: 5, windowSeconds: 10 * 60 },
  identify: { maxAttempts: 8, windowSeconds: 10 * 60 },
  login_code: { maxAttempts: 5, windowSeconds: 10 * 60 },
};

export interface RateLimitResult {
  allowed: boolean;
  currentCount: number;
  retryAfterSeconds: number;
}

/**
 * Tenta consumir 1 ponto de rate limit. Falha-aberto (allowed=true) se o RPC der erro,
 * para não derrubar o site se o banco estiver indisponível — mas loga o problema.
 */
export async function checkRateLimit(
  identifier: string,
  action: RateLimitAction,
  config?: Partial<RateLimitConfig>,
): Promise<RateLimitResult> {
  const cfg = { ...DEFAULT_LIMITS[action], ...config };
  const ident = (identifier ?? "").trim().slice(0, 200);
  if (!ident) {
    return { allowed: false, currentCount: 0, retryAfterSeconds: cfg.windowSeconds };
  }
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _identifier: ident,
      _action: action,
      _max_attempts: cfg.maxAttempts,
      _window_seconds: cfg.windowSeconds,
    });
    if (error || !data || !Array.isArray(data) || data.length === 0) {
      console.error("[rateLimit] rpc error", error);
      return { allowed: true, currentCount: 0, retryAfterSeconds: 0 };
    }
    const row = data[0] as { allowed: boolean; current_count: number; retry_after_seconds: number };
    return {
      allowed: row.allowed,
      currentCount: row.current_count ?? 0,
      retryAfterSeconds: row.retry_after_seconds ?? 0,
    };
  } catch (e) {
    console.error("[rateLimit] exception", e);
    return { allowed: true, currentCount: 0, retryAfterSeconds: 0 };
  }
}

/**
 * Lança um Response 429 com Retry-After se exceder o limite.
 */
export async function enforceRateLimit(
  identifier: string,
  action: RateLimitAction,
  config?: Partial<RateLimitConfig>,
): Promise<void> {
  const r = await checkRateLimit(identifier, action, config);
  if (!r.allowed) {
    void logSecurityEvent({
      type: "rate_limit_exceeded",
      severity: "warn",
      identifier,
      message: `Rate limit excedido em ${action}`,
      metadata: { action, currentCount: r.currentCount, retryAfterSeconds: r.retryAfterSeconds },
    });
    throw new Response(
      JSON.stringify({
        error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
        retryAfter: r.retryAfterSeconds,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(r.retryAfterSeconds),
        },
      },
    );
  }
}

/**
 * Extrai um identificador de IP do request atual (server-side only).
 * Usa X-Forwarded-For (primeiro hop) ou CF-Connecting-IP.
 */
export function getClientIdentifier(): string {
  try {
    const req = getRequest();
    const cf = req.headers.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim();
    return "unknown";
  } catch {
    return "unknown";
  }
}

// =====================================================================
// Security event logging
// =====================================================================
export interface SecurityEventInput {
  type:
    | "csp_violation"
    | "auth_failure"
    | "webhook_invalid_signature"
    | "rate_limit_exceeded"
    | "admin_action"
    | "ssrf_blocked"
    | "forbidden_access"
    | "webhook_processed";
  severity?: "info" | "warn" | "error";
  identifier?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    await supabaseAdmin.rpc("log_security_event", {
      _type: input.type,
      _severity: input.severity ?? "info",
      _identifier: input.identifier ?? "",
      _message: input.message ?? "",
      _metadata: (input.metadata ?? {}) as never,
    });
  } catch (e) {
    console.error("[security] log error", e);
  }
}
