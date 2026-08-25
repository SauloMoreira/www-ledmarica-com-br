import { useState } from "react";
import { Sparkles, Loader2, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  improveInstitutionalPageSeo,
  boostInstitutionalPageSeoAuto,
} from "@/server/institutionalSeo.functions";
import { toast } from "sonner";

interface Props {
  pageId?: string; // se presente (página já salva), habilita o botão "Boost SEO"
  pageCtx: {
    title: string;
    excerpt?: string | null;
    content?: string | null;
  };
  seoTitle: string;
  seoDescription: string;
  slug: string;
  onChange: (field: "seo_title" | "seo_description", value: string) => void;
  onBoosted?: () => void;
}

export function InstitutionalSEOSection({
  pageId,
  pageCtx,
  seoTitle,
  seoDescription,
  slug,
  onChange,
  onBoosted,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [boosting, setBoosting] = useState(false);

  async function boostFull() {
    if (!pageId) return;
    setBoosting(true);
    try {
      const r = await boostInstitutionalPageSeoAuto({ data: { id: pageId } });
      if (!r.ok) {
        toast.error(r.error);
      } else {
        onChange("seo_title", r.title);
        onChange("seo_description", r.description);
        toast.success("SEO turbinado: título e descrição salvos");
        onBoosted?.();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao turbinar SEO");
    } finally {
      setBoosting(false);
    }
  }

  async function improve() {
    if (!pageCtx.title.trim()) {
      toast.error("Preencha o título da página antes de gerar o SEO.");
      return;
    }
    setLoading(true);
    try {
      const r = await improveInstitutionalPageSeo({
        data: {
          title: pageCtx.title,
          excerpt: pageCtx.excerpt || null,
          content: pageCtx.content || null,
          slug: slug || null,
        },
      });
      if (!r.ok) {
        toast.error(r.error);
      } else {
        onChange("seo_title", r.title);
        onChange("seo_description", r.description);
        toast.success("SEO gerado com IA");
      }
    } finally {
      setLoading(false);
    }
  }

  const titleLen = seoTitle.length;
  const descLen = seoDescription.length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">SEO</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Campos para o Google. Se em branco, usamos o título e o resumo da página.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={improve}
            disabled={loading || boosting}
            className="border-primary/40 text-primary hover:bg-primary-tint hover:text-primary"
          >
            {loading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Melhorar com IA
              </>
            )}
          </Button>
          {pageId && (
            <Button
              type="button"
              size="sm"
              onClick={boostFull}
              disabled={loading || boosting}
              className="bg-primary text-primary-foreground hover:brightness-110"
            >
              {boosting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  Turbinando…
                </>
              ) : (
                <>
                  <Rocket className="w-3.5 h-3.5 mr-1.5" />
                  Boost SEO
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo_title">SEO title</Label>
        <Input
          id="seo_title"
          maxLength={200}
          value={seoTitle}
          onChange={(e) => onChange("seo_title", e.target.value)}
          placeholder={`Ex: ${pageCtx.title || "Sobre nós"} | Led Maricá`}
        />
        <div
          className={`text-[10px] text-right ${titleLen > 60 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {titleLen}/60 caracteres
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="seo_description">SEO description</Label>
        <Textarea
          id="seo_description"
          rows={3}
          maxLength={300}
          value={seoDescription}
          onChange={(e) => onChange("seo_description", e.target.value)}
          placeholder="Ex: Conheça a Led Maricá, especialista em material elétrico e iluminação em Maricá/RJ."
        />
        <div
          className={`text-[10px] text-right ${descLen > 160 ? "text-destructive" : "text-muted-foreground"}`}
        >
          {descLen}/160 caracteres
        </div>
      </div>

      {(seoTitle || seoDescription) && (
        <div className="rounded-lg border border-border bg-surface p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Preview no Google
          </div>
          <div className="text-[15px] text-[#1a0dab] leading-snug">
            {seoTitle || `${pageCtx.title} | Led Maricá`}
          </div>
          <div className="text-[12px] text-[#006621] mt-0.5">
            www.ledmarica.com.br/institucional/{slug || "pagina"}
          </div>
          <div className="text-[12.5px] text-[#545454] leading-snug mt-1">
            {seoDescription || pageCtx.excerpt?.slice(0, 160) || "Sem descrição"}
          </div>
        </div>
      )}
    </div>
  );
}
