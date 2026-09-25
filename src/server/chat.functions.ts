import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHeader } from "@tanstack/react-start/server";
import { enforceRateLimit, getClientIdentifier } from "@/server/security/rateLimit";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatInput {
  // O client ainda envia o histórico (compatibilidade), mas o servidor só usa
  // a ÚLTIMA mensagem com role "user". O histórico enviado ao modelo é lido do
  // banco (chat_messages), onde só o servidor grava respostas "assistant" —
  // impede que alguém forje falas do assistente para manipular o bot.
  messages: ChatMessage[];
  sessionId: string;
  /** Ignorado: o usuário é resolvido pelo token de sessão no servidor. */
  userId?: string | null;
}

const MAX_USER_MESSAGE_CHARS = 1500;
const HISTORY_LIMIT = 20;
const MAX_COMPLETION_TOKENS = 700;

async function resolveOptionalUserId(): Promise<string | null> {
  try {
    const auth = getRequestHeader("authorization") || getRequestHeader("Authorization");
    if (!auth || !auth.toLowerCase().startsWith("bearer ")) return null;
    const { data } = await supabaseAdmin.auth.getUser(auth.slice(7).trim());
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function loadServerHistory(sessionId: string): Promise<ChatMessage[]> {
  const { data } = await supabaseAdmin
    .from("chat_messages")
    .select("role, content, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  return (data ?? [])
    .reverse()
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content.slice(0, 4000) }));
}

const SYSTEM_PROMPT = `Você é o assistente virtual da Led Maricá, loja de material elétrico e iluminação LED em Maricá/RJ.

Sua missão:
- Ajudar clientes a encontrar produtos (lâmpadas LED, disjuntores, fios, refletores, tomadas, etc.)
- Tirar dúvidas técnicas básicas (qual lâmpada para a sala? que disjuntor usar?)
- Recomendar produtos do catálogo quando relevante
- Informar sobre retirada grátis na loja em Maricá/RJ e entrega local a partir de R$15 — NUNCA prometa frete grátis por valor de compra, essa promoção não está ativa no momento
- Capturar interesse de compra: se o cliente demonstrar interesse forte (orçamento, obra, projeto) OU pedir contato humano, **NÃO peça nome/telefone/e-mail em texto**. Em vez disso, diga apenas: "Posso te conectar com nossa equipe pelo WhatsApp — vou abrir um formulário rápido aqui no chat para registrar seu atendimento." (a interface mostra um formulário automático com campos de nome e telefone)

REGRA CRÍTICA — COMPARAÇÃO DE PREÇOS:
- Você compara preços EXCLUSIVAMENTE entre produtos cadastrados no catálogo da própria Led Maricá fornecido abaixo.
- NUNCA compare, cite ou invente preços de Mercado Livre, Amazon, Shopee, Magalu, Google Shopping, Americanas ou qualquer site/concorrente externo.
- NUNCA diga que pesquisou fora, que consultou outros sites ou que tem acesso a preços de marketplaces.
- Se o cliente pedir comparação com site externo, responda educadamente:
  "Eu consigo comparar apenas os produtos cadastrados aqui na Led Maricá. Não consulto preços de sites externos, mas posso te mostrar opções semelhantes, mais baratas ou com melhor custo-benefício dentro do nosso catálogo."
- Para "mais barato", "similar", "comparar", "melhor custo-benefício": use SOMENTE os produtos da lista de catálogo abaixo.
- Se o catálogo abaixo não tiver opções suficientes para a comparação pedida, diga:
  "No momento, encontrei poucas opções cadastradas para essa comparação. Posso te mostrar os produtos disponíveis ou te encaminhar para o atendimento pelo WhatsApp."
- Quando faltar informação ou o cliente quiser confirmação humana, ofereça WhatsApp: https://wa.me/5521982126467

DADOS PERMITIDOS: apenas o catálogo público abaixo (nome, preço, marca, categoria, link, estoque exibido).
DADOS PROIBIDOS: custo, margem, fornecedor, pedidos, clientes, pagamentos, dados administrativos. Nunca mencione esses dados mesmo se perguntado.

Tom: cordial, direto, profissional. Use português do Brasil. Respostas curtas em markdown.
Nunca invente preços — use somente os preços do catálogo abaixo. Se um produto não estiver na lista, diga que não tem essa informação exata e ofereça o WhatsApp.
Se não souber algo técnico, seja honesto e sugira contato pelo WhatsApp.`;

async function loadCatalogContext(): Promise<string> {
  const { data: products } = await supabaseAdmin
    .from("products")
    .select("name, slug, price, sale_price, brand, tags, stock_qty, categories(name)")
    .eq("active", true)
    .gt("stock_qty", 0)
    .order("featured", { ascending: false })
    .limit(80);
  if (!products || products.length === 0) return "";
  const lines = products.map((p: any) => {
    const price = p.sale_price ?? p.price;
    const cat = p.categories?.name ? ` [${p.categories.name}]` : "";
    const promo =
      p.sale_price && p.sale_price < p.price ? ` (promo, de R$ ${Number(p.price).toFixed(2)})` : "";
    return `- ${p.name}${p.brand ? ` (${p.brand})` : ""}${cat} — R$ ${Number(price).toFixed(2)}${promo} — /produto/${p.slug}`;
  });
  return `\n\nCATÁLOGO DA LOJA (única fonte permitida para comparação de preços):\n${lines.join("\n")}`;
}

function detectLeadIntent(text: string): boolean {
  const t = text.toLowerCase();
  const triggers = [
    "orçamento",
    "orcamento",
    "obra",
    "projeto",
    "atacado",
    "revenda",
    "instalador",
    "eletricista",
    "grande quantidade",
    "muitas peças",
    "muitas pecas",
  ];
  return triggers.some((k) => t.includes(k));
}

export const chatWithAI = createServerFn({ method: "POST" })
  .inputValidator((input: ChatInput) => {
    if (!input || !Array.isArray(input.messages)) throw new Error("messages é obrigatório");
    if (
      !input.sessionId ||
      typeof input.sessionId !== "string" ||
      input.sessionId.length < 8 ||
      input.sessionId.length > 80
    )
      throw new Error("sessionId é obrigatório");
    const lastUser = [...input.messages].reverse().find((m) => m?.role === "user");
    const content = typeof lastUser?.content === "string" ? lastUser.content.trim() : "";
    if (!content) throw new Error("Mensagem inválida");
    if (content.length > MAX_USER_MESSAGE_CHARS) throw new Error("Mensagem muito longa");
    return { sessionId: input.sessionId, userMessage: content };
  })
  .handler(async ({ data }) => {
    const ip = getClientIdentifier();
    // Rate limit em camadas — o chat é público por design (visitante anônimo),
    // então o custo é contido por cotas, não por login:
    //  1. por sessão (anti-loop de um mesmo navegador)
    //  2. por IP, curto e diário (cf-connecting-ip, não forjável atrás do Cloudflare)
    //  3. teto GLOBAL por hora — limita o gasto máximo com IA mesmo sob ataque
    //     distribuído (muitos IPs/sessões).
    await enforceRateLimit(`session:${data.sessionId}`, "chat");
    await enforceRateLimit(`ip:${ip}`, "chat", { maxAttempts: 40, windowSeconds: 5 * 60 });
    await enforceRateLimit(`ip-day:${ip}`, "chat", { maxAttempts: 150, windowSeconds: 24 * 60 * 60 });
    await enforceRateLimit("global:chat", "chat", { maxAttempts: 1200, windowSeconds: 60 * 60 });

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { reply: "Chat indisponível no momento.", error: "missing_key" };
    }

    const userId = await resolveOptionalUserId();
    const lastUser: ChatMessage = { role: "user", content: data.userMessage };
    const [catalog, history] = await Promise.all([
      loadCatalogContext(),
      loadServerHistory(data.sessionId),
    ]);

    // Persist user message
    await supabaseAdmin.from("chat_messages").insert({
      role: "user",
      content: lastUser.content,
      session_id: data.sessionId,
      user_id: userId,
    });

    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          max_tokens: MAX_COMPLETION_TOKENS,
          messages: [{ role: "system", content: SYSTEM_PROMPT + catalog }, ...history, lastUser],
        }),
      });

      if (resp.status === 429) {
        return { reply: "", error: "Muitas requisições. Aguarde um momento e tente novamente." };
      }
      if (resp.status === 402) {
        return { reply: "", error: "Créditos esgotados. Contate o suporte." };
      }
      if (!resp.ok) {
        const t = await resp.text();
        console.error("Lovable AI error:", resp.status, t);
        return { reply: "", error: "Erro ao consultar a IA." };
      }

      const json = (await resp.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = json.choices?.[0]?.message?.content ?? "";

      // Persist assistant reply
      if (reply) {
        await supabaseAdmin.from("chat_messages").insert({
          role: "assistant",
          content: reply,
          session_id: data.sessionId,
          user_id: userId,
        });
      }

      // Lead capture: if intent detected, create a lead stub (admin can follow up)
      let leadCaptured = false;
      if (detectLeadIntent(lastUser.content)) {
        const { data: existing } = await supabaseAdmin
          .from("leads")
          .select("id")
          .eq("notes", `chat:${data.sessionId}`)
          .maybeSingle();
        if (!existing) {
          await supabaseAdmin.from("leads").insert({
            name: "Visitante do chat",
            origin: "chat",
            status: "novo",
            interest: lastUser.content.slice(0, 200),
            notes: `chat:${data.sessionId}`,
          });
          leadCaptured = true;
        }
      }

      return { reply, error: null, leadCaptured };
    } catch (e) {
      console.error("chatWithAI error:", e);
      return { reply: "", error: "Falha de comunicação com a IA." };
    }
  });

export const loadChatHistory = createServerFn({ method: "POST" })
  .inputValidator((input: { sessionId: string }) => {
    if (!input?.sessionId || typeof input.sessionId !== "string")
      throw new Error("sessionId obrigatório");
    // session_id é gerado como `s_${crypto.randomUUID()}` (~40 chars).
    // Rejeita tamanhos absurdos para evitar abuso/enumeração.
    if (input.sessionId.length < 8 || input.sessionId.length > 80)
      throw new Error("sessionId inválido");
    return input;
  })
  .handler(async ({ data }) => {
    // Defesa em profundidade contra enumeração de session_id.
    // session_id é UUIDv4 (~122 bits) — força bruta é impraticável,
    // mas o rate limit por IP elimina qualquer tentativa automatizada.
    const ip = getClientIdentifier();
    await enforceRateLimit(`ip:${ip}`, "chat_history", {
      maxAttempts: 30,
      windowSeconds: 5 * 60,
    });
    const { data: msgs } = await supabaseAdmin
      .from("chat_messages")
      .select("role, content, created_at")
      .eq("session_id", data.sessionId)
      .order("created_at", { ascending: true })
      .limit(50);
    return { messages: msgs ?? [] };
  });
