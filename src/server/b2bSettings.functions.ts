import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAdminAction } from "@/server/security/auditLog";
import { assertAal2 } from "@/server/security/assertAdmin";

export type B2bSettings = {
  id: string;
  allow_coupon_in_b2b: boolean;
  // outros campos podem existir; expomos só o que a UI precisa
};

async function ensureAdmin(userId: string): Promise<string> {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role, email")
    .eq("id", userId)
    .maybeSingle();
  if (prof?.role !== "admin") throw new Error("Acesso negado");
  return prof?.email ?? "";
}

/** Garante que existe uma linha singleton em b2b_settings e retorna seu id. */
async function getOrCreateSettingsId(): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("b2b_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data: created, error } = await supabaseAdmin
    .from("b2b_settings")
    .insert({})
    .select("id")
    .single();
  if (error || !created) {
    throw new Error("Falha ao inicializar configurações B2B.");
  }
  return created.id as string;
}

export const adminGetB2bSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.userId);
    const id = await getOrCreateSettingsId();
    const { data } = await supabaseAdmin
      .from("b2b_settings")
      .select("id, allow_coupon_in_b2b")
      .eq("id", id)
      .maybeSingle();
    return {
      settings: {
        id,
        allow_coupon_in_b2b: Boolean(
          (data as { allow_coupon_in_b2b?: boolean } | null)?.allow_coupon_in_b2b,
        ),
      } satisfies B2bSettings,
    };
  });

const updateInput = z.object({
  allow_coupon_in_b2b: z.boolean(),
});

export const adminUpdateB2bSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateInput.parse(data))
  .handler(async ({ data, context }) => {
    const adminEmail = await ensureAdmin(context.userId);
    assertAal2(context.claims);
    const id = await getOrCreateSettingsId();
    const { data: before } = await supabaseAdmin
      .from("b2b_settings")
      .select("allow_coupon_in_b2b")
      .eq("id", id)
      .maybeSingle();
    const { error } = await supabaseAdmin
      .from("b2b_settings")
      .update({ allow_coupon_in_b2b: data.allow_coupon_in_b2b })
      .eq("id", id);
    if (error) throw new Error("Falha ao salvar configurações B2B.");

    await logAdminAction({
      adminId: context.userId,
      adminEmail,
      action: "update",
      resourceType: "b2b_settings",
      resourceId: id,
      description: `Cupom em pedidos B2B: ${data.allow_coupon_in_b2b ? "permitido" : "bloqueado"}`,
      before: before ?? null,
      after: { allow_coupon_in_b2b: data.allow_coupon_in_b2b },
    });

    return { ok: true as const };
  });
