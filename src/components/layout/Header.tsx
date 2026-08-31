import { Link } from "@tanstack/react-router";
import { ShoppingCart, User as UserIcon, Menu, Sparkles, Shield } from "lucide-react";
import { useCart } from "@/stores/cartStore";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import { STORE_NAME } from "@/lib/domain";
import { SearchAutocomplete } from "@/components/store/SearchAutocomplete";
import logoNavbar from "@/assets/logo-navbar.webp";

export function Header() {
  const cart = useCart();
  const { user } = useAuth();
  const isAdmin = useIsAdmin();
  const count = cart.count();

  return (
    <header
      className="sticky top-0 z-50 bg-card border-b border-border"
      style={{ boxShadow: "0 1px 4px rgba(15,23,42,.06)" }}
    >
      <div className="container mx-auto px-4 h-16 flex items-center gap-4 sm:gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center shrink-0" aria-label={STORE_NAME}>
          <img
            src={logoNavbar}
            alt={STORE_NAME}
            width={132}
            height={44}
            loading="eager"
            decoding="async"
            className="h-11 w-auto object-contain"
          />
        </Link>

        {/* Busca desktop */}
        <SearchAutocomplete className="flex-1 max-w-xl hidden md:block" />

        {/* Nav links desktop */}
        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-muted-foreground">
          <Link
            to="/"
            className="hover:text-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
            activeOptions={{ exact: true }}
          >
            Início
          </Link>
          <Link
            to="/catalogo"
            className="hover:text-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
          >
            Catálogo
          </Link>
          <Link
            to={"/atacado" as any}
            className="hover:text-foreground transition-colors"
            activeProps={{ className: "text-primary" }}
          >
            Atacado
          </Link>
        </nav>

        {/* Ações */}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="hidden md:inline-flex h-9 gap-1.5 border-primary/30 text-primary hover:bg-primary-tint hover:text-primary"
            onClick={() => {
              if (typeof window !== "undefined") window.dispatchEvent(new Event("open-chat"));
            }}
          >
            <Sparkles className="w-3.5 h-3.5" /> Falar com IA
          </Button>
          {isAdmin && (
            <Link to={"/admin" as any} aria-label="Admin">
              <Button variant="ghost" size="icon" className="h-9 w-9 text-primary">
                <Shield className="w-5 h-5" />
              </Button>
            </Link>
          )}
          <Link to={user ? "/conta" : "/login"} aria-label="Conta">
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <UserIcon className="w-5 h-5" />
            </Button>
          </Link>
          <button
            onClick={cart.open}
            className="relative h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-surface transition-colors"
            aria-label="Carrinho"
          >
            <ShoppingCart className="w-5 h-5" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
          <Button variant="ghost" size="icon" className="h-9 w-9 lg:hidden" aria-label="Menu de navegação">
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Busca mobile (linha extra abaixo do header) */}
      <div className="md:hidden border-t border-border px-4 py-2 bg-card">
        <SearchAutocomplete placeholder="Buscar produtos…" />
      </div>
    </header>
  );
}
