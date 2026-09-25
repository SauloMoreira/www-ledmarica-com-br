// Sincronização best-effort do carrinho com `cart_items` — server-only.
// Existe para alimentar `detect_abandoned_carts` (job hourly) e permitir
// recuperação de carrinho abandonado por e-mail. NUNCA deve quebrar a
// experiência de compra: qualquer falha aqui é engolida e logada.
import { createServerFn } from "@tanstack/react-start";
import { getCookie, getRequest, setCookie } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function resolveOptionalUserId(): Promise<string | null> {
  try {
    const request = getRequest();
    const authHeader = request?.headers?.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;
    const token = authHeader.slice(7).trim();
    if (!token) return null;
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user?.id) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Sessão do carrinho de visitante: emitida e lida SOMENTE pelo servidor, via
// cookie httpOnly. Antes o id vinha do client (localStorage) e era aceito como
// estava — quem soubesse/forjasse o id de outro visitante podia apagar ou
// trocar o carrinho dele (e o contato de recuperação). Agora o client não
// escolhe nem lê o id: JS (inclusive um XSS) não tem acesso ao cookie, e um
// sessionId enviado no body é ignorado.
// ---------------------------------------------------------------------------
const CART_SESSION_COOKIE = "lm_cart_sid";
const CART_SESSION_MAX_AGE = 60 * 60 * 24 * 90; // 90 dias
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveCartSessionId(): string {
  const current = getCookie(CART_SESSION_COOKIE);
  if (current && UUID_RE.test(current)) return current.toLowerCase();
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

const SyncInput = z.object({
  // Mantido opcional só por compatibilidade com clients antigos em cache;
  // o valor é IGNORADO — a sessão vem do cookie httpOnly.
  sessionId: z.string().max(80).optional(),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(9999) }))
    .max(200),
});

const ContactInput = z
  .object({
    sessionId: z.string().max(80).optional(), // ignorado (ver resolveCartSessionId)
    name: z.string().trim().max(120).optional(),
    email: z.string().trim().email().max(180).optional(),
    phone: z.string().trim().min(10).max(13).optional(),
  })
  .refine((v) => Boolean(v.email || v.phone), {
    message: "email ou phone é obrigatório",
  });

/**
 * Substitui o snapshot de `cart_items` do usuário/sessão pelo estado atual
 * do carrinho no client. "Replace" (delete + insert) em vez de upsert
 * incremental: mais simples, idempotente, e sem risco de sobra de linhas
 * quando um item é removido do carrinho.
 */
export const syncCart = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SyncInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const userId = await resolveOptionalUserId();
      const filterCol = userId ? "user_id" : "session_id";
      const sessionId = userId ? null : resolveCartSessionId();
      const filterVal = userId ?? sessionId!;

      await supabaseAdmin.from("cart_items").delete().eq(filterCol, filterVal);

      if (data.items.length > 0) {
        const rows = data.items.map((i) => ({
          user_id: userId,
          session_id: sessionId,
          product_id: i.productId,
          qty: i.qty,
        }));
        const { error } = await supabaseAdmin.from("cart_items").insert(rows);
        if (error) console.warn("[cart] syncCart insert error", error.message);
      }
      return { ok: true as const };
    } catch (e) {
      console.warn("[cart] syncCart exception", e instanceof Error ? e.message : e);
      return { ok: false as const };
    }
  });

/**
 * Captura opcional de e-mail/WhatsApp oferecida no carrinho, ANTES do
 * checkout — é o que dá a `detect_abandoned_carts` alguém pra avisar quando
 * o cliente some antes de chegar na etapa de dados do pedido. Guardado em
 * `guest_cart_contacts`, uma tabela sem nenhuma policy pública (RLS
 * habilitada, zero policies): só este server function, com a service role,
 * lê ou escreve nela — o client nunca consegue listar contatos de terceiros.
 */
export const saveCartContact = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ContactInput.parse(input))
  .handler(async ({ data }) => {
    try {
      const sessionId = resolveCartSessionId();
      const { error } = await supabaseAdmin.from("guest_cart_contacts").upsert(
        {
          session_id: sessionId,
          name: data.name || null,
          email: data.email || null,
          phone: data.phone || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "session_id" },
      );
      if (error) {
        console.warn("[cart] saveCartContact upsert error", error.message);
        return { ok: false as const };
      }
      return { ok: true as const };
    } catch (e) {
      console.warn("[cart] saveCartContact exception", e instanceof Error ? e.message : e);
      return { ok: false as const };
    }
  });
