// Sessão do carrinho de visitante — emitida e lida SOMENTE pelo servidor, via
// cookie httpOnly. O client nunca escolhe nem lê esse id (nem um XSS consegue),
// então ninguém mexe no carrinho/contato de outro visitante.
import { getCookie, setCookie } from "@tanstack/react-start/server";

export const CART_SESSION_COOKIE = "lm_cart_sid";
const CART_SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 dias
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lê a sessão atual SEM criar uma nova. */
export function peekCartSessionId(): string | null {
  try {
    const current = getCookie(CART_SESSION_COOKIE);
    return current && UUID_RE.test(current) ? current.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Lê a sessão atual ou emite uma nova (cookie httpOnly, 90 dias). */
export function resolveCartSessionId(): string {
  const current = peekCartSessionId();
  if (current) return current;
  const fresh = crypto.randomUUID();
  setCookie(CART_SESSION_COOKIE, fresh, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: CART_SESSION_MAX_AGE,
  });
  return fresh;
}
