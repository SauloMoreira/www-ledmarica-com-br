import { Link } from "@tanstack/react-router";
import { MessageSquareText, RefreshCw, ShoppingBag } from "lucide-react";

type Props = {
  onReset: () => void;
  whatsappLink: string;
  isApproved: boolean;
};

export function B2BEmptyState({ onReset, whatsappLink, isApproved }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 sm:p-10 text-center mt-6">
      <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center mb-3">
        <ShoppingBag className="w-6 h-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-display font-semibold text-foreground">
        Não encontramos produtos para os filtros selecionados.
      </h3>
      {isApproved ? (
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Não encontrou o item que precisa? Solicite uma negociação B2B pelo WhatsApp.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Tente limpar os filtros ou ver todos os produtos no catálogo.
        </p>
      )}
      <div className="flex flex-wrap justify-center gap-2 mt-5">
        <button
          type="button"
          onClick={onReset}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted transition"
        >
          <RefreshCw className="w-4 h-4" /> Limpar filtros
        </button>
        <Link
          to="/catalogo"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-border bg-background text-sm font-semibold text-foreground hover:bg-muted transition"
        >
          <ShoppingBag className="w-4 h-4" /> Ver todos os produtos
        </Link>
        <a
          data-wa-origin="atacado_sem_resultado"
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:brightness-110 transition shadow-primary"
        >
          <MessageSquareText className="w-4 h-4" /> Falar no WhatsApp
        </a>
      </div>
    </div>
  );
}
