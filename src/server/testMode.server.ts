// Lado servidor do "modo teste" (ver src/lib/testMode.ts).
import { getCookie } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { TEST_MODE_COOKIE } from "@/lib/testMode";

/** O navegador desta requisição está em modo teste? */
export function isTestModeRequest(): boolean {
  try {
    return getCookie(TEST_MODE_COOKIE) === "1";
  } catch {
    return false;
  }
}

/** Conta da equipe (perfil admin)? Erros contam como "não". */
export async function isAdminUser(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await supabaseAdmin.rpc("is_admin", { _user_id: userId });
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

/** Tráfego interno: modo teste ligado OU usuário administrador. */
export async function isInternalTraffic(userId: string | null | undefined): Promise<boolean> {
  if (isTestModeRequest()) return true;
  return isAdminUser(userId);
}
