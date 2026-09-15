import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Trash2,
  Plus,
  Minus,
  ShoppingBag,
  ArrowRight,
  AlertCircle,
  Building2,
  BadgePercent,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { useCart, validateB2bLine } from "@/stores/cartStore";
import { formatBRL } from "@/lib/domain";
import { useCartPricing, maskCnpj } from "@/hooks/useCartPricing";
import { describeB2bReason } from "@/lib/b2bPricingShared";
import { CartUpsell } from "@/components/store/CartUpsell";
import { CartBundlePreview } from "@/components/store/CartBundlePreview";
import { getCartBundlePreview } from "@/server/cartBundlePreview.functions";

import { buildSeo } from "@/lib/seo";

export const Route = createFileRoute("/carrinho")({
  head: () => buildSeo({ title: "Carrinho de compras", url: "/carrinho", noindex: true }),
  component: CartPage,
});

function CartPage() {
  const cart = useCart();
  const { pricing } = useCartPricing();

  // Mapa product_id -> linha autoritativa do servidor
  const pricedById = new Map((pricing?.items ?? []).map((p) => [p.product_id, p]));

  const subtotalRetail = pricing?.retail_subtotal ?? cart.subtotal();
  const subtotalApplied = pricing?.applied_subtotal ?? cart.subtotal();
  const b2bSavings = pricing?.b2b_discount_total ?? 0;

  // Prévia de desconto de combo (estimativa, total real é validado no checkout)
  const previewItems = cart.items.map((i) => ({ product_id: i.productId, qty: i.qty }));
  const { data: bundlePreviewRows } = useQuery({
    queryKey: [
      "cart-bundle-preview-summary",
      previewItems.map((i) => `${i.product_id}:${i.qty}`).join("|"),
    ],
    queryFn: () => getCartBundlePreview({ data: { items: previewItems, hasCoupon: false } }),
    enabled: previewItems.length > 0,
    staleTime: 15_000,
  });
  const bundlePreviewSavings = (bundlePreviewRows ?? [])
    .filter((r) => r.status === "eligible_preview")
    .reduce((acc, r) => acc + r.estimated_discount, 0);

  // Estimativa exibida só no resumo do carrinho — o valor real de frete é
  // calculado (Melhor Envio) ou zerado (retirada na loja) já no checkout.
  const shipping = 25;
  const total = Math.max(0, subtotalApplied - bundlePreviewSavings + shipping);

  const hasB2b = cart.hasB2bItems();
  const isB2bContext = hasB2b || cart.lastSource === "b2b";
  const continueLink = isB2bContext ? "/atacado" : "/catalogo";
  const continueLabel = isB2bContext ? "Continuar comprando no atacado" : "Continuar comprando";

  const lineValidations = cart.items.map((i) => ({
    id: i.productId,
    validation: validateB2bLine(i),
  }));
  const hasB2bIssue = lineValidations.some((r) => !r.validation.ok);

  if (cart.items.length === 0) {
    const emptyLink = cart.lastSource === "b2b" ? "/atacado" : "/catalogo";
    const emptyLabel = cart.lastSource === "b2b" ? "Voltar ao atacado" : "Explorar catálogo";
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="w-20 h-20 rounded-full bg-primary-tint flex items-center justify-center mx-auto mb-5">
            <ShoppingBag className="w-9 h-9 text-primary" />
          </div>
          <h1 className="font-display font-bold text-2xl mb-2">Seu carrinho está vazio</h1>
          <p className="text-muted-foreground mb-6">Adicione produtos para continuar.</p>
          <Button asChild size="lg">
            <Link to={emptyLink}>{emptyLabel}</Link>
          </Button>
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8">
        <h1 className="font-display font-bold text-3xl tracking-tight mb-6">Seu carrinho</h1>

        {pricing?.company_approved && pricing.company && (
          <div className="mb-5 rounded-xl border border-primary/30 bg-primary-tint/40 p-4 flex items-start gap-3">
            <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">
                Comprando como empresa: {pricing.company.trade_name || pricing.company.legal_name}
              </p>
              <p className="text-muted-foreground text-xs">
                CNPJ {maskCnpj(pricing.company.cnpj)}
                {pricing.has_b2b_items && <> · Preço empresa aplicado nos itens elegíveis.</>}
              </p>
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl divide-y divide-border">
            {cart.items.map((item) => {
              const v = validateB2bLine(item);
              const invalid = !v.ok;
              const priced = pricedById.get(item.productId);
              const isB2bApplied = priced?.pricing_source === "b2b";
              const appliedUnit = priced?.applied_unit_price ?? item.price;
              const retailUnit = priced?.retail_unit_price ?? item.price;
              const lineSavings = priced?.b2b_discount_total ?? 0;
              const serverReason = priced ? describeB2bReason(priced.reason, priced) : null;
              return (
                <div key={item.productId} className="p-5 flex gap-4">
                  <div className="w-20 h-20 rounded-md bg-surface flex items-center justify-center shrink-0 overflow-hidden">
                    {item.image ? (
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <ShoppingBag className="w-7 h-7 text-text-faint" />
                    )}
                  </div>
                  <div className="flex-1">
                    <Link
                      to="/produto/$slug"
                      params={{ slug: item.slug }}
                      className="text-sm font-medium hover:text-primary line-clamp-2"
                    >
                      {item.name}
                    </Link>
                    <div className="mt-1 mb-3 flex items-baseline gap-2 flex-wrap">
                      <span className="font-display font-bold text-primary">
                        {formatBRL(appliedUnit)}
                      </span>
                      {isB2bApplied && retailUnit > appliedUnit && (
                        <>
                          <span className="text-xs text-text-faint line-through">
                            {formatBRL(retailUnit)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success text-[10px] font-semibold px-2 py-0.5">
                            <BadgePercent className="w-3 h-3" /> Preço empresa
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center border border-border rounded-md">
                        <button
                          onClick={() => cart.updateQty(item.productId, item.qty - 1)}
                          className="w-8 h-8 hover:bg-surface flex items-center justify-center"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-10 text-center text-sm font-medium">{item.qty}</span>
                        <button
                          onClick={() => cart.updateQty(item.productId, item.qty + 1)}
                          className="w-8 h-8 hover:bg-surface flex items-center justify-center"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                      <button
                        onClick={() => cart.removeItem(item.productId)}
                        className="text-text-faint hover:text-destructive p-1.5"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {item.source === "b2b" &&
                      ((item.minQty ?? 1) > 1 || (item.qtyMultiple ?? 1) > 1) && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {(item.minQty ?? 1) > 1 && <>Mín. {item.minQty} un</>}
                          {(item.minQty ?? 1) > 1 && (item.qtyMultiple ?? 1) > 1 && " · "}
                          {(item.qtyMultiple ?? 1) > 1 && <>Múltiplo de {item.qtyMultiple}</>}
                        </p>
                      )}
                    {invalid && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{(v as { ok: false; reason: string }).reason}</span>
                      </div>
                    )}
                    {!invalid && item.source === "b2b" && !isB2bApplied && serverReason && (
                      <div className="mt-2 flex items-start gap-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-1.5 text-xs text-warning-foreground">
                        <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>{serverReason}</span>
                      </div>
                    )}
                    {isB2bApplied && lineSavings > 0 && (
                      <p className="text-xs text-success mt-1.5">
                        Você economiza {formatBRL(lineSavings)} nesta linha.
                      </p>
                    )}
                  </div>
                  <div className="text-right hidden md:block">
                    <div className="font-display font-bold">
                      {formatBRL(appliedUnit * item.qty)}
                    </div>
                    {isB2bApplied && retailUnit > appliedUnit && (
                      <div className="text-xs text-text-faint line-through">
                        {formatBRL(retailUnit * item.qty)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="bg-card border border-border rounded-xl p-6 h-fit sticky top-20">
            <h2 className="font-display font-semibold text-lg mb-4">Resumo</h2>
            <div className="space-y-2.5 text-sm mb-5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatBRL(subtotalRetail)}</span>
              </div>
              {b2bSavings > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto empresa</span>
                  <span>−{formatBRL(b2bSavings)}</span>
                </div>
              )}
              {b2bSavings > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal empresa</span>
                  <span className="font-medium">{formatBRL(subtotalApplied)}</span>
                </div>
              )}
              {bundlePreviewSavings > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto de combo (estimado)</span>
                  <span>−{formatBRL(bundlePreviewSavings)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Frete (estimado)</span>
                <span className="font-medium">{formatBRL(shipping)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Valor final calculado pelo seu CEP no checkout — ou grátis na retirada na loja.
              </p>
              <div className="border-t border-border pt-3 flex justify-between items-end">
                <span className="font-medium">Total</span>
                <span className="font-display font-extrabold text-2xl text-primary">
                  {formatBRL(total)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-right">
                em até 12x de {formatBRL(total / 12)}
              </p>
            </div>
            {hasB2bIssue && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Ajuste a quantidade dos itens em atacado para respeitar mínimo e múltiplo antes de
                  finalizar.
                </span>
              </div>
            )}
            {hasB2bIssue ? (
              <Button size="lg" className="w-full h-12" disabled>
                Finalizar pedido
              </Button>
            ) : (
              <Button asChild size="lg" className="w-full h-12">
                <Link to="/checkout">
                  Finalizar pedido <ArrowRight className="w-4 h-4 ml-1.5" />
                </Link>
              </Button>
            )}
            <Button asChild variant="ghost" size="sm" className="w-full mt-2">
              <Link to={continueLink}>{continueLabel}</Link>
            </Button>
          </aside>
        </div>

        <CartBundlePreview />
        <CartUpsell />
      </div>
    </StoreLayout>
  );
}
