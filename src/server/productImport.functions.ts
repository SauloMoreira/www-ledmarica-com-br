import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as XLSX from "xlsx";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { logAdminAction } from "@/server/security/auditLog";
import {
  CODE_COLUMN_KEYS,
  countRows,
  isScientificNotation,
  nullIfEmpty,
  parseAction,
  parseBoolPtBr,
  parseInteger,
  parsePrice,
  parseTags,
  safeCell,
  sanitizeTechValue,
  slugify,
  TECH_FIELDS,
  TECH_FIELD_KEYS,
  validateCestFormat,
  validateCfopFormat,
  validateNcmFormat,
  validateTechValue,
  type ImportConfidence,
  type ImportRow,
  type ImportStatus,
} from "@/lib/productImport";


/**
 * Remove o sufixo de unidade do valor quando o usuário (ou IA) digita
 * "65W" e a coluna de unidade já é "W". Mantém o número e descarta a unidade
 * para evitar duplicação visual ("65W W") na loja.
 */
function stripUnitSuffix(value: string, unit?: string): string {
  const v = (value ?? "").trim();
  if (!v || !unit) return v;
  const u = unit.trim();
  if (!u) return v;
  const re = new RegExp(`\\s*${u.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}\\s*$`, "i");
  const stripped = v.replace(re, "").trim();
  return stripped || v;
}


// ===================== Constantes =====================

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_ROWS = 500; // limite por importação
const SHEET_NAME_CANDIDATES = [
  "PRODUTOS_MÍNIMO",
  "PRODUTOS_MINIMO",
  "PRODUTOS",
  "Produtos",
];

// Mapeamento tolerante de cabeçalhos da planilha
const HEADER_MAP: Record<string, keyof RawRow> = {
  acao: "action",
  ação: "action",
  action: "action",
  sku: "sku",
  nome_produto: "nome",
  nome: "nome",
  produto: "nome",
  categoria: "categoria",
  preco_custo: "custo",
  preço_custo: "custo",
  custo: "custo",
  custo_unitario: "custo",
  custo_unitário: "custo",
  preco_venda: "preco",
  preço_venda: "preco",
  preco: "preco",
  preço: "preco",
  estoque_inicial: "estoque",
  estoque: "estoque",
  ativo: "ativo",
  revisado_humano: "revisado",
  revisado: "revisado",
  aprovado_importar: "aprovado",
  aprovado: "aprovado",
  observacoes_usuario: "obs_user",
  observações_usuario: "obs_user",
  observacoes: "obs_user",
  observações: "obs_user",
  // v1.0.4 — colunas-código (todas viram texto puro)
  ean_gtin: "gtin_ean",
  gtin_ean: "gtin_ean",
  ean: "gtin_ean",
  gtin: "gtin_ean",
  codigo_barras: "codigo_barras",
  código_de_barras: "codigo_barras",
  codigo_de_barras: "codigo_barras",
  ncm: "ncm",
  cest: "cest",
  cfop_default: "cfop_default",
  cfop: "cfop_default",
};

type RawRow = {
  rowIndex: number;
  action: unknown;
  sku: unknown;
  nome: unknown;
  categoria: unknown;
  custo: unknown;
  preco: unknown;
  estoque: unknown;
  ativo: unknown;
  revisado: unknown;
  aprovado: unknown;
  obs_user: unknown;
  gtin_ean: unknown;
  codigo_barras: unknown;
  ncm: unknown;
  cest: unknown;
  cfop_default: unknown;
};

// ===================== Schemas =====================

const ImportRowSchema = z.object({
  rowIndex: z.number(),
  action: z.enum(["criar", "atualizar", "ignorar", ""]),
  sku: z.string(),
  nome_produto: z.string(),
  categoria: z.string(),
  preco_custo: z.number().nullable(),
  preco_venda: z.number().nullable(),
  estoque_inicial: z.number().nullable(),
  ativo: z.boolean(),
  revisado_humano: z.boolean(),
  aprovado_importar: z.boolean(),
  observacoes_usuario: z.string(),
  gtin_ean: z.string().default(""),
  codigo_barras: z.string().default(""),
  ncm: z.string().default(""),
  cest: z.string().default(""),
  cfop_default: z.string().default(""),
  slug_sugerido: z.string().nullable(),
  descricao_curta: z.string().nullable(),
  descricao_longa: z.string().nullable(),
  tags: z.array(z.string()),
  titulo_seo: z.string().nullable(),
  meta_description: z.string().nullable(),
  observacoes_ia: z.string().nullable(),
  nivel_confianca_ia: z.enum(["alta", "media", "baixa"]).nullable(),
  status: z.enum(["invalid", "needs_review", "ready", "ignored"]),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  matched_product_id: z.string().nullable(),
  matched_category_id: z.string().nullable(),
  tech: z.record(z.string(), z.string()).default({}),
}) satisfies z.ZodType<ImportRow>;

const RowsInput = z.object({
  rows: z.array(ImportRowSchema).max(MAX_ROWS),
});


// ===================== Util =====================

function emptyRow(rowIndex: number): ImportRow {
  return {
    rowIndex,
    action: "",
    sku: "",
    nome_produto: "",
    categoria: "",
    preco_custo: null,
    preco_venda: null,
    estoque_inicial: null,
    ativo: false,
    revisado_humano: false,
    aprovado_importar: false,
    observacoes_usuario: "",
    gtin_ean: "",
    codigo_barras: "",
    ncm: "",
    cest: "",
    cfop_default: "",
    slug_sugerido: null,
    descricao_curta: null,
    descricao_longa: null,
    tags: [],
    titulo_seo: null,
    meta_description: null,
    observacoes_ia: null,
    nivel_confianca_ia: null,
    status: "needs_review",
    errors: [],
    warnings: [],
    matched_product_id: null,
    matched_category_id: null,
    tech: {},
  };
}


function normalizeHeader(h: string): string {
  return h
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_");
}

// ===================== 1. parseImportSheet =====================

export const parseImportSheet = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) =>
    z
      .object({
        fileBase64: z.string().min(1).max(Math.ceil((MAX_FILE_BYTES * 4) / 3) + 100),
        fileName: z.string().max(255),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    // Decodifica base64
    const cleaned = data.fileBase64.replace(/^data:[^;]+;base64,/, "");
    let bytes: Uint8Array;
    try {
      const bin = Buffer.from(cleaned, "base64");
      if (bin.byteLength > MAX_FILE_BYTES) {
        return { ok: false as const, error: "Arquivo muito grande (máx. 5 MB)." };
      }
      bytes = new Uint8Array(bin);
    } catch {
      return { ok: false as const, error: "Não foi possível decodificar o arquivo." };
    }

    // Magic bytes ZIP (xlsx é zip): 50 4B 03 04
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return {
        ok: false as const,
        error: "Formato inválido. Envie um arquivo .xlsx válido.",
      };
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(bytes, { type: "array" });
    } catch (e) {
      console.error("xlsx parse error", e);
      return { ok: false as const, error: "Não foi possível ler a planilha." };
    }

    // Localiza a aba
    const sheetName =
      SHEET_NAME_CANDIDATES.find((n) => workbook.SheetNames.includes(n)) ||
      workbook.SheetNames[0];
    if (!sheetName) {
      return { ok: false as const, error: "A planilha não contém abas." };
    }
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
      blankrows: false,
    });

    // Verifica cabeçalhos essenciais
    const firstRow = json[0] ?? {};
    const normHeaders = Object.keys(firstRow).map(normalizeHeader);
    const hasSku = normHeaders.some((h) => HEADER_MAP[h] === "sku");
    const hasNome = normHeaders.some((h) => HEADER_MAP[h] === "nome");
    if (!hasSku || !hasNome) {
      return {
        ok: false as const,
        error:
          "Planilha sem colunas mínimas. Cabeçalho deve conter pelo menos 'sku' e 'nome_produto'.",
      };
    }

    // v1.0.4 — Detector de células numéricas em COLUNAS-CÓDIGO
    // Constrói map: colunaLetra -> normHeader, e marca por linha quais
    // cabeçalhos críticos vieram como tipo 'n' (numérico) no XLSX.
    const codeCellErrorsByRow = new Map<number, string[]>();
    try {
      const ref = sheet["!ref"];
      if (ref) {
        const range = XLSX.utils.decode_range(ref);
        const colToHeader = new Map<number, string>();
        for (let c = range.s.c; c <= range.e.c; c++) {
          const addr = XLSX.utils.encode_cell({ r: range.s.r, c });
          const raw = sheet[addr]?.v;
          if (raw == null) continue;
          const norm = normalizeHeader(String(raw));
          if (CODE_COLUMN_KEYS.has(norm)) colToHeader.set(c, norm);
        }
        for (let r = range.s.r + 1; r <= range.e.r; r++) {
          const rowIdx = r - range.s.r + 1; // alinhado com idx+2 abaixo
          for (const [c, header] of colToHeader) {
            const addr = XLSX.utils.encode_cell({ r, c });
            const cell = sheet[addr];
            if (cell && cell.t === "n") {
              const list = codeCellErrorsByRow.get(rowIdx) ?? [];
              list.push(
                `Coluna "${header}" veio como NÚMERO no Excel. Formate como TEXTO e digite novamente para preservar zeros/precisão.`,
              );
              codeCellErrorsByRow.set(rowIdx, list);
            }
          }
        }
      }
    } catch (e) {
      console.warn("[importacao] type-scan falhou (ignora):", e);
    }

    const rows: ImportRow[] = [];
    json.forEach((rawObj, idx) => {
      const sheetRowNum = (rawObj as { __rowNum__?: unknown }).__rowNum__;
      const sourceRowIndex = typeof sheetRowNum === "number" ? sheetRowNum + 1 : idx + 2;
      const row = emptyRow(sourceRowIndex);

      // Aplica erros pré-detectados de tipo numérico em colunas-código
      const pre = codeCellErrorsByRow.get(sourceRowIndex);
      if (pre && pre.length) row.errors.push(...pre);

      for (const [k, v] of Object.entries(rawObj)) {
        const norm = normalizeHeader(k);
        const key = HEADER_MAP[norm];
        if (key) {
          switch (key) {
            case "action":
              row.action = parseAction(v);
              break;
            case "sku":
              row.sku = String(v ?? "").trim();
              break;
            case "nome":
              row.nome_produto = String(v ?? "").trim();
              break;
            case "categoria":
              row.categoria = String(v ?? "").trim();
              break;
            case "custo":
              row.preco_custo = parsePrice(v);
              break;
            case "preco":
              row.preco_venda = parsePrice(v);
              break;
            case "estoque":
              row.estoque_inicial = parseInteger(v);
              break;
            case "ativo":
              row.ativo = parseBoolPtBr(v, false);
              break;
            case "revisado":
              row.revisado_humano = parseBoolPtBr(v, false);
              break;
            case "aprovado":
              row.aprovado_importar = parseBoolPtBr(v, false);
              break;
            case "obs_user":
              row.observacoes_usuario = String(v ?? "").trim();
              break;
            case "gtin_ean":
              row.gtin_ean = String(v ?? "").trim();
              break;
            case "codigo_barras":
              row.codigo_barras = String(v ?? "").trim();
              break;
            case "ncm":
              row.ncm = String(v ?? "").trim();
              break;
            case "cest":
              row.cest = String(v ?? "").trim();
              break;
            case "cfop_default":
              row.cfop_default = String(v ?? "").trim();
              break;
          }
          continue;
        }
        // Dados técnicos opcionais (v1.0.2): cabeçalho casa com chave em TECH_FIELDS
        if (TECH_FIELD_KEYS.includes(norm)) {
          const sanitized = sanitizeTechValue(v);
          if (sanitized) row.tech[norm] = sanitized;
        }
      }

      // ignora linhas totalmente vazias
      if (
        !row.sku &&
        !row.nome_produto &&
        !row.categoria &&
        row.preco_venda === null &&
        row.preco_custo === null
      ) {
        return;
      }
      rows.push(row);
    });
    if (rows.length > MAX_ROWS) {
      return {
        ok: false as const,
        error: `Planilha com ${rows.length} linhas preenchidas excede o limite de ${MAX_ROWS}.`,
      };
    }
    const blocked = rows.filter((r) => r.errors.length > 0).length;
    await logAdminAction({
      adminId: adminUserId,
      action: "product_import.parse",
      resourceType: "products",
      description: `Parse de planilha "${data.fileName}": ${rows.length} linhas, ${blocked} com pré-erros.`,
      after: { total: rows.length, blocked, fileName: data.fileName, version: "v1.0.5" },
    });
    if (blocked > 0) {
      await logAdminAction({
        adminId: adminUserId,
        action: "product_import.blocked",
        resourceType: "products",
        description: `${blocked} linha(s) bloqueada(s) no parse (notação científica / tipo numérico em coluna-código).`,
        after: { blocked, fileName: data.fileName, version: "v1.0.5" },
      });
    }

    return { ok: true as const, rows, sheetName };
  });

// ===================== 2. validateImportRows =====================

export const validateImportRows = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) => RowsInput.parse(raw))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Carrega SKUs existentes e categorias
    const skus = data.rows.map((r) => r.sku.trim()).filter(Boolean);
    const slugsBuscar = new Set<string>();
    const nomesCategoriaBuscar = new Set<string>();
    for (const r of data.rows) {
      const c = r.categoria.trim();
      if (c) {
        slugsBuscar.add(slugify(c));
        nomesCategoriaBuscar.add(c.toLowerCase());
      }
    }

    const [{ data: existingProducts }, { data: existingCategories }] = await Promise.all([
      skus.length > 0
        ? supabaseAdmin.from("products").select("id, sku, slug").in("sku", skus)
        : Promise.resolve({ data: [] as { id: string; sku: string | null; slug: string }[] }),
      supabaseAdmin.from("categories").select("id, name, slug"),
    ]);

    const productBySku = new Map<string, { id: string; slug: string }>();
    for (const p of existingProducts ?? []) {
      if (p.sku) productBySku.set(p.sku, { id: p.id, slug: p.slug });
    }

    const categoryByKey = new Map<string, { id: string; name: string; slug: string }>();
    const categoryKeyCount = new Map<string, number>();
    for (const c of existingCategories ?? []) {
      const slugKey = c.slug.trim().toLowerCase();
      const nameKey = c.name.trim().toLowerCase();
      categoryByKey.set(slugKey, c);
      categoryByKey.set(nameKey, c);
      categoryKeyCount.set(slugKey, (categoryKeyCount.get(slugKey) ?? 0) + 1);
      categoryKeyCount.set(nameKey, (categoryKeyCount.get(nameKey) ?? 0) + 1);
    }

    // Dedup SKU na planilha
    const skuCount = new Map<string, number>();
    for (const r of data.rows) {
      const k = r.sku.trim();
      if (k) skuCount.set(k, (skuCount.get(k) ?? 0) + 1);
    }

    const validated: ImportRow[] = data.rows.map((r) => {
      const errors: string[] = [];
      const warnings: string[] = [];
      const sku = r.sku.trim();
      const nome = r.nome_produto.trim();
      const categoriaRaw = r.categoria.trim();

      let action = r.action;
      if (!action) action = "criar";

      if (action === "ignorar") {
        return {
          ...r,
          action,
          status: "ignored" as ImportStatus,
          errors: [],
          warnings: ["Linha marcada como ignorar."],
          matched_product_id: null,
          matched_category_id: null,
        };
      }

      // SKU
      if (!sku) errors.push("SKU obrigatório.");
      else if ((skuCount.get(sku) ?? 0) > 1)
        errors.push("SKU duplicado dentro da planilha.");

      // Nome
      if (!nome) errors.push("Nome do produto obrigatório.");
      else if (nome.length < 3) errors.push("Nome do produto muito curto (mínimo 3).");

      // Categoria
      let matchedCategoryId: string | null = null;
      if (!categoriaRaw) {
        errors.push("Categoria obrigatória.");
      } else {
        const lkLower = categoriaRaw.toLowerCase();
        const lkSlug = slugify(categoriaRaw);
        const cat = categoryByKey.get(lkLower) || categoryByKey.get(lkSlug);
        const ambiguous =
          (categoryKeyCount.get(lkLower) ?? 0) > 1 ||
          (categoryKeyCount.get(lkSlug) ?? 0) > 1;
        if (!cat) {
          errors.push(
            `Categoria "${categoriaRaw}" não encontrada. Crie a categoria antes de importar.`,
          );
        } else if (ambiguous) {
          errors.push(
            `Categoria "${categoriaRaw}" é ambígua (mais de uma categoria com mesmo nome/slug). Selecione a categoria correta antes de importar.`,
          );
        } else {
          matchedCategoryId = cat.id;
        }
      }

      // Preço de custo (obrigatório para cálculo de margem)
      if (r.preco_custo === null || r.preco_custo === undefined) {
        errors.push("Preço de custo obrigatório.");
      } else if (r.preco_custo < 0) {
        errors.push("Preço de custo não pode ser negativo.");
      }

      // Preço
      if (r.preco_venda === null || r.preco_venda === undefined) {
        errors.push("Preço de venda obrigatório.");
      } else if (r.preco_venda <= 0) {
        errors.push("Preço deve ser maior que zero.");
      } else if (
        r.preco_custo !== null &&
        r.preco_custo !== undefined &&
        r.preco_custo > 0 &&
        r.preco_venda <= r.preco_custo
      ) {
        warnings.push("Preço de venda menor ou igual ao custo — margem nula ou negativa.");
      }

      // Estoque
      if (r.estoque_inicial === null || r.estoque_inicial === undefined) {
        errors.push("Estoque inicial obrigatório.");
      } else if (r.estoque_inicial < 0) {
        errors.push("Estoque não pode ser negativo.");
      }

      // SKU existente
      const existing = sku ? productBySku.get(sku) : undefined;
      let matchedProductId: string | null = null;
      if (existing) {
        matchedProductId = existing.id;
        if (action === "criar") {
          errors.push("SKU já existe. Use ação 'atualizar' para editar o produto.");
        }
      } else if (action === "atualizar") {
        errors.push("SKU não encontrado. Use ação 'criar' para cadastrar.");
      }

      // Avisos para campos sensíveis
      if (action === "atualizar" && r.estoque_inicial !== null) {
        warnings.push(
          "Atualização: estoque NÃO será sobrescrito automaticamente (regra de segurança).",
        );
      }
      if (r.ativo && !r.revisado_humano) {
        warnings.push("Produto marcado como ativo mas sem revisão humana — será criado inativo.");
      }

      // ===== Dados técnicos opcionais (v1.0.2) =====
      // Nunca bloqueiam por estarem vazios. Validação leve por campo preenchido.
      const techClean: Record<string, string> = {};
      for (const [k, vRaw] of Object.entries(r.tech ?? {})) {
        const def = TECH_FIELDS.find((f) => f.key === k);
        if (!def) continue; // ignora chaves desconhecidas
        const sanitized = sanitizeTechValue(vRaw);
        if (!sanitized) continue;
        const v = validateTechValue(def, sanitized);
        if (v.error) errors.push(v.error);
        if (v.warning) warnings.push(v.warning);
        techClean[k] = sanitized;
      }

      // ===== v1.0.4 — Colunas-código como texto =====
      // 1) Bloqueio de notação científica no SKU.
      if (sku && isScientificNotation(sku)) {
        errors.push(
          `SKU em notação científica ("${sku}"). Reabra a planilha, formate a coluna como Texto e digite o código novamente.`,
        );
      }

      // 2) Merge codigo_barras + gtin_ean (sem coluna própria no banco).
      const eanIn = (r.gtin_ean ?? "").trim();
      const cbIn = (r.codigo_barras ?? "").trim();
      let gtinFinal = "";
      if (eanIn && cbIn) {
        if (eanIn !== cbIn) {
          errors.push(
            "EAN/GTIN e código de barras estão divergentes. Corrija antes de importar.",
          );
        } else {
          gtinFinal = eanIn;
        }
      } else {
        gtinFinal = eanIn || cbIn;
      }
      if (gtinFinal && isScientificNotation(gtinFinal)) {
        errors.push(
          "EAN/GTIN em notação científica. Reabra a planilha, formate a coluna como Texto e digite novamente.",
        );
        gtinFinal = "";
      }

      // 3) NCM / CEST / CFOP — validação estrutural apenas (formato válido).
      let ncmFinal = "";
      if (r.ncm) {
        const v = validateNcmFormat(r.ncm);
        if (!v.ok) errors.push(v.error ?? "NCM inválido.");
        else if (v.normalized) ncmFinal = v.normalized;
      }
      let cestFinal = "";
      if (r.cest) {
        const v = validateCestFormat(r.cest);
        if (!v.ok) errors.push(v.error ?? "CEST inválido.");
        else if (v.normalized) cestFinal = v.normalized;
      }
      let cfopFinal = "";
      if (r.cfop_default) {
        const v = validateCfopFormat(r.cfop_default);
        if (!v.ok) errors.push(v.error ?? "CFOP inválido.");
        else if (v.normalized) cfopFinal = v.normalized;
      }

      // 4) Atributos técnicos com texto sensível à notação científica
      for (const codeKey of ["codigo_fornecedor", "modelo"] as const) {
        const val = techClean[codeKey];
        if (val && isScientificNotation(val)) {
          errors.push(
            `Atributo "${codeKey}" em notação científica. Formate a coluna como Texto.`,
          );
          delete techClean[codeKey];
        }
      }

      let status: ImportStatus;
      if (errors.length > 0) {
        status = "invalid";
      } else if (r.revisado_humano && r.aprovado_importar) {
        status = "ready";
      } else {
        status = "needs_review";
      }

      return {
        ...r,
        action,
        status,
        errors,
        warnings,
        matched_product_id: matchedProductId,
        matched_category_id: matchedCategoryId,
        tech: techClean,
        gtin_ean: gtinFinal,
        codigo_barras: cbIn, // mantém o original na revisão; persistência usa gtin_ean
        ncm: ncmFinal,
        cest: cestFinal,
        cfop_default: cfopFinal,
      };
    });


    return { ok: true as const, rows: validated, counts: countRows(validated) };
  });

// ===================== 3. enrichImportRows (IA) =====================

const AISuggestion = z.object({
  slug_sugerido: z.string().min(1).transform((s) => s.slice(0, 120)),
  descricao_curta: z.string().min(1).transform((s) => s.slice(0, 400)),
  descricao_longa: z.string().min(1).transform((s) => s.slice(0, 3000)),
  tags: z.array(z.string()).max(30).optional().default([]),
  titulo_seo: z.string().min(1).transform((s) => s.slice(0, 70)),
  meta_description: z.string().min(1).transform((s) => s.slice(0, 200)),
  observacoes_ia: z.string().max(1000).optional().default(""),
  nivel_confianca_ia: z.enum(["alta", "media", "baixa"]).optional().default("media"),
});

const SYSTEM_PROMPT_IA = `Você é especialista em cadastro de produtos para e-commerce de material elétrico e iluminação LED da loja Led Maricá (Maricá/RJ).

REGRAS OBRIGATÓRIAS (NUNCA VIOLAR):
1. NÃO invente preço, custo, estoque, SKU, EAN, marca, potência, tensão, amperagem, NCM, CEST, garantia, dimensões, peso, certificações.
2. Use APENAS o nome do produto e a categoria informados.
3. Se faltar dado técnico, registre em "observacoes_ia" e marque "nivel_confianca_ia" como "baixa".
4. Texto comercial em português do Brasil, sem promessas falsas.
5. Título SEO ≤ 60 caracteres. Meta description ≤ 155 caracteres.
6. Descrição curta ≤ 250 caracteres.
7. Slug: minúsculo, sem acento, hífen no lugar de espaço.
8. NUNCA mencione preço, marca específica nem certificações que não vieram nos dados.

Devolva SEMPRE via tool call estruturada.`;

async function callAiForRow(input: {
  nome: string;
  categoria: string;
  sku: string;
  obsUsuario: string;
}): Promise<{ ok: true; suggestion: z.infer<typeof AISuggestion> } | { ok: false; error: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) return { ok: false, error: "LOVABLE_API_KEY não configurada" };

  const userPrompt = [
    `Nome: ${input.nome}`,
    `Categoria: ${input.categoria}`,
    input.sku ? `SKU: ${input.sku}` : null,
    input.obsUsuario ? `Observações do usuário: ${input.obsUsuario}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT_IA },
        { role: "user", content: userPrompt },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "set_product_import_fields",
            description: "Sugestões textuais para cadastro do produto.",
            parameters: {
              type: "object",
              properties: {
                slug_sugerido: { type: "string" },
                descricao_curta: { type: "string" },
                descricao_longa: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
                titulo_seo: { type: "string" },
                meta_description: { type: "string" },
                observacoes_ia: { type: "string" },
                nivel_confianca_ia: { type: "string", enum: ["alta", "media", "baixa"] },
              },
              required: [
                "slug_sugerido",
                "descricao_curta",
                "descricao_longa",
                "titulo_seo",
                "meta_description",
                "nivel_confianca_ia",
              ],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: "set_product_import_fields" },
      },
    }),
  });

  if (res.status === 429) return { ok: false, error: "Limite de IA atingido. Tente em instantes." };
  if (res.status === 402) return { ok: false, error: "Créditos de IA esgotados." };
  if (!res.ok) {
    const t = await res.text();
    console.error("AI enrich error", res.status, t.slice(0, 500));
    return { ok: false, error: `Erro IA (${res.status}): ${t.slice(0, 200)}` };
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        content?: string;
        tool_calls?: { function?: { arguments?: unknown } }[];
      };
    }[];
  };
  let args: unknown = json.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) {
    // Fallback: modelos que ignoram tool_choice e devolvem JSON em content
    const content = json.choices?.[0]?.message?.content;
    if (content) {
      const match = content.match(/\{[\s\S]*\}/);
      if (match) args = match[0];
    }
  }
  if (!args) {
    console.error("AI enrich: resposta sem tool_call", JSON.stringify(json).slice(0, 500));
    return { ok: false, error: "Resposta IA sem dados estruturados" };
  }
  try {
    const parsed = AISuggestion.parse(typeof args === "string" ? JSON.parse(args) : args);
    return { ok: true, suggestion: parsed };
  } catch (e) {
    console.error("AI enrich: schema inválido", e, "args=", String(args).slice(0, 500));
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "Falha ao validar IA" };
  }
}

export const enrichImportRows = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) =>
    z
      .object({
        rows: z.array(ImportRowSchema).max(MAX_ROWS),
        onlyEmpty: z.boolean().default(true),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    const out: ImportRow[] = [];
    let succeeded = 0;
    let failed = 0;

    for (const row of data.rows) {
      // Pula linhas inválidas ou ignoradas
      if (row.status === "invalid" || row.status === "ignored") {
        out.push(row);
        continue;
      }
      // Pula se já tem sugestão e onlyEmpty=true
      const alreadyHas =
        row.descricao_longa &&
        row.descricao_curta &&
        row.titulo_seo &&
        row.meta_description &&
        row.slug_sugerido;
      if (data.onlyEmpty && alreadyHas) {
        out.push(row);
        continue;
      }
      if (!row.nome_produto || !row.categoria) {
        out.push(row);
        continue;
      }

      const r = await callAiForRow({
        nome: row.nome_produto,
        categoria: row.categoria,
        sku: row.sku,
        obsUsuario: row.observacoes_usuario,
      });

      if (!r.ok) {
        failed += 1;
        out.push({
          ...row,
          observacoes_ia: `${row.observacoes_ia ?? ""}\n[IA] ${r.error}`.trim(),
        });
        continue;
      }

      const s = r.suggestion;
      succeeded += 1;
      out.push({
        ...row,
        slug_sugerido: slugify(s.slug_sugerido),
        descricao_curta: s.descricao_curta,
        descricao_longa: s.descricao_longa,
        tags: parseTags(s.tags),
        titulo_seo: s.titulo_seo,
        meta_description: s.meta_description,
        observacoes_ia: s.observacoes_ia || row.observacoes_ia,
        nivel_confianca_ia: s.nivel_confianca_ia as ImportConfidence,
      });
    }

    return { ok: true as const, rows: out, succeeded, failed };
  });

// ===================== 4. simulateImport =====================

type SimAction = "create" | "update" | "skip" | "error";

export const simulateImport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) => RowsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const plan = data.rows.map((r) => {
      let simAction: SimAction = "skip";
      const reasons: string[] = [];

      if (r.status === "ignored") {
        simAction = "skip";
        reasons.push("ação=ignorar");
      } else if (r.status === "invalid") {
        simAction = "error";
        reasons.push(...r.errors);
      } else if (!r.revisado_humano) {
        simAction = "skip";
        reasons.push("Não revisado por humano.");
      } else if (!r.aprovado_importar) {
        simAction = "skip";
        reasons.push("Não aprovado para importar.");
      } else if (r.action === "atualizar" && r.matched_product_id) {
        simAction = "update";
      } else if (r.matched_product_id) {
        simAction = "skip";
        reasons.push("SKU já existe. Use ação atualizar.");
      } else {
        simAction = "create";
      }

      return {
        rowIndex: r.rowIndex,
        sku: r.sku,
        nome: r.nome_produto,
        simAction,
        reasons,
      };
    });

    const summary = {
      total: plan.length,
      toCreate: plan.filter((p) => p.simAction === "create").length,
      toUpdate: plan.filter((p) => p.simAction === "update").length,
      toSkip: plan.filter((p) => p.simAction === "skip").length,
      errors: plan.filter((p) => p.simAction === "error").length,
    };

    await logAdminAction({
      adminId: adminUserId,
      action: "product_import.simulate",
      resourceType: "products",
      description: `Simulação: ${summary.toCreate} criar, ${summary.toUpdate} atualizar, ${summary.toSkip} ignorar, ${summary.errors} erro.`,
      after: { ...summary, version: "v1.0.5" },
    });

    return { ok: true as const, plan, summary };
  });

// ===================== 5. commitImport =====================

export const commitImport = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) =>
    z
      .object({
        rows: z.array(ImportRowSchema).max(MAX_ROWS),
        fileName: z.string().max(255),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const importId = crypto.randomUUID();

    const log: Array<{
      rowIndex: number;
      sku: string;
      result: "created" | "updated" | "skipped" | "error";
      productId?: string;
      message?: string;
    }> = [];

    // Re-valida o conjunto inteiro contra o DB no servidor (defesa em profundidade)
    const skus = data.rows.map((r) => r.sku.trim()).filter(Boolean);
    const { data: dbProducts } = await supabaseAdmin
      .from("products")
      .select("id, sku")
      .in("sku", skus.length ? skus : ["__none__"]);
    const dbSkuMap = new Map<string, string>();
    for (const p of dbProducts ?? []) if (p.sku) dbSkuMap.set(p.sku, p.id);

    // Slugs existentes para evitar duplicidade
    const slugCheckCache = new Set<string>();

    for (const row of data.rows) {
      try {
        // Gate de segurança duro: nada importa sem revisão+aprovação E status válido
        if (
          row.status !== "ready" ||
          !row.revisado_humano ||
          !row.aprovado_importar
        ) {
          log.push({
            rowIndex: row.rowIndex,
            sku: row.sku,
            result: "skipped",
            message: "Linha não aprovada para importação.",
          });
          continue;
        }
        if (!row.matched_category_id) {
          log.push({
            rowIndex: row.rowIndex,
            sku: row.sku,
            result: "error",
            message: "Categoria não resolvida.",
          });
          continue;
        }
        if (row.preco_venda === null || row.preco_venda <= 0) {
          log.push({
            rowIndex: row.rowIndex,
            sku: row.sku,
            result: "error",
            message: "Preço inválido.",
          });
          continue;
        }

        // v1.0.4 — Revalidação server-side defensiva dos campos-código.
        if (row.sku && isScientificNotation(row.sku)) {
          log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "error", message: "SKU em notação científica." });
          continue;
        }
        if (row.ncm) {
          const v = validateNcmFormat(row.ncm);
          if (!v.ok) { log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "error", message: v.error ?? "NCM inválido." }); continue; }
        }
        if (row.cest) {
          const v = validateCestFormat(row.cest);
          if (!v.ok) { log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "error", message: v.error ?? "CEST inválido." }); continue; }
        }
        if (row.cfop_default) {
          const v = validateCfopFormat(row.cfop_default);
          if (!v.ok) { log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "error", message: v.error ?? "CFOP inválido." }); continue; }
        }

        const dbId = dbSkuMap.get(row.sku.trim()) ?? null;

        // Whitelist de atributos técnicos (texto puro) — exclui marca/peso/ncm
        // que vão direto no produto e podem repetir keys.
        const attrs = Object.entries(row.tech ?? {})
          .filter(([k]) => k !== "marca" && k !== "peso_kg" && k !== "ncm")
          .map(([k, v], i) => {
            const def = TECH_FIELDS.find((f) => f.key === k);
            if (!def) return null;
            const cleanValue = stripUnitSuffix(String(v ?? ""), def.unit).slice(0, 500);
            if (!cleanValue) return null;
            return {
              attribute_key: k,
              attribute_label: def.label,
              attribute_value: cleanValue,
              attribute_unit: def.unit ?? null,
              sort_order: i,
              is_visible: true,
            };
          })
          .filter((x): x is NonNullable<typeof x> => x !== null);

        // Peso técnico → weight_kg
        let weightKg: number | null = null;
        if (row.tech?.peso_kg) {
          const w = Number(String(row.tech.peso_kg).replace(",", "."));
          if (Number.isFinite(w) && w >= 0) weightKg = w;
        }
        const brand = row.tech?.marca ? String(row.tech.marca).slice(0, 120) : null;

        if (row.action === "atualizar") {
          if (!dbId) {
            log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "error", message: "SKU não existe para atualizar." });
            continue;
          }
          const payloadUpd: Record<string, unknown> = {
            id: dbId,
            name: row.nome_produto,
            category_id: row.matched_category_id,
            price: row.preco_venda,
            cost_price:
              row.preco_custo !== null && row.preco_custo >= 0
                ? String(row.preco_custo)
                : "",
            gtin_ean: nullIfEmpty(row.gtin_ean) ?? "",
            ncm: nullIfEmpty(row.ncm) ?? "",
            cest: nullIfEmpty(row.cest) ?? "",
            cfop_default: nullIfEmpty(row.cfop_default) ?? "",
          };
          if (row.descricao_longa) payloadUpd.description = row.descricao_longa;
          if (row.tags.length) payloadUpd.tags = row.tags;
          if (row.titulo_seo) payloadUpd.seo_title = row.titulo_seo;
          if (row.meta_description) payloadUpd.seo_description = row.meta_description;
          if (row.ativo && row.warnings.length === 0) payloadUpd.active = true;
          if (brand) payloadUpd.brand = brand;
          if (weightKg !== null) payloadUpd.weight_kg = String(weightKg);

          const { error } = await supabaseAdmin.rpc("import_product_with_attrs" as never, {
            _mode: "update",
            _payload: payloadUpd,
            _attrs: attrs,
          } as never);
          if (error) throw new Error(error.message);
          log.push({ rowIndex: row.rowIndex, sku: row.sku, result: "updated", productId: dbId });
          continue;
        }

        // ===== criar =====
        if (dbId) {
          log.push({
            rowIndex: row.rowIndex,
            sku: row.sku,
            result: "skipped",
            message: "SKU já existe. Use ação atualizar.",
          });
          continue;
        }

        // Gera slug único
        let baseSlug = row.slug_sugerido || slugify(row.nome_produto);
        if (!baseSlug) baseSlug = `produto-${row.sku.toLowerCase()}`;
        let candidate = baseSlug;
        let attempt = 1;
        while (slugCheckCache.has(candidate)) {
          attempt += 1;
          candidate = `${baseSlug}-${attempt}`;
        }
        const { data: slugHit } = await supabaseAdmin
          .from("products")
          .select("id")
          .eq("slug", candidate)
          .maybeSingle();
        if (slugHit) {
          candidate = `${baseSlug}-${row.sku.toLowerCase()}`;
        }
        slugCheckCache.add(candidate);

        const payloadIns: Record<string, unknown> = {
          sku: row.sku,
          name: row.nome_produto,
          slug: candidate,
          category_id: row.matched_category_id,
          price: String(row.preco_venda),
          cost_price:
            row.preco_custo !== null && row.preco_custo >= 0
              ? String(row.preco_custo)
              : "",
          stock_qty: String(row.estoque_inicial ?? 0),
          active: row.ativo && row.warnings.length === 0,
          description: row.descricao_longa ?? "",
          tags: row.tags.length ? row.tags : [],
          seo_title: row.titulo_seo ?? "",
          seo_description: row.meta_description ?? "",
          brand: brand ?? "",
          gtin_ean: nullIfEmpty(row.gtin_ean) ?? "",
          ncm: nullIfEmpty(row.ncm) ?? "",
          cest: nullIfEmpty(row.cest) ?? "",
          cfop_default: nullIfEmpty(row.cfop_default) ?? "",
          weight_kg: weightKg !== null ? String(weightKg) : "",
        };

        const { data: rpcRes, error } = await supabaseAdmin.rpc(
          "import_product_with_attrs" as never,
          { _mode: "create", _payload: payloadIns, _attrs: attrs } as never,
        );
        if (error) throw new Error(error.message);
        const createdId = (rpcRes as { product_id?: string } | null)?.product_id;
        log.push({
          rowIndex: row.rowIndex,
          sku: row.sku,
          result: "created",
          productId: createdId,
        });
      } catch (e) {
        log.push({
          rowIndex: row.rowIndex,
          sku: row.sku,
          result: "error",
          message: e instanceof Error ? e.message : "Erro desconhecido",
        });
      }
    }

    const summary = {
      importId,
      fileName: data.fileName,
      total: data.rows.length,
      created: log.filter((l) => l.result === "created").length,
      updated: log.filter((l) => l.result === "updated").length,
      skipped: log.filter((l) => l.result === "skipped").length,
      errors: log.filter((l) => l.result === "error").length,
    };

    await logAdminAction({
      adminId: adminUserId,
      action: "product_import.commit",
      resourceType: "products",
      resourceId: importId,
      description: `Importação assistida por IA via planilha: ${summary.created} criados, ${summary.updated} atualizados, ${summary.skipped} ignorados, ${summary.errors} com erro.`,
      after: summary,
    });

    return { ok: true as const, summary, log };
  });

// ===================== 6. downloadRevisedSheet =====================

export const downloadRevisedSheet = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .inputValidator((raw: unknown) => RowsInput.parse(raw))
  .handler(async ({ data, context }) => {
    const techKeys = TECH_FIELD_KEYS;
    const adminUserId = (context as { adminUserId: string }).adminUserId;
    const aoa: Array<Array<string | number | null>> = [];
    aoa.push([
      "rowIndex",
      "status",
      "acao",
      "sku",
      "nome_produto",
      "categoria",
      "preco_custo",
      "preco_venda",
      "estoque_inicial",
      "ativo",
      "revisado_humano",
      "aprovado_importar",
      "ean_gtin",
      "codigo_barras",
      "ncm",
      "cest",
      "cfop_default",
      "slug_sugerido",
      "descricao_curta",
      "descricao_longa",
      "tags",
      "titulo_seo",
      "meta_description",
      "nivel_confianca_ia",
      "observacoes_ia",
      ...techKeys,
      "erros",
      "avisos",
    ]);
    // safeCell aplicado SOMENTE na geração do XLSX (evita fórmula no Excel).
    for (const r of data.rows) {
      aoa.push([
        r.rowIndex,
        safeCell(r.status) as string,
        safeCell(r.action) as string,
        safeCell(r.sku) as string,
        safeCell(r.nome_produto) as string,
        safeCell(r.categoria) as string,
        r.preco_custo,
        r.preco_venda,
        r.estoque_inicial,
        r.ativo ? "sim" : "não",
        r.revisado_humano ? "sim" : "não",
        r.aprovado_importar ? "sim" : "não",
        safeCell(r.gtin_ean) as string,
        safeCell(r.codigo_barras) as string,
        safeCell(r.ncm) as string,
        safeCell(r.cest) as string,
        safeCell(r.cfop_default) as string,
        safeCell(r.slug_sugerido ?? "") as string,
        safeCell(r.descricao_curta ?? "") as string,
        safeCell(r.descricao_longa ?? "") as string,
        safeCell(r.tags.join(", ")) as string,
        safeCell(r.titulo_seo ?? "") as string,
        safeCell(r.meta_description ?? "") as string,
        safeCell(r.nivel_confianca_ia ?? "") as string,
        safeCell(r.observacoes_ia ?? "") as string,
        ...techKeys.map((k) => safeCell(r.tech?.[k] ?? "") as string),
        safeCell(r.errors.join(" | ")) as string,
        safeCell(r.warnings.join(" | ")) as string,
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PRODUTOS_REVISADO");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const base64 = Buffer.from(buf).toString("base64");

    await logAdminAction({
      adminId: adminUserId,
      action: "product_import.export_revised",
      resourceType: "products",
      description: `Exportação de planilha revisada (${data.rows.length} linhas).`,
      after: { total: data.rows.length, version: "v1.0.5" },
    });

    return { ok: true as const, fileBase64: base64, fileName: "produtos_revisado.xlsx" };
  });


