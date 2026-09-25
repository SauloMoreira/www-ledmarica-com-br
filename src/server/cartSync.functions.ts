// Sincronização best-effort do carrinho com `cart_items` — server-only.
// Existe para alimentar `detect_abandoned_carts` (job hourly) e permitir
// recuperação de carrinho abandonado por e-mail. NUNCA deve quebrar a
// experiência de compra: qualquer falha aqui é engolida e logada.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { peekCartSessionId, resolveCartSessionId } from "./cartSession.server";

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

/**
 * O carrinho abandonado registrado enquanto a pessoa era visitante passa a ser
 * da conta dela: ganha user_id e nome/e-mail/WhatsApp do perfil, e o lead do
 * contato do carrinho (se houver) fica ligado ao usuário. Só toca registros
 * ainda sem dono e não convertidos — nunca reatribui carrinho de outra conta.
 */
async function linkGuestCartToUser(guestSession: string, userId: string): Promise<void> {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("name, email, phone")
      .eq("id", userId)
      .maybeSingle();

    const patch: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
    if (profile?.email?.trim()) patch.customer_email = profile.email.trim();
    if (profile?.name?.trim()) patch.customer_name = profile.name.trim();
    if (profile?.phone?.trim()) patch.customer_phone = profile.phone.trim();

    const { error } = await supabaseAdmin
      .from("abandoned_carts")
      .update(patch as never)
      .eq("session_id", guestSession)
      .is("user_id", null)
      .is("converted_order_id", null);
    if (error) console.warn("[cart] link abandoned cart error", error.message);

    const { data: contact } = await supabaseAdmin
      .from("guest_cart_contacts")
      .select("lead_id")
      .eq("session_id", guestSession)
      .maybeSingle();
    const leadId = (contact as { lead_id: string | null } | null)?.lead_id;
    if (leadId) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("metadata")
        .eq("id", leadId)
        .maybeSingle();
      const meta = ((lead as { metadata: Record<string, unknown> | null } | null)?.metadata ?? {}) as Record<
        string,
        unknown
      >;
      if (!meta.user_id) {
        await supabaseAdmin
          .from("leads")
          .update({ metadata: { ...meta, user_id: userId } } as never)
          .eq("id", leadId);
      }
    }
  } catch (e) {
    console.warn("[cart] linkGuestCartToUser exception", e instanceof Error ? e.message : e);
  }
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

      // Visitante que acabou de entrar na conta: o carrinho passa a ser do
      // usuário — remove a cópia antiga da sessão anônima para não gerar um
      // segundo "carrinho abandonado" do mesmo cliente.
      if (userId) {
        const guestSession = peekCartSessionId();
        if (guestSession) {
          await linkGuestCartToUser(guestSession, userId);
          await supabaseAdmin.from("cart_items").delete().eq("session_id", guestSession);
        }
      }

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
