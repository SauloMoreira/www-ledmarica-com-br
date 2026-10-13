import { useId, useRef, type KeyboardEvent } from "react";
import { Building2, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  formatTaxDocument,
  isValidLegalName,
  isValidTaxDocument,
  onlyDigits,
  TAX_DOCUMENT_LENGTH,
  type TaxDocumentType,
} from "@/lib/taxDocument";

export type TaxDocumentValue = {
  type: TaxDocumentType;
  cpf: string; // formatado
  cnpj: string; // formatado
  legalName: string;
};

type Props = {
  value: TaxDocumentValue;
  onChange: (next: TaxDocumentValue) => void;
  /** Mostra erros mesmo sem blur (ex.: depois de tentar avançar). */
  showErrors: boolean;
  onBlur?: () => void;
  className?: string;
};

const OPTIONS: { type: TaxDocumentType; label: string; hint: string; Icon: typeof User }[] = [
  { type: "cpf", label: "Pessoa física", hint: "CPF", Icon: User },
  { type: "cnpj", label: "Empresa / MEI", hint: "CNPJ", Icon: Building2 },
];

/**
 * Campo de documento fiscal do comprador (CPF ou CNPJ).
 * - Alternância acessível (radiogroup com setas do teclado).
 * - Cada tipo guarda o próprio valor: trocar de aba não apaga o que foi digitado.
 * - Colar um CNPJ (14 dígitos) no modo CPF troca sozinho para CNPJ.
 */
export function TaxDocumentField({ value, onChange, showErrors, onBlur, className }: Props) {
  const baseId = useId();
  const docId = `${baseId}-doc`;
  const legalId = `${baseId}-legal`;
  const docErrId = `${baseId}-doc-err`;
  const legalErrId = `${baseId}-legal-err`;
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const isCnpj = value.type === "cnpj";
  const current = isCnpj ? value.cnpj : value.cpf;
  const digits = onlyDigits(current);
  const docInvalid =
    showErrors && (digits.length === 0 || !isValidTaxDocument(digits, value.type));
  const legalInvalid = showErrors && isCnpj && !isValidLegalName(value.legalName);

  function setType(type: TaxDocumentType) {
    if (type !== value.type) onChange({ ...value, type });
  }

  function handleDocChange(raw: string) {
    const d = onlyDigits(raw);
    if (!isCnpj && d.length > TAX_DOCUMENT_LENGTH.cpf) {
      onChange({ ...value, type: "cnpj", cnpj: formatTaxDocument(d, "cnpj") });
      return;
    }
    if (isCnpj) onChange({ ...value, cnpj: formatTaxDocument(d, "cnpj") });
    else onChange({ ...value, cpf: formatTaxDocument(d, "cpf") });
  }

  function handleKey(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next = (index + 1) % OPTIONS.length;
    setType(OPTIONS[next].type);
    optionRefs.current[next]?.focus();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <span id={`${baseId}-group-label`} className="text-sm font-medium">
          Nota fiscal em nome de
        </span>
        <div
          role="radiogroup"
          aria-labelledby={`${baseId}-group-label`}
          className="mt-1.5 grid grid-cols-2 gap-2"
        >
          {OPTIONS.map((opt, i) => {
            const selected = opt.type === value.type;
            return (
              <button
                key={opt.type}
                ref={(el) => {
                  optionRefs.current[i] = el;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => setType(opt.type)}
                onKeyDown={(e) => handleKey(e, i)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  selected
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                <opt.Icon
                  className={cn("h-4 w-4 shrink-0", selected ? "text-primary" : "")}
                  aria-hidden
                />
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted-foreground">{opt.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label htmlFor={docId}>{isCnpj ? "CNPJ" : "CPF"}</Label>
        <Input
          id={docId}
          value={current}
          onChange={(e) => handleDocChange(e.target.value)}
          onBlur={onBlur}
          placeholder={isCnpj ? "00.000.000/0000-00" : "000.000.000-00"}
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          aria-invalid={docInvalid || undefined}
          aria-describedby={docInvalid ? docErrId : undefined}
          className={cn("mt-1.5", docInvalid && "border-destructive")}
        />
        {docInvalid && (
          <p id={docErrId} className="text-xs text-destructive mt-1" role="alert">
            {digits.length === 0
              ? `Informe o ${isCnpj ? "CNPJ" : "CPF"}.`
              : `${isCnpj ? "CNPJ" : "CPF"} inválido — confira os números.`}
          </p>
        )}
      </div>

      {isCnpj && (
        <div>
          <Label htmlFor={legalId}>Razão social</Label>
          <Input
            id={legalId}
            value={value.legalName}
            onChange={(e) => onChange({ ...value, legalName: e.target.value })}
            onBlur={onBlur}
            placeholder="Nome da empresa como está no CNPJ"
            autoComplete="organization"
            maxLength={150}
            aria-invalid={legalInvalid || undefined}
            aria-describedby={legalInvalid ? legalErrId : undefined}
            className={cn("mt-1.5", legalInvalid && "border-destructive")}
          />
          {legalInvalid && (
            <p id={legalErrId} className="text-xs text-destructive mt-1" role="alert">
              Informe a razão social da empresa.
            </p>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {isCnpj
          ? "A nota sai no CNPJ da empresa. Preço de varejo — para preço de atacado, faça o cadastro de empresa."
          : "Exigido por lei para emitir a nota fiscal do pedido."}
      </p>
    </div>
  );
}
