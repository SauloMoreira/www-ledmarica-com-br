// Telefone celular brasileiro para WhatsApp — compartilhado entre client e server.
// Aceita "(21) 99999-8888", "21999998888", "+55 21 99999-8888", "5521999998888".
// Normaliza para 11 dígitos (DDD + 9 + 8 dígitos), sem o 55.

export function normalizeBrMobile(raw: string | null | undefined): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length !== 11) return null;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99 || d[2] !== "9") return null;
  if (/^(\d)\1+$/.test(d.slice(2))) return null; // 999999999 etc.
  return d;
}

/** Máscara progressiva enquanto digita: (21) 99999-8888 */
export function formatBrMobile(raw: string): string {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
