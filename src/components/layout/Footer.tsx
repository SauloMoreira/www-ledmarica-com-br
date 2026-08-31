import { Link } from "@tanstack/react-router";
import { MessageCircle, Instagram, Facebook } from "lucide-react";
import { STORE_NAME, STORE_WHATSAPP } from "@/lib/domain";
import logoFooter from "@/assets/logo-footer.webp";

export function Footer() {
  const openCookiePreferences = () => {
    void import("@/stores/cookieStore").then(({ useCookieStore }) => {
      useCookieStore.getState().openPreferences();
    });
  };

  return (
    <footer
      className="mt-24 text-slate-100 relative"
      style={{
        background: "linear-gradient(135deg, #0F172A 0%, #111827 100%)",
      }}
    >
      {/* Sutil brilho superior para profundidade */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, rgba(96,165,250,0.35) 50%, transparent 100%)",
        }}
      />

      <div className="container mx-auto px-4 py-12 md:py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-10">
          {/* Marca */}
          <div className="col-span-2 md:col-span-1">
            <div className="bg-white/95 rounded-xl p-3 inline-block mb-5 shadow-lg shadow-black/20 ring-1 ring-white/10">
              <img
                src={logoFooter}
                alt={STORE_NAME}
                width={352}
                height={163}
                loading="lazy"
                decoding="async"
                className="w-44 h-auto object-contain"
              />
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-5">
              Qualidade que ilumina o seu projeto.
            </p>
            <a
              href={`https://wa.me/${STORE_WHATSAPP}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-100 hover:text-[#60A5FA] transition-colors"
            >
              <MessageCircle className="w-4 h-4" /> (21) 98212-6467
            </a>
            <div className="flex gap-2.5 mt-5">
              <a
                href="#"
                aria-label="Instagram"
                className="w-9 h-9 rounded-full bg-white/5 ring-1 ring-white/10 hover:bg-[#60A5FA]/15 hover:ring-[#60A5FA]/40 hover:text-[#60A5FA] flex items-center justify-center transition-all duration-300"
              >
                <Instagram className="w-4 h-4" />
              </a>
              <a
                href="#"
                aria-label="Facebook"
                className="w-9 h-9 rounded-full bg-white/5 ring-1 ring-white/10 hover:bg-[#60A5FA]/15 hover:ring-[#60A5FA]/40 hover:text-[#60A5FA] flex items-center justify-center transition-all duration-300"
              >
                <Facebook className="w-4 h-4" />
              </a>
            </div>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold text-[11px] mb-5 uppercase tracking-[0.18em] text-slate-400">
              Links
            </h4>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>
                <Link to="/catalogo" className="hover:text-[#60A5FA] transition-colors">
                  Catálogo
                </Link>
              </li>
              <li>
                <Link to="/combos" className="hover:text-[#60A5FA] transition-colors">
                  Kits e Combos
                </Link>
              </li>
              <li>
                <Link to="/atacado" className="hover:text-[#60A5FA] transition-colors">
                  Atacado
                </Link>
              </li>
              <li>
                <Link to="/contato" className="hover:text-[#60A5FA] transition-colors">
                  Contato
                </Link>
              </li>
              <li>
                <Link to="/condicoes-de-uso" className="hover:text-[#60A5FA] transition-colors">
                  Condições de Uso
                </Link>
              </li>
              <li>
                <Link to="/meios-de-pagamento" className="hover:text-[#60A5FA] transition-colors">
                  Meios de Pagamento
                </Link>
              </li>
              <li>
                <Link to="/reembolso" className="hover:text-[#60A5FA] transition-colors">
                  Reembolso
                </Link>
              </li>
              <li>
                <Link to="/troca" className="hover:text-[#60A5FA] transition-colors">
                  Troca
                </Link>
              </li>
              <li>
                <Link to="/devolucao" className="hover:text-[#60A5FA] transition-colors">
                  Devolução
                </Link>
              </li>
              <li>
                <Link to="/privacidade" className="hover:text-[#60A5FA] transition-colors">
                  Política de Privacidade
                </Link>
              </li>
              <li>
                <button
                  type="button"
                  onClick={openCookiePreferences}
                  className="hover:text-[#60A5FA] transition-colors text-left"
                >
                  Gerenciar cookies
                </button>
              </li>
            </ul>
          </div>

          {/* Categorias */}
          <div>
            <h4 className="font-display font-semibold text-[11px] mb-5 uppercase tracking-[0.18em] text-slate-400">
              Categorias
            </h4>
            <ul className="space-y-3 text-sm text-slate-300">
              <li>
                <Link
                  to="/catalogo"
                  search={{ cat: "iluminacao-led" } as any}
                  className="hover:text-[#60A5FA] transition-colors"
                >
                  Iluminação LED
                </Link>
              </li>
              <li>
                <Link
                  to="/catalogo"
                  search={{ cat: "disjuntores" } as any}
                  className="hover:text-[#60A5FA] transition-colors"
                >
                  Disjuntores
                </Link>
              </li>
              <li>
                <Link
                  to="/catalogo"
                  search={{ cat: "fios-e-cabos" } as any}
                  className="hover:text-[#60A5FA] transition-colors"
                >
                  Fios e Cabos
                </Link>
              </li>
              <li>
                <Link
                  to="/catalogo"
                  search={{ cat: "refletores" } as any}
                  className="hover:text-[#60A5FA] transition-colors"
                >
                  Refletores
                </Link>
              </li>
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="font-display font-semibold text-[11px] mb-5 uppercase tracking-[0.18em] text-slate-400">
              Informações
            </h4>
            <p className="text-xs text-slate-400 mb-3">Pagamento seguro · até 12x sem juros</p>
            <div className="flex flex-wrap gap-1.5 mb-5">
              {["Visa", "Master", "PIX", "Boleto"].map((p) => (
                <span
                  key={p}
                  className="text-[10px] font-bold tracking-wide bg-white/5 text-slate-200 ring-1 ring-white/10 px-2.5 py-1 rounded-md"
                >
                  {p}
                </span>
              ))}
            </div>
            <p className="text-xs text-slate-400">Maricá — RJ</p>
          </div>
        </div>

        <div className="border-t border-white/10 mt-14 pt-6 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-slate-400">
          <div>
            © {new Date().getFullYear()} <span className="text-slate-200">{STORE_NAME}</span> · Maricá / RJ
          </div>
          <div>
            Desenvolvido por <span className="font-semibold text-slate-100">SC Moreira Tech</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
