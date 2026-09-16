// Utilitários de CPF — validação pelo algoritmo oficial e formatação.
// Espelha src/lib/cnpj.ts (mesmo padrão de onlyDigits/formatXXX/isValidXXX).

export function onlyDigits(value: string): string {
  return (value || "").replace(/\D+/g, "");
}

export function formatCPF(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  // Rejeita sequências repetidas (00000000000, 11111111111, ...)
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calcDigit = (base: string, weightStart: number) => {
    const sum = base
      .split("")
      .reduce((acc, n, i) => acc + parseInt(n, 10) * (weightStart - i), 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };

  const d1 = calcDigit(cpf.slice(0, 9), 10);
  if (d1 !== parseInt(cpf[9], 10)) return false;
  const d2 = calcDigit(cpf.slice(0, 10), 11);
  if (d2 !== parseInt(cpf[10], 10)) return false;
  return true;
}
