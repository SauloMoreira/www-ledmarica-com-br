import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateBR } from "@/lib/dateBR";

type Factor = { id: string; friendly_name?: string | null; status: string; factor_type: string };

export function MfaSetup() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [qr, setQr] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  const refresh = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) {
      setFactors([...(data.totp ?? []), ...(data.phone ?? [])] as any);
    }
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const startEnroll = async () => {
    setEnrolling(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `App ${formatDateBR(new Date())}`,
      });
      if (error) throw error;
      setQr({
        factorId: data.id,
        qr: (data.totp as any).qr_code,
        secret: (data.totp as any).secret,
      });
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível iniciar o cadastro de MFA");
    } finally {
      setEnrolling(false);
    }
  };

  const verify = async () => {
    if (!qr || code.length !== 6) return;
    setVerifying(true);
    try {
      const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
        factorId: qr.factorId,
      });
      if (chErr) throw chErr;
      const { error: vErr } = await supabase.auth.mfa.verify({
        factorId: qr.factorId,
        challengeId: ch.id,
        code,
      });
      if (vErr) throw vErr;
      toast.success("MFA ativado com sucesso!");
      setQr(null);
      setCode("");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Código inválido");
    } finally {
      setVerifying(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este fator MFA?")) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(error.message);
    else {
      toast.success("Fator removido");
      refresh();
    }
  };

  if (loading) return <div className="text-sm text-muted-foreground">Carregando...</div>;

  const verified = factors.filter((f) => f.status === "verified");
  const hasMfa = verified.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        {hasMfa ? (
          <ShieldCheck className="w-5 h-5 text-emerald-600 mt-0.5" />
        ) : (
          <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5" />
        )}
        <div className="flex-1">
          <h3 className="font-semibold text-sm">Autenticação em dois fatores (TOTP)</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasMfa
              ? "Sua conta está protegida com MFA."
              : "Adicione uma camada extra de segurança usando um app como Google Authenticator, 1Password ou Authy."}
          </p>
        </div>
      </div>

      {verified.length > 0 && (
        <div className="space-y-2">
          {verified.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium text-sm">{f.friendly_name ?? "TOTP"}</div>
                <div className="text-xs text-muted-foreground">
                  {f.factor_type.toUpperCase()} · ativo
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(f.id)}>
                <Trash2 className="w-4 h-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {!qr && (
        <Button onClick={startEnroll} disabled={enrolling} variant={hasMfa ? "outline" : "default"}>
          {enrolling && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {hasMfa ? "Adicionar outro fator" : "Ativar MFA"}
        </Button>
      )}

      {qr && (
        <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
          <p className="text-sm">1. Escaneie o QR code no seu app autenticador.</p>
          <div className="flex justify-center bg-white p-3 rounded">
            <img src={qr.qr} alt="QR code MFA" className="w-48 h-48" />
          </div>
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">
              Não consigo escanear — usar código manual
            </summary>
            <code className="block mt-2 p-2 bg-background rounded font-mono break-all text-[11px]">
              {qr.secret}
            </code>
          </details>
          <p className="text-sm pt-2">2. Digite o código de 6 dígitos:</p>
          <div className="flex gap-2">
            <Input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="font-mono text-center tracking-widest"
            />
            <Button onClick={verify} disabled={verifying || code.length !== 6}>
              {verifying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setQr(null);
                setCode("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
