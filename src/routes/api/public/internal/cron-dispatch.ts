// Rota interna acionada por pg_cron (via pg_net). Protegida por segredo compartilhado.
// Nunca expõe dado sensível; tentativas inválidas são logadas e limitadas por rate limit.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runPaymentReminders } from "@/server/email/paymentReminders";
import { runAbandonedCartRecovery } from "@/server/email/abandonedCartEmails";
import {
  checkRateLimit,
  getClientIdentifier,
  logSecurityEvent,
} from "@/server/security/rateLimit";

const JOBS = ["payment_reminders", "abandoned_cart_recovery"] as const;
type Job = (typeof JOBS)[number];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Segredo aceito: variável de ambiente OU o valor guardado em internal_config. */
async function isValidSecret(provided: string): Promise<boolean> {
  if (!provided) return false;
  const env = process.env.INTERNAL_CRON_SECRET;
  if (env && timingSafeEqual(provided, env)) return true;
  const { data } = await supabaseAdmin
    .from("internal_config")
    .select("value")
    .eq("key", "cron_secret")
    .maybeSingle();
  return Boolean(data?.value) && timingSafeEqual(provided, String(data!.value));
}

export const Route = createFileRoute("/api/public/internal/cron-dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const identifier = getClientIdentifier();
        const provided = request.headers.get("x-internal-secret") ?? "";

        if (!(await isValidSecret(provided))) {
          const rl = await checkRateLimit(identifier, "webhook_invalid");
          void logSecurityEvent({
            type: "forbidden_access",
            severity: "warn",
            identifier,
            message: "Tentativa inválida em /api/public/internal/cron-dispatch",
            metadata: { rateLimited: !rl.allowed },
          });
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        let job: string | null = null;
        try {
          const body = (await request.json()) as { job?: unknown };
          job = typeof body?.job === "string" ? body.job : null;
        } catch {
          job = null;
        }

        if (!job || !JOBS.includes(job as Job)) {
          return new Response(JSON.stringify({ error: "invalid_job" }), {
            status: 400,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        const startedAt = Date.now();
        const result =
          job === "payment_reminders"
            ? await runPaymentReminders()
            : await runAbandonedCartRecovery();

        console.info("[cron] job executado", { job, durationMs: Date.now() - startedAt, result });

        return new Response(JSON.stringify({ ok: true, job, result }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
        });
      },
    },
  },
});
