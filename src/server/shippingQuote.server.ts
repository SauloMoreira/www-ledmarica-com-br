/**
 * Engine de cotação de frete — server-only.
 * Usado tanto pelo `calculateShipping` (preview ao cliente) quanto pelo
 * `createOrder` (revalidação autoritativa do valor escolhido).
 *
 * Cotação real via Melhor Envio API v2 quando `MELHOR_ENVIO_TOKEN` está
 * configurado (Lovable Cloud Secrets). Se o token não existir, a chamada
 * falhar ou a API não responder a tempo, cai automaticamente para o STUB
 * determinístico baseado no DDD do CEP — o checkout NUNCA quebra por causa
 * do frete. Quando o fallback é usado, o resultado vem marcado como
 * `estimated: true` para a UI deixar isso claro ao cliente.
 *
 * NUNCA confie no valor de frete vindo do client sem passar por
 * `validateChosenShipping` — inclusive na revalidação, este módulo recalcula
 * o preço no servidor.
 */

export type ShippingService = {
  id: string;
  name: string;
  carrier: string;
  price: number;
  days: number;
};

export type ShippingLineItem = { productId: string; qty: number };

const MELHOR_ENVIO_BASE_URL =
  process.env.MELHOR_ENVIO_ENV === "sandbox"
    ? "https://sandbox.melhorenvio.com.br"
    : "https://www.melhorenvio.com.br";

/** Peso/dimensões mínimos aceitos pela API dos Correios via Melhor Envio. */
const MIN_WEIGHT_KG = 0.1;
const MIN_DIM_CM = 11; // menor caixa aceita nos Correios (envelope/caixa mínima)

// ============================================================
// STUB determinístico (fallback) — baseado no DDD do CEP
// ============================================================
export function quoteShippingServicesStub(args: {
  zipCode: string;
  weightKg?: number;
}): ShippingService[] {
  const zip = (args.zipCode || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(zip)) return [];

  const prefix = parseInt(zip.slice(0, 2), 10);
  let basePac = 22;
  let baseSedex = 38;
  let daysPac = 7;
  let daysSedex = 3;

  if (prefix >= 20 && prefix <= 28) {
    basePac = 14;
    baseSedex = 24;
    daysPac = 3;
    daysSedex = 1;
  } else if (prefix >= 1 && prefix <= 19) {
    basePac = 22;
    baseSedex = 36;
    daysPac = 5;
    daysSedex = 2;
  } else if (prefix >= 80 && prefix <= 99) {
    basePac = 32;
    baseSedex = 52;
    daysPac = 8;
    daysSedex = 4;
  } else if (prefix >= 40 && prefix <= 65) {
    basePac = 38;
    baseSedex = 64;
    daysPac = 10;
    daysSedex = 5;
  }

  const weightFactor = Math.max(1, args.weightKg ?? 1);
  return [
    {
      id: "pac",
      name: "PAC",
      carrier: "Correios",
      price: Number((basePac * weightFactor).toFixed(2)),
      days: daysPac,
    },
    {
      id: "sedex",
      name: "SEDEX",
      carrier: "Correios",
      price: Number((baseSedex * weightFactor).toFixed(2)),
      days: daysSedex,
    },
  ];
}

// ============================================================
// Pacote real do carrinho (peso + dimensões a partir dos produtos)
// ============================================================
async function resolveCartPackage(items: ShippingLineItem[]): Promise<{
  weightKg: number;
  heightCm: number;
  widthCm: number;
  lengthCm: number;
} | null> {
  if (!items.length) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ids = [...new Set(items.map((i) => i.productId))];
  const { data, error } = await supabaseAdmin
    .from("products")
    .select("id, weight_kg, height_cm, width_cm, length_cm")
    .in("id", ids);

  if (error || !data?.length) return null;

  const byId = new Map(data.map((p) => [p.id, p]));
  let weightKg = 0;
  let heightCm = 0;
  let widthCm = 0;
  let lengthSum = 0;

  for (const line of items) {
    const p = byId.get(line.productId);
    if (!p) continue;
    const qty = Math.max(1, line.qty);
    weightKg += Number(p.weight_kg ?? 0.3) * qty;
    heightCm = Math.max(heightCm, Number(p.height_cm ?? MIN_DIM_CM));
    widthCm = Math.max(widthCm, Number(p.width_cm ?? MIN_DIM_CM));
    // Comprimento: itens empilhados somam altura, mas para simplificar e
    // evitar sub-cotação, somamos o comprimento (aproximação conservadora
    // de "caixa única"; refinar para múltiplas caixas é melhoria futura).
    lengthSum += Number(p.length_cm ?? MIN_DIM_CM) * qty;
  }

  return {
    weightKg: Math.max(MIN_WEIGHT_KG, Number(weightKg.toFixed(3))),
    heightCm: Math.max(MIN_DIM_CM, Math.round(heightCm)),
    widthCm: Math.max(MIN_DIM_CM, Math.round(widthCm)),
    lengthCm: Math.max(MIN_DIM_CM, Math.round(Math.min(lengthSum, 105))), // 105cm = limite Correios
  };
}

type MelhorEnvioQuote = {
  id: number | string;
  name: string;
  price?: string | number;
  currency?: string;
  delivery_time?: number;
  company?: { name?: string };
  error?: string;
};

/**
 * Chama a API real do Melhor Envio. Lança exceção em qualquer problema
 * (token ausente, timeout, HTTP não-ok) — o chamador decide o fallback.
 */
async function fetchMelhorEnvioQuotes(args: {
  toZip: string;
  pkg: { weightKg: number; heightCm: number; widthCm: number; lengthCm: number };
  insuranceValue: number;
}): Promise<ShippingService[]> {
  const token = process.env.MELHOR_ENVIO_TOKEN;
  if (!token) throw new Error("MELHOR_ENVIO_TOKEN não configurado");

  const fromZip = (process.env.MELHOR_ENVIO_ORIGIN_ZIP ?? "24913700").replace(/\D/g, "");
  if (!/^\d{8}$/.test(fromZip)) throw new Error("CEP de origem inválido");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(`${MELHOR_ENVIO_BASE_URL}/api/v2/me/shipment/calculate`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Led Marica (contato@ledmarica.com.br)",
      },
      body: JSON.stringify({
        from: { postal_code: fromZip },
        to: { postal_code: args.toZip },
        package: {
          height: args.pkg.heightCm,
          width: args.pkg.widthCm,
          length: args.pkg.lengthCm,
          weight: args.pkg.weightKg,
        },
        options: {
          insurance_value: Math.max(1, Number(args.insuranceValue.toFixed(2))),
          receipt: false,
          own_hand: false,
        },
      }),
    });

    const raw = await resp.text();
    if (!resp.ok) {
      throw new Error(`Melhor Envio HTTP ${resp.status}: ${raw.slice(0, 300)}`);
    }

    const json = JSON.parse(raw) as MelhorEnvioQuote[];
    if (!Array.isArray(json)) throw new Error("Resposta inesperada do Melhor Envio");

    const services: ShippingService[] = json
      .filter((q) => !q.error && q.price != null)
      .map((q) => ({
        id: String(q.id),
        name: q.company?.name ? `${q.name} · ${q.company.name}` : q.name,
        carrier: q.company?.name ?? "Melhor Envio",
        price: Number(q.price),
        days: Number(q.delivery_time ?? 5),
      }))
      .filter((s) => Number.isFinite(s.price) && s.price > 0)
      .sort((a, b) => a.price - b.price);

    if (!services.length) throw new Error("Nenhuma transportadora retornou cotação válida");
    return services;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Cotação principal (assíncrona): tenta Melhor Envio real; em qualquer falha
 * cai para o stub. Sempre retorna, nunca lança.
 */
export async function quoteShippingServices(args: {
  zipCode: string;
  items?: ShippingLineItem[];
  weightKg?: number;
  eligibleSubtotal?: number;
  insuranceValue?: number;
}): Promise<{ services: ShippingService[]; estimated: boolean }> {
  const zip = (args.zipCode || "").replace(/\D/g, "");
  if (!/^\d{8}$/.test(zip)) return { services: [], estimated: true };

  // Resolvido uma única vez e reaproveitado tanto na cotação real quanto no
  // fallback — evita que o preview (calculateShipping, que recebe um
  // weightKg aproximado do client) e a revalidação (createOrder, que chama
  // só com `items`) caiam em pesos diferentes e produzam cotações
  // divergentes (checkout rejeitado com "Valor de frete inválido").
  let resolvedPkg: { weightKg: number; heightCm: number; widthCm: number; lengthCm: number };
  try {
    const pkg = args.items?.length ? await resolveCartPackage(args.items) : null;
    resolvedPkg = pkg ?? {
      weightKg: Math.max(MIN_WEIGHT_KG, args.weightKg ?? 1),
      heightCm: MIN_DIM_CM,
      widthCm: MIN_DIM_CM,
      lengthCm: MIN_DIM_CM,
    };
  } catch (e) {
    console.warn(
      "[frete] Falha ao resolver peso/dimensões do carrinho, usando fallback:",
      e instanceof Error ? e.message : e,
    );
    resolvedPkg = {
      weightKg: Math.max(MIN_WEIGHT_KG, args.weightKg ?? 1),
      heightCm: MIN_DIM_CM,
      widthCm: MIN_DIM_CM,
      lengthCm: MIN_DIM_CM,
    };
  }

  try {
    const services = await fetchMelhorEnvioQuotes({
      toZip: zip,
      pkg: resolvedPkg,
      insuranceValue: args.insuranceValue ?? args.eligibleSubtotal ?? 20,
    });
    return { services, estimated: false };
  } catch (e) {
    console.warn(
      "[frete] Melhor Envio indisponível, usando estimativa local:",
      e instanceof Error ? e.message : e,
    );
    return {
      services: quoteShippingServicesStub({ zipCode: zip, weightKg: resolvedPkg.weightKg }),
      estimated: true,
    };
  }
}

/**
 * Valida que o (carrier, service, cost) enviado pelo cliente corresponde a uma
 * cotação válida server-side. Tolerância de R$ 0,50 (cotações reais de
 * transportadoras variam por instabilidade/arredondamento entre a chamada de
 * preview e a de checkout — tolerância maior que no stub antigo por design).
 *
 * Retorna `{ ok: true, service }` quando válido, ou `{ ok: false, reason }`
 * em caso de divergência. NUNCA confia no valor `cost` do client.
 */
export async function validateChosenShipping(args: {
  zipCode: string;
  items?: ShippingLineItem[];
  weightKg?: number;
  eligibleSubtotal?: number;
  insuranceValue?: number;
  chosen: { carrier?: string | null; service?: string | null; cost: number };
}): Promise<{ ok: true; service: ShippingService } | { ok: false; reason: string }> {
  const { services } = await quoteShippingServices({
    zipCode: args.zipCode,
    items: args.items,
    weightKg: args.weightKg,
    eligibleSubtotal: args.eligibleSubtotal,
    insuranceValue: args.insuranceValue,
  });
  if (!services.length) return { ok: false, reason: "Sem opções de frete para este CEP." };

  const wantedName = (args.chosen.service ?? "").trim().toLowerCase();
  const wantedCarrier = (args.chosen.carrier ?? "").trim().toLowerCase();
  const candidates = services.filter((s) => {
    const matchService =
      !wantedName || s.id.toLowerCase() === wantedName || s.name.toLowerCase() === wantedName;
    const matchCarrier = !wantedCarrier || s.carrier.toLowerCase() === wantedCarrier;
    return matchService && matchCarrier;
  });
  const list = candidates.length ? candidates : services;

  // Match pelo preço com tolerância — bloqueia client tentando enviar 0 ou
  // um valor arbitrário.
  const match = list.find((s) => Math.abs(s.price - Number(args.chosen.cost ?? -1)) <= 0.5);
  if (!match) {
    return {
      ok: false,
      reason: `Valor de frete inválido para a opção selecionada. Recotize o frete e tente novamente.`,
    };
  }
  return { ok: true, service: match };
}
