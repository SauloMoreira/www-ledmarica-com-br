import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, MailX, CheckCircle2, AlertTriangle } from "lucide-react";

import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { buildSeo } from "@/lib/seo";

export const Route = createFileRoute("/descadastro")({
  head: () =>
    buildSeo({
      title: "Cancelar recebimento de e-mails",
      description:
        "Cancele o recebimento de e-mails promocionais da Led Maricá. Avisos sobre seus pedidos continuam sendo enviados normalmente.",
      url: "/descadastro",
      noindex: true,
    }),
  component: DescadastroPage,
});

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "confirm"; email: string }
  | { kind: "already"; email: string }
  | { kind: "done" };

function DescadastroPage() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState("");

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    if (!t) {
      setState({ kind: "invalid" });
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/api/public/email/unsubscribe?token=${encodeURIComponent(t)}`);
        const json = (await res.json()) as {
          found?: boolean;
          email?: string;
          alreadyUnsubscribed?: boolean;
        };
        if (!json.found) setState({ kind: "invalid" });
        else if (json.alreadyUnsubscribed)
          setState({ kind: "already", email: json.email ?? "" });
        else setState({ kind: "confirm", email: json.email ?? "" });
      } catch {
        setState({ kind: "invalid" });
      }
    })();
  }, []);

  async function handleConfirm() {
    setSaving(true);
    try {
      const res = await fetch("/api/public/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (res.ok) setState({ kind: "done" });
      else setState({ kind: "invalid" });
    } catch {
      setState({ kind: "invalid" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <StoreLayout>
      <div className="container mx-auto max-w-xl px-4 py-14">
        <Card>
          <CardContent className="space-y-4 p-8 text-center">
            {state.kind === "loading" && (
              <>
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Validando seu link…</p>
              </>
            )}

            {state.kind === "invalid" && (
              <>
                <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" />
                <h1 className="text-xl font-semibold">Link inválido ou expirado</h1>
                <p className="text-sm text-muted-foreground">
                  Não conseguimos validar este link de descadastro. Se preferir, fale com nosso
                  atendimento que cancelamos o envio para você.
                </p>
              </>
            )}

            {state.kind === "confirm" && (
              <>
                <MailX className="mx-auto h-8 w-8 text-muted-foreground" />
                <h1 className="text-xl font-semibold">Cancelar e-mails promocionais</h1>
                <p className="text-sm text-muted-foreground">
                  Confirmar o cancelamento para <strong>{state.email}</strong>? Você deixará de
                  receber lembretes de carrinho e ofertas. Avisos sobre seus pedidos continuam
                  sendo enviados normalmente.
                </p>
                <Button onClick={handleConfirm} disabled={saving} className="mt-2">
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Confirmar cancelamento
                </Button>
              </>
            )}

            {state.kind === "already" && (
              <>
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <h1 className="text-xl font-semibold">Você já está descadastrado</h1>
                <p className="text-sm text-muted-foreground">
                  O e-mail <strong>{state.email}</strong> não recebe mais mensagens promocionais.
                </p>
              </>
            )}

            {state.kind === "done" && (
              <>
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
                <h1 className="text-xl font-semibold">Cancelamento confirmado</h1>
                <p className="text-sm text-muted-foreground">
                  Pronto! Você não receberá mais e-mails promocionais. Avisos sobre seus pedidos
                  continuam sendo enviados normalmente.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </StoreLayout>
  );
}
