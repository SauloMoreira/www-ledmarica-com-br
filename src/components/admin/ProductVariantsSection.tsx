import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Loader2, Plus, Layers, Unlink, ExternalLink, Images } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/domain";
import { ProductImageManager } from "@/components/admin/ProductImageManager";
import {
  adminCreateVariant,
  adminGetVariantOption,
  adminListFamilyVariants,
  adminUnlinkVariant,
  adminUpsertVariantOption,
} from "@/server/productVariants.functions";

type Props = { productId: string; brand?: string | null; category?: string | null };

export function ProductVariantsSection({ productId, brand, category }: Props) {
  const qc = useQueryClient();
  const optionKey = ["admin-variant-option", productId];
  const listKey = ["admin-variant-family", productId];

  const optionQuery = useQuery({
    queryKey: optionKey,
    queryFn: () => adminGetVariantOption({ data: { productId } }),
  });

  const hasOption = !!optionQuery.data?.option;

  const familyQuery = useQuery({
    queryKey: listKey,
    queryFn: () => adminListFamilyVariants({ data: { productId } }),
    enabled: hasOption,
  });

  const [optionTitle, setOptionTitle] = useState("Cor");
  const [showNew, setShowNew] = useState(false);
  const [variantValue, setVariantValue] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockQty, setStockQty] = useState("0");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: optionKey });
    qc.invalidateQueries({ queryKey: listKey });
  };

  const optionMut = useMutation({
    mutationFn: () =>
      adminUpsertVariantOption({
        data: { productId, optionTitle: optionTitle.trim(), displayType: "text_chip" },
      }),
    onSuccess: () => {
      toast.success("Opção de variação configurada");
      invalidate();
    },
    onError: () => toast.error("Não foi possível configurar a opção de variação."),
  });

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateVariant({
        data: {
          baseProductId: productId,
          variantValue: variantValue.trim(),
          price: Number(price.replace(",", ".")) || 0,
          costPrice: costPrice.trim() ? Number(costPrice.replace(",", ".")) : null,
          stockQty: Math.max(0, Math.round(Number(stockQty) || 0)),
        },
      }),
    onSuccess: (created) => {
      toast.success("Variação criada", {
        description: "Adicione as imagens abaixo. Descrição e SEO no cadastro completo.",
        action: {
          label: "Completar cadastro",
          onClick: () => {
            window.location.href = `/admin/produtos/${created.id}`;
          },
        },
      });
      setShowNew(false);
      setVariantValue("");
      setPrice("");
      setCostPrice("");
      setStockQty("0");
      setExpandedId(created.id);
      invalidate();
    },
    onError: (err: Error) => {
      if (err.message === "option_not_configured") {
        toast.error("Configure primeiro a opção de variação (ex.: Cor).");
      } else {
        toast.error("Não foi possível criar a variação.");
      }
    },
  });

  const unlinkMut = useMutation({
    mutationFn: (id: string) => adminUnlinkVariant({ data: { productId: id } }),
    onSuccess: () => {
      toast.success("Variação desvinculada");
      invalidate();
    },
    onError: () => toast.error("Não foi possível desvincular a variação."),
  });

  if (optionQuery.isLoading) {
    return (
      <div className="rounded-lg border bg-card p-4 sm:p-6 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando variações...
      </div>
    );
  }

  if (optionQuery.isError) {
    return (
      <div className="rounded-lg border bg-card p-4 sm:p-6 text-sm text-destructive">
        Não foi possível carregar as variações deste produto.
      </div>
    );
  }

  const members = familyQuery.data?.members ?? [];
  const title = optionQuery.data?.option?.option_title ?? "";

  return (
    <div className="rounded-lg border bg-card p-4 sm:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Layers className="h-4 w-4" /> Variações do produto
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            Agrupe versões do mesmo produto (ex.: Cor = Vermelho, Branco, Azul). Cada variação é um
            produto completo, com preço, custo, estoque e imagens próprios.
          </p>
        </div>
        {hasOption && (
          <Button type="button" size="sm" variant="outline" onClick={() => setShowNew((v) => !v)}>
            <Plus className="h-4 w-4 mr-2" /> Nova variação
          </Button>
        )}
      </div>

      {!hasOption && (
        <div className="rounded-md border border-dashed bg-muted/30 p-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Este produto ainda não faz parte de uma família de variações. Defina o título da opção
            para começar.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="variant-option-title" className="text-xs">
                Título da opção
              </Label>
              <Input
                id="variant-option-title"
                value={optionTitle}
                onChange={(e) => setOptionTitle(e.target.value)}
                placeholder="Ex.: Cor"
                className="h-9 w-48"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={() => optionMut.mutate()}
              disabled={optionMut.isPending || optionTitle.trim().length < 2}
            >
              {optionMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Configurar variações
            </Button>
          </div>
        </div>
      )}

      {hasOption && showNew && (
        <div className="rounded-md border bg-muted/30 p-3 grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">{title}</Label>
            <Input
              value={variantValue}
              onChange={(e) => setVariantValue(e.target.value)}
              placeholder="Ex.: Vermelho"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço (R$)</Label>
            <Input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder="0,00"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Custo (R$)</Label>
            <Input
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              inputMode="decimal"
              placeholder="opcional"
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Estoque</Label>
            <Input
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value)}
              inputMode="numeric"
              className="h-9"
            />
          </div>
          <div className="sm:col-span-4 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !variantValue.trim() || !price.trim()}
            >
              {createMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar variação
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowNew(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {hasOption && familyQuery.isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando família...
        </div>
      )}

      {hasOption && !familyQuery.isLoading && members.length <= 1 && (
        <p className="text-xs text-muted-foreground">
          Nenhuma variação cadastrada ainda. Use "Nova variação" para adicionar a primeira.
        </p>
      )}

      {hasOption && members.length > 1 && (
        <ul className="grid gap-2 sm:grid-cols-2">
          {members.map((m) => (
            <li
              key={m.id}
              className={`flex items-center gap-3 rounded border p-2 ${m.id === productId ? "border-primary bg-primary/5" : "bg-background"}`}
            >
              {m.image ? (
                <img
                  src={m.image}
                  alt={m.name}
                  className="w-10 h-10 rounded object-cover border"
                  loading="lazy"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-muted border border-dashed" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{m.name}</div>
                <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                  <span>
                    {title}: {Object.values(m.variant_attributes)[0] ?? (m.is_parent ? "—" : "?")}
                  </span>
                  <span>{formatBRL(m.sale_price ?? m.price)}</span>
                  <span>Estoque: {m.stock_qty}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant={m.active ? "default" : "secondary"} className="text-[10px]">
                  {m.active ? "Ativo" : "Inativo"}
                </Badge>
                {m.is_parent && (
                  <Badge variant="outline" className="text-[10px]">
                    Principal
                  </Badge>
                )}
                {m.id !== productId && (
                  <Button asChild size="icon" variant="ghost" title="Abrir cadastro">
                    <Link to="/admin/produtos/$id" params={{ id: m.id }}>
                      <ExternalLink className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
                {!m.is_parent && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    title="Desvincular variação"
                    disabled={unlinkMut.isPending}
                    onClick={() => {
                      if (confirm(`Desvincular "${m.name}" da família de variações?`)) {
                        unlinkMut.mutate(m.id);
                      }
                    }}
                  >
                    <Unlink className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
