// Sincronização best-effort do carrinho com `cart_items` — server-only.
// Existe para alimentar `detect_abandoned_carts` (job hourly) e permitir
// recuperação de carrinho abandonado por e-mail. NUNCA deve quebrar a
// experiência de compra: qualquer falha aqui é engolida e logada.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
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

const SyncInput = z.object({
  sessionId: z.string().min(8).max(80),
  items: z
    .array(z.object({ productId: z.string().uuid(), qty: z.number().int().min(1).max(9999) }))
    .max(200),
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
      const filterVal = userId ?? data.sessionId;

      await supabaseAdmin.from("cart_items").delete().eq(filterCol, filterVal);

      if (data.items.length > 0) {
        const rows = data.items.map((i) => ({
          user_id: userId,
          session_id: userId ? null : data.sessionId,
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
