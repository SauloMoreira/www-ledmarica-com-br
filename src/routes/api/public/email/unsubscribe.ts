// API pública de descadastro de e-mails promocionais.
// GET  ?token=...  -> valida o token (não altera nada)
// POST { token }   -> confirma o opt-out
import { createFileRoute } from "@tanstack/react-router";
import {
  confirmUnsubscribe,
  lookupUnsubscribeToken,
} from "@/server/email/unsubscribe";

const JSON_HEADERS = { "Content-Type": "application/json", "Cache-Control": "no-store" };

export const Route = createFileRoute("/api/public/email/unsubscribe")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token") ?? "";
        const info = await lookupUnsubscribeToken(token);
        return new Response(JSON.stringify(info), { status: 200, headers: JSON_HEADERS });
      },
      POST: async ({ request }) => {
        let token = "";
        try {
          const body = (await request.json()) as { token?: unknown };
          token = typeof body?.token === "string" ? body.token : "";
        } catch {
          token = "";
        }
        const info = await lookupUnsubscribeToken(token);
        if (!info.found) {
          return new Response(JSON.stringify({ ok: false, error: "invalid_token" }), {
            status: 400,
            headers: JSON_HEADERS,
          });
        }
        const r = await confirmUnsubscribe(token);
        return new Response(JSON.stringify({ ok: true, alreadyUnsubscribed: !r.ok && info.alreadyUnsubscribed }), {
          status: 200,
          headers: JSON_HEADERS,
        });
      },
    },
  },
});
