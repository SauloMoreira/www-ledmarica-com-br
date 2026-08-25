import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { logAdminAction } from "@/server/security/auditLog";
import { callAiGateway } from "@/server/seo.functions";

const InputSchema = z.object({
  title: z.string().min(1).max(200),
  slug: z.string().max(120).optional().nullable(),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().max(200_000).optional().nullable(),
});

const ResultSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(220),
});

const ANTI_HALLUCINATION = `IMPORTANTE: baseie-se apenas no título, resumo e conteúdo fornecidos da página. NÃO invente políticas, prazos, garantias, números ou dados de contato que não estejam no texto.`;

const SYSTEM_PROMPT = `Você é especialista em SEO para e-commerce brasileiro de material elétrico e iluminação LED da loja Led Maricá (Maricá/RJ).
Gere campos de SEO otimizados em português brasileiro para uma PÁGINA INSTITUCIONAL do site (ex: Sobre nós, Política de troca, Prazo de entrega, Contato, Termos de uso, Política de privacidade).
Regras:
- Título SEO: até 60 caracteres, reflete o propósito real da página e contém "Led Maricá".
- Descrição SEO: até 160 caracteres, clara e convidativa; mencione Maricá/RJ quando fizer sentido para o contexto da página.
- Tom institucional e confiável — não é uma página de produto, evite linguagem de venda agressiva.
- Não use aspas desnecessárias dentro dos campos.
${ANTI_HALLUCINATION}`;

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function buildUserPrompt(data: {
  title: string;
  slug?: string | null;
  excerpt?: string | null;
  content?: string | null;
}): string {
  const bodyText = data.content ? stripHtml(data.content) : "";
  return [
    `Página: ${data.title}`,
    data.slug ? `URL: /institucional/${data.slug}` : null,
    data.excerpt ? `Resumo: ${data.excerpt}` : null,
    bodyText ? `Conteúdo da página:\n${bodyText}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Geração rápida (botão manual no admin) — preenche o formulário sem salvar. */
export const improveInstitutionalPageSeo = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data }) => {
    try {
      const json = await callAiGateway({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(data) },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_page_seo",
              description: "Define os campos de SEO otimizados para a página institucional.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Título SEO até 60 caracteres" },
                  description: {
                    type: "string",
                    description: "Meta description até 160 caracteres",
                  },
                },
                required: ["title", "description"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_page_seo" } },
      });
      const argsRaw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsRaw) return { ok: false as const, error: "Resposta da IA sem dados estruturados" };
      const parsed = ResultSchema.parse(
        typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw,
      );
      return { ok: true as const, ...parsed };
    } catch (e) {
      console.error("improveInstitutionalPageSeo error", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  });

const BoostInputSchema = z.object({ id: z.string().uuid() });

/** SEO Booster automático: gera título/descrição otimizados e grava direto na página. */
export const boostInstitutionalPageSeoAuto = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) => BoostInputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const adminId = (context as { adminUserId: string }).adminUserId;
    try {
      const { data: page, error: pErr } = await supabaseAdmin
        .from("institutional_pages")
        .select("id, title, slug, excerpt, content, seo_title, seo_description")
        .eq("id", data.id)
        .maybeSingle();
      if (pErr || !page) return { ok: false as const, error: "Página não encontrada" };

      const json = await callAiGateway({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: buildUserPrompt({
              title: page.title,
              slug: page.slug,
              excerpt: page.excerpt,
              content: page.content,
            }),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "set_page_seo",
              description: "Define os campos de SEO otimizados para a página institucional.",
              parameters: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Título SEO até 60 caracteres" },
                  description: {
                    type: "string",
                    description: "Meta description até 160 caracteres",
                  },
                },
                required: ["title", "description"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "set_page_seo" } },
      });

      const argsRaw = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!argsRaw) return { ok: false as const, error: "Resposta da IA sem dados estruturados" };
      const parsed = ResultSchema.parse(
        typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw,
      );

      const { error: uErr } = await supabaseAdmin
        .from("institutional_pages")
        .update({ seo_title: parsed.title, seo_description: parsed.description })
        .eq("id", data.id);
      if (uErr) return { ok: false as const, error: uErr.message };

      await logAdminAction({
        adminId,
        action: "update",
        resourceType: "institutional_page",
        resourceId: data.id,
        description: `Turbinou SEO da página "${page.title}" com IA`,
        before: { seo_title: page.seo_title, seo_description: page.seo_description },
        after: { seo_title: parsed.title, seo_description: parsed.description },
      });

      return { ok: true as const, title: parsed.title, description: parsed.description };
    } catch (e) {
      console.error("boostInstitutionalPageSeoAuto error", e);
      return { ok: false as const, error: e instanceof Error ? e.message : "Erro desconhecido" };
    }
  });
