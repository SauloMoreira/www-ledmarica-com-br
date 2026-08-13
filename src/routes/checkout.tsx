import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Truck,
  CreditCard,
  ShoppingBag,
  Store,
  Building2,
  BadgePercent,
} from "lucide-react";
import { toast } from "sonner";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/stores/cartStore";
import { formatBRL } from "@/lib/domain";
import {
  lookupCep,
  calculateShipping,
  applyCoupon,
  createOrder,
  lookupLocalDeliveryZone,
} from "@/server/checkout.functions";
import { getCartBundlePreview } from "@/server/cartBundlePreview.functions";
import { createMercadoPagoPreference } from "@/server/payment.functions";
import { getPublicCompanySettings } from "@/server/institutional.functions";
import { useCartPricing, maskCnpj } from "@/hooks/useCartPricing";
import { buildSeo } from "@/lib/seo";
import { trackPurchase, trackBeginCheckout } from "@/lib/tracking";
import { redirectToExternalCheckout } from "@/lib/externalCheckout";

export const Route = createFileRoute("/checkout")({
  head: () => buildSeo({ title: "Finalizar pedido", url: "/checkout", noindex: true }),
  component: CheckoutPage,
});

type ShippingService = { id: string; name: string; carrier: string; price: number; days: number };

function formatCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function CheckoutPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);

  // Modalidade de entrega
  const [deliveryMethod, setDeliveryMethod] = useState<"delivery" | "local_delivery" | "pickup">(
    "delivery",
  );

  // Zona de frete local (Maricá/RJ) detectada após CEP
  type LocalZone = {
    zoneId: string;
    displayName: string;
    district: string;
    price: number;
    eta: string | null;
  };
  const [localZone, setLocalZone] = useState<LocalZone | null>(null);
  const [localZoneChecking, setLocalZoneChecking] = useState(false);

  // Dados públicos da empresa (para info de retirada)
  const { data: companyData } = useQuery({
    queryKey: ["public-company"],
    queryFn: () => getPublicCompanySettings(),
  });
  const company = companyData?.company as
    | (Record<string, string | boolean | null> & { pickup_enabled?: boolean | null })
    | null
    | undefined;
  const pickupEnabled = Boolean(company?.pickup_enabled);

  // Endereço
  const [zip, setZip] = useState("");
  const [zipLoading, setZipLoading] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [saveAddress, setSaveAddress] = useState(true);

  // Frete
  const [shippingOptions, setShippingOptions] = useState<ShippingService[]>([]);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [selectedShipping, setSelectedShipping] = useState<ShippingService | null>(null);

  // Cupom
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  // true quando o cupom aplicado veio da regra automática (ex.: Pix), não digitado
  const [couponIsAuto, setCouponIsAuto] = useState(false);

  // Forma de pagamento pretendida (obrigatória para finalizar)
  const [paymentChoice, setPaymentChoice] = useState<"pix" | "other" | null>(null);
  const [paymentChoiceLoading, setPaymentChoiceLoading] = useState(false);


  const [notes, setNotes] = useState("");

  const isPickup = deliveryMethod === "pickup";
  const isLocal = deliveryMethod === "local_delivery";
  const shippingCost = isPickup
    ? 0
    : isLocal
      ? (localZone?.price ?? 0)
      : (selectedShipping?.price ?? 0);

  const { pricing, refetch: refetchPricing } = useCartPricing();
  const subtotalRetail = pricing?.retail_subtotal ?? cart.subtotal();
  const subtotal = pricing?.applied_subtotal ?? cart.subtotal();
  const b2bSavings = pricing?.b2b_discount_total ?? 0;
  const isB2bOrder = Boolean(pricing?.has_b2b_items);

  // Prévia de desconto de combo no checkout (estimativa; backend recalcula em createOrder)
  const previewItems = cart.items.map((i) => ({ product_id: i.productId, qty: i.qty }));
  const { data: bundlePreviewRows } = useQuery({
    queryKey: [
      "checkout-bundle-preview",
      couponCode ?? "",
      previewItems.map((i) => `${i.product_id}:${i.qty}`).join("|"),
    ],
    queryFn: () =>
      getCartBundlePreview({ data: { items: previewItems, hasCoupon: Boolean(couponCode) } }),
    enabled: previewItems.length > 0,
    staleTime: 15_000,
  });
  const bundleDiscountPreview = (bundlePreviewRows ?? [])
    .filter((r) => r.status === "eligible_preview")
    .reduce((acc, r) => acc + r.estimated_discount, 0);

  const total = useMemo(
    () => Math.max(0, subtotal - discount - bundleDiscountPreview + shippingCost),
    [subtotal, discount, bundleDiscountPreview, shippingCost],
  );

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!loading && user && cart.items.length === 0) navigate({ to: "/carrinho" });
  }, [user, loading, cart.items.length, navigate]);

  useEffect(() => {
    if (!loading && user && cart.items.length > 0) {
      trackBeginCheckout(subtotal, cart.items.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  useEffect(() => {
    if (user?.user_metadata?.name) setRecipient(user.user_metadata.name as string);
  }, [user]);

  async function checkLocalZone(opts: { city: string; state: string; neighborhood: string }) {
    if (!opts.neighborhood || !opts.city || !opts.state) {
      setLocalZone(null);
      return;
    }
    setLocalZoneChecking(true);
    try {
      const r = await lookupLocalDeliveryZone({
        data: { city: opts.city, state: opts.state, neighborhood: opts.neighborhood },
      });
      if (r.ok) {
        setLocalZone({
          zoneId: r.zoneId,
          displayName: r.displayName,
          district: r.district,
          price: r.price,
          eta: r.eta,
        });
      } else {
        setLocalZone(null);
      }
    } catch {
      setLocalZone(null);
    } finally {
      setLocalZoneChecking(false);
    }
  }

  async function handleZipBlur() {
    const clean = zip.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setZipLoading(true);
    try {
      const r = await lookupCep({ data: { cep: clean } });
      if (r.ok) {
        setStreet(r.street);
        setNeighborhood(r.neighborhood);
        setCity(r.city);
        setState(r.state);
        // Tenta detectar zona local automaticamente (Maricá/RJ etc.)
        await checkLocalZone({ city: r.city, state: r.state, neighborhood: r.neighborhood });
      } else {
        toast.error(r.error);
        setLocalZone(null);
      }
    } finally {
      setZipLoading(false);
    }
  }

  // Refazer lookup quando o cliente edita manualmente o bairro/cidade/UF
  async function handleNeighborhoodBlur() {
    if (!neighborhood || !city || !state) return;
    await checkLocalZone({ city, state, neighborhood });
  }

  async function goToShipping() {
    if (isPickup) {
      if (!recipient.trim()) {
        toast.error("Informe o nome de quem irá retirar o pedido.");
        return;
      }
      setSelectedShipping(null);
      setShippingOptions([]);
      setStep(3);
      return;
    }
    const cleanZip = zip.replace(/\D/g, "");
    if (!recipient || !cleanZip || !street || !number || !city || !state) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    if (cleanZip.length !== 8) {
      toast.error("CEP deve ter 8 dígitos");
      return;
    }
    setStep(2);
    setShippingLoading(true);
    try {
      // Garante lookup atualizado da zona local (caso bairro tenha sido editado)
      let zone = localZone;
      if (!zone && neighborhood && city && state) {
        try {
          const lz = await lookupLocalDeliveryZone({ data: { city, state, neighborhood } });
          if (lz.ok) {
            zone = {
              zoneId: lz.zoneId,
              displayName: lz.displayName,
              district: lz.district,
              price: lz.price,
              eta: lz.eta,
            };
            setLocalZone(zone);
          }
        } catch {
          /* ignore */
        }
      }

      const weight = cart.items.reduce((s, i) => s + i.qty * 0.5, 0);
      const eligibleSubtotal = cart.items
        .filter((i) => i.freeShippingEligible)
        .reduce((s, i) => s + i.price * i.qty, 0);
      const r = await calculateShipping({
        data: { zipCode: cleanZip, subtotal, weightKg: Math.max(0.5, weight), eligibleSubtotal },
      });
      if ("error" in r && r.error) {
        toast.error(r.error);
        setShippingOptions([]);
        setSelectedShipping(null);
        setStep(1);
        return;
      }

      // Adiciona opção de Frete Local se zona configurada e ativa
      const services: ShippingService[] = [];
      if (zone) {
        services.push({
          id: "local-zone",
          name: `Frete Local Maricá — ${zone.displayName}`,
          carrier: "Frete Local Maricá/RJ",
          price: zone.price,
          days: 1,
        });
      }
      services.push(...r.services);

      setShippingOptions(services);
      // Pré-seleciona frete local se disponível, senão a primeira opção
      setSelectedShipping(services[0] ?? null);
      setDeliveryMethod(services[0]?.id === "local-zone" ? "local_delivery" : "delivery");
    } catch {
      toast.error("Erro ao calcular frete");
    } finally {
      setShippingLoading(false);
    }
  }

  function handleSelectShipping(s: ShippingService) {
    setSelectedShipping(s);
    setDeliveryMethod(s.id === "local-zone" ? "local_delivery" : "delivery");
  }

  async function handleApplyCoupon() {
    if (!couponInput.trim()) return;
    setCouponLoading(true);
    try {
      const r = await applyCoupon({ data: { code: couponInput.trim(), subtotal } });
      if (r.valid) {
        // Cupom manual sempre prevalece sobre o automático.
        setCouponCode(couponInput.trim());
        setDiscount(r.discount);
        setCouponIsAuto(false);
        toast.success(r.message);
      } else {
        if (!couponIsAuto) {
          setCouponCode(null);
          setDiscount(0);
        }
        toast.error(r.message);
      }
    } finally {
      setCouponLoading(false);
    }
  }

  async function handleSelectPayment(choice: "pix" | "other") {
    if (paymentChoiceLoading) return;
    setPaymentChoice(choice);

    if (choice === "other") {
      // Remove apenas o desconto automático — cupom manual permanece.
      if (couponIsAuto) {
        setCouponCode(null);
        setDiscount(0);
        setCouponIsAuto(false);
      }
      return;
    }

    // Pix: só aplica automático se não houver cupom manual válido aplicado.
    if (couponCode && !couponIsAuto) return;
    setPaymentChoiceLoading(true);
    try {
      const { code } = await getAutoCouponCode({
        data: { conditionType: "payment_method", conditionValue: "pix" },
      });
      if (!code) return;
      const r = await applyCoupon({ data: { code, subtotal } });
      if (r.valid) {
        setCouponCode(code);
        setDiscount(r.discount);
        setCouponIsAuto(true);
      }
    } catch {
      // silencioso: ausência de desconto automático não impede o checkout
    } finally {
      setPaymentChoiceLoading(false);
    }
  }


  async function handleSubmit() {
    if (!isPickup && !selectedShipping) return;
    if (submitting) return;
    setSubmitting(true);
    try {
      // Re-valida pricing com o backend antes de criar o pedido para garantir
      // que o usuário não veja preço antigo enquanto o servidor recalcula.
      refetchPricing();

      const r = await createOrder({
        data: {
          items: cart.items.map((i) => ({
            productId: i.productId,
            name: i.name,
            image: i.image ?? null,
            unitPrice: i.price,
            qty: i.qty,
          })),
          deliveryMethod,
          shipping: isPickup
            ? null
            : {
                carrier: selectedShipping!.carrier,
                service: selectedShipping!.name,
                cost: selectedShipping!.price,
                localZoneId: isLocal ? (localZone?.zoneId ?? null) : null,
              },
          address: {
            recipient,
            zipCode: isPickup ? "" : zip.replace(/\D/g, ""),
            street: isPickup ? null : street,
            number: isPickup ? null : number,
            complement: complement || null,
            neighborhood: isPickup ? null : neighborhood || null,
            city: isPickup ? null : city,
            state: isPickup ? null : state,
            saveAddress: isPickup ? false : saveAddress,
          },
          couponCode,
          notes: notes || null,
          tracking: (await import("@/lib/leadTracking")).getLeadTrackingPayload(),
        },
      });
      if (r.ok) {
        trackPurchase({ order_number: r.orderId, total: cart.subtotal(), items: cart.items });
        // Criar preference do Mercado Pago e redirecionar (mesma aba)
        try {
          const pref = await createMercadoPagoPreference({ data: { orderId: r.orderId } });
          if (pref.ok && pref.checkoutUrl) {
            cart.clear();
            redirectToExternalCheckout(pref.checkoutUrl);
            return; // navegação em curso, mantém botão desabilitado
          }
          toast.error(
            "Não foi possível iniciar o pagamento pelo Mercado Pago. Tente novamente em alguns instantes.",
          );
        } catch (err) {
          if (import.meta.env.DEV) console.error("[MP createPreference]", err);
          toast.error(
            "Não foi possível iniciar o pagamento pelo Mercado Pago. Tente novamente em alguns instantes.",
          );
        }
        // Fallback: leva para a página do pedido onde há botão para retomar
        cart.clear();
        navigate({ to: "/pedido/$id/confirmacao", params: { id: r.orderId } });
      } else {
        toast.error(r.error);
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error("[checkout]", e);
      toast.error(e instanceof Error ? e.message : "Erro ao finalizar pedido");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !user) {
    return (
      <StoreLayout>
        <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
          Carregando...
        </div>
      </StoreLayout>
    );
  }

  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <Link
          to="/carrinho"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" /> Voltar ao carrinho
        </Link>

        {/* Stepper */}
        <div className="flex items-center justify-center mb-8 gap-1.5 sm:gap-6 flex-wrap">
          {[
            { n: 1, label: "Endereço", icon: MapPin },
            { n: 2, label: "Frete", icon: Truck },
            { n: 3, label: "Pagamento", icon: CreditCard },
          ].map((s, idx) => (
            <div key={s.n} className="flex items-center gap-1.5 sm:gap-2">
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-colors shrink-0 ${
                  step >= s.n ? "bg-primary text-primary-foreground" : "bg-surface text-text-faint"
                }`}
              >
                {step > s.n ? <Check className="w-4 h-4" /> : <s.icon className="w-4 h-4" />}
              </div>
              <span
                className={`text-xs sm:text-sm font-medium hidden sm:inline ${step >= s.n ? "text-foreground" : "text-muted-foreground"}`}
              >
                {s.label}
              </span>
              {idx < 2 && <div className="w-4 sm:w-12 h-px bg-border mx-0.5 sm:mx-1" />}
            </div>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4 sm:p-6">
            {step === 1 && (
              <>
                <h2 className="font-display font-bold text-xl mb-4">Como você quer receber?</h2>

                {/* Toggle entrega vs retirada */}
                <div className={`grid gap-2.5 mb-5 ${pickupEnabled ? "sm:grid-cols-2" : ""}`}>
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod("delivery")}
                    className={`flex items-start gap-3 p-3.5 border rounded-lg text-left transition-colors ${
                      !isPickup
                        ? "border-primary bg-primary-tint"
                        : "border-border hover:border-primary/40"
                    }`}
                  >
                    <Truck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-medium text-sm">Receber em casa</div>
                      <div className="text-xs text-muted-foreground">Frete calculado pelo CEP</div>
                    </div>
                  </button>
                  {pickupEnabled && (
                    <button
                      type="button"
                      onClick={() => setDeliveryMethod("pickup")}
                      className={`flex items-start gap-3 p-3.5 border rounded-lg text-left transition-colors ${
                        isPickup
                          ? "border-primary bg-primary-tint"
                          : "border-border hover:border-primary/40"
                      }`}
                    >
                      <Store className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm">
                          Retirar na loja <span className="text-success">· Grátis</span>
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-2">
                          {(company?.pickup_store_name as string) || "Retirada presencial"}
                          {company?.pickup_ready_eta ? ` · ${company.pickup_ready_eta}` : ""}
                        </div>
                      </div>
                    </button>
                  )}
                </div>

                {isPickup ? (
                  <>
                    <h3 className="font-semibold text-sm mb-3 mt-2">Quem irá retirar?</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label htmlFor="recipient">Nome completo</Label>
                        <Input
                          id="recipient"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <div className="mt-5 p-4 rounded-lg bg-surface border border-border text-sm space-y-1.5">
                      <div className="flex items-center gap-2 font-medium">
                        <Store className="w-4 h-4 text-primary" />
                        {(company?.pickup_store_name as string) || "Local de retirada"}
                      </div>
                      {company?.pickup_address && (
                        <p className="text-muted-foreground whitespace-pre-line">
                          {company.pickup_address as string}
                        </p>
                      )}
                      {company?.pickup_phone && (
                        <p className="text-muted-foreground">📞 {company.pickup_phone as string}</p>
                      )}
                      {company?.pickup_business_hours && (
                        <p className="text-muted-foreground">
                          🕒 {company.pickup_business_hours as string}
                        </p>
                      )}
                      {company?.pickup_instructions && (
                        <p className="text-muted-foreground whitespace-pre-line mt-2">
                          {company.pickup_instructions as string}
                        </p>
                      )}
                      <p className="text-xs text-warning mt-2">
                        ⚠️ Aguarde a confirmação de disponibilidade antes de comparecer à loja.
                      </p>
                    </div>
                    <Button onClick={goToShipping} size="lg" className="w-full mt-6 h-12">
                      Revisar pedido <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-sm mb-3 mt-2">Endereço de entrega</h3>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2">
                        <Label htmlFor="recipient">Destinatário</Label>
                        <Input
                          id="recipient"
                          value={recipient}
                          onChange={(e) => setRecipient(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="zip">CEP</Label>
                        <div className="relative mt-1.5">
                          <Input
                            id="zip"
                            value={zip}
                            onChange={(e) => setZip(formatCep(e.target.value))}
                            onBlur={handleZipBlur}
                            placeholder="00000-000"
                            maxLength={9}
                            inputMode="numeric"
                            autoComplete="postal-code"
                          />
                          {zipLoading && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="street">Rua</Label>
                        <Input
                          id="street"
                          value={street}
                          onChange={(e) => setStreet(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="number">Número</Label>
                        <Input
                          id="number"
                          value={number}
                          onChange={(e) => setNumber(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="complement">Complemento</Label>
                        <Input
                          id="complement"
                          value={complement}
                          onChange={(e) => setComplement(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="neighborhood">Bairro</Label>
                        <Input
                          id="neighborhood"
                          value={neighborhood}
                          onChange={(e) => setNeighborhood(e.target.value)}
                          onBlur={handleNeighborhoodBlur}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="city">Cidade</Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="mt-1.5"
                        />
                      </div>
                      <div>
                        <Label htmlFor="state">UF</Label>
                        <Input
                          id="state"
                          value={state}
                          onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                          maxLength={2}
                          className="mt-1.5"
                        />
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 mt-5 text-sm">
                      <input
                        type="checkbox"
                        checked={saveAddress}
                        onChange={(e) => setSaveAddress(e.target.checked)}
                        className="rounded border-border"
                      />
                      Salvar este endereço na minha conta
                    </label>
                    {(localZoneChecking || localZone) && (
                      <div
                        className={`mt-4 p-3 rounded-lg border text-sm flex items-start gap-2 ${
                          localZone ? "bg-success/10 border-success/30" : "bg-surface border-border"
                        }`}
                      >
                        {localZoneChecking ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin shrink-0 mt-0.5" /> Verificando
                            frete local…
                          </>
                        ) : (
                          <>
                            <Truck className="w-4 h-4 text-success shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <div className="font-medium">
                                Frete Local disponível para {localZone!.displayName}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {formatBRL(localZone!.price)}
                                {localZone!.eta ? ` · ${localZone!.eta}` : ""} — você poderá
                                escolher na próxima etapa.
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    <Button onClick={goToShipping} size="lg" className="w-full mt-6 h-12">
                      Continuar para o frete <ArrowRight className="w-4 h-4 ml-1.5" />
                    </Button>
                  </>
                )}
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-display font-bold text-xl mb-5">Escolha o frete</h2>
                {shippingLoading ? (
                  <div className="py-10 text-center text-muted-foreground">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    Calculando opções...
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {shippingOptions.map((s) => (
                      <label
                        key={s.id}
                        className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                          selectedShipping?.id === s.id
                            ? "border-primary bg-primary-tint"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="shipping"
                          checked={selectedShipping?.id === s.id}
                          onChange={() => handleSelectShipping(s)}
                          className="text-primary"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {s.name}{" "}
                            <span className="text-muted-foreground font-normal">· {s.carrier}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.id === "local-zone"
                              ? localZone?.eta || "Entrega no mesmo dia / D+1"
                              : `Entrega em até ${s.days} ${s.days === 1 ? "dia útil" : "dias úteis"}`}
                          </div>
                        </div>
                        <div className="font-display font-bold">
                          {s.price === 0 ? (
                            <span className="text-success">Grátis</span>
                          ) : (
                            formatBRL(s.price)
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  💡 Estimativa baseada em região. Frete real será confirmado após integração com
                  Melhor Envio.
                </p>
                <div className="flex gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                    Voltar
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!selectedShipping}
                    className="flex-1 h-11"
                  >
                    Revisar pedido <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="font-display font-bold text-xl mb-5">Revisão e pagamento</h2>

                {pricing?.company_approved && pricing.company && (
                  <section className="mb-5 pb-5 border-b border-border">
                    <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">
                      Compra empresa
                    </h3>
                    <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary-tint/40 p-3">
                      <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium">
                          {pricing.company.trade_name || pricing.company.legal_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          CNPJ {maskCnpj(pricing.company.cnpj)} · Responsável:{" "}
                          {pricing.company.contact_name}
                        </p>
                        {b2bSavings > 0 && (
                          <p className="text-xs text-success mt-1 inline-flex items-center gap-1">
                            <BadgePercent className="w-3 h-3" /> Você economiza{" "}
                            {formatBRL(b2bSavings)} com preço empresa.
                          </p>
                        )}
                      </div>
                    </div>
                  </section>
                )}

                <section className="mb-5 pb-5 border-b border-border">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">
                    Itens
                  </h3>
                  <div className="space-y-2.5">
                    {cart.items.map((i) => {
                      const priced = pricing?.items.find((p) => p.product_id === i.productId);
                      const unit = priced?.applied_unit_price ?? i.price;
                      const isB2b = priced?.pricing_source === "b2b";
                      return (
                        <div
                          key={i.productId}
                          className="flex justify-between items-center text-sm"
                        >
                          <span className="line-clamp-1">
                            {i.qty}× {i.name}
                            {isB2b && (
                              <span className="ml-1.5 text-[10px] font-semibold text-success uppercase">
                                B2B
                              </span>
                            )}
                          </span>
                          <span className="font-medium shrink-0 ml-3">
                            {formatBRL(unit * i.qty)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="mb-5 pb-5 border-b border-border">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">
                    Entrega
                  </h3>
                  {isPickup ? (
                    <>
                      <p className="text-sm font-medium">Retirada na loja — Grátis</p>
                      {company?.pickup_store_name && (
                        <p className="text-sm">{company.pickup_store_name as string}</p>
                      )}
                      {company?.pickup_address && (
                        <p className="text-sm text-muted-foreground whitespace-pre-line">
                          {company.pickup_address as string}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">Retirada por: {recipient}</p>
                      <p className="text-xs text-warning mt-2">
                        ⚠️ Aguarde a confirmação de disponibilidade antes de comparecer.
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm">{recipient}</p>
                      <p className="text-sm text-muted-foreground">
                        {street}, {number}
                        {complement ? `, ${complement}` : ""} — {neighborhood}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {city}/{state} · CEP {zip}
                      </p>
                      <p className="text-sm mt-2 font-medium">
                        {selectedShipping?.name} · {selectedShipping?.carrier}
                        {isLocal
                          ? localZone?.eta
                            ? ` (${localZone.eta})`
                            : ""
                          : ` (${selectedShipping?.days}d)`}
                      </p>
                    </>
                  )}
                </section>

                <section className="mb-5">
                  <h3 className="font-semibold text-sm mb-2 text-muted-foreground uppercase tracking-wide">
                    Pagamento
                  </h3>
                  <div className="p-4 bg-primary-tint border border-primary/30 rounded-lg text-sm">
                    <p className="font-medium mb-1">Pagamento via Mercado Pago</p>
                    <p className="text-muted-foreground text-xs">
                      Ao confirmar, você será redirecionado para o checkout seguro do Mercado Pago
                      (Pix, cartão ou boleto).
                    </p>
                  </div>
                </section>

                <section className="mb-5">
                  <Label htmlFor="notes">Observações (opcional)</Label>
                  <textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    className="mt-1.5 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    placeholder="Alguma informação adicional para a entrega?"
                  />
                </section>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(isPickup ? 1 : 2)}
                    className="flex-1"
                  >
                    Voltar
                  </Button>
                  <Button onClick={handleSubmit} disabled={submitting} className="flex-1 h-12">
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processando...
                      </>
                    ) : (
                      <>
                        Finalizar pedido <ArrowRight className="w-4 h-4 ml-1.5" />
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>

          {/* Resumo */}
          <aside className="bg-card border border-border rounded-xl p-6 h-fit lg:sticky lg:top-20">
            <h2 className="font-display font-semibold text-lg mb-4">Resumo</h2>

            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
              {cart.items.map((i) => (
                <div key={i.productId} className="flex gap-2 items-center text-xs">
                  <div className="w-10 h-10 rounded bg-surface shrink-0 overflow-hidden flex items-center justify-center">
                    {i.image ? (
                      <img src={i.image} alt={i.name} className="w-full h-full object-cover" />
                    ) : (
                      <ShoppingBag className="w-4 h-4 text-text-faint" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-1 font-medium">{i.name}</p>
                    <p className="text-muted-foreground">
                      {i.qty}× {formatBRL(i.price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <Input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                placeholder="Cupom"
                className="h-9"
              />
              <Button
                onClick={handleApplyCoupon}
                disabled={couponLoading}
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
              >
                {couponLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Aplicar"}
              </Button>
            </div>

            <div className="space-y-2 text-sm border-t border-border pt-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatBRL(subtotalRetail)}</span>
              </div>
              {b2bSavings > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto empresa</span>
                  <span>−{formatBRL(b2bSavings)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto ({couponCode})</span>
                  <span>−{formatBRL(discount)}</span>
                </div>
              )}
              {bundleDiscountPreview > 0 && (
                <div className="flex justify-between text-success">
                  <span>Desconto de combo</span>
                  <span>−{formatBRL(bundleDiscountPreview)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {isPickup ? "Retirada na loja" : isLocal ? "Frete Local Maricá" : "Frete"}
                </span>
                <span>
                  {isPickup ? (
                    <span className="text-success">Grátis</span>
                  ) : selectedShipping ? (
                    selectedShipping.price === 0 ? (
                      <span className="text-success">Grátis</span>
                    ) : (
                      formatBRL(selectedShipping.price)
                    )
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              <div className="border-t border-border pt-3 flex justify-between items-end">
                <span className="font-medium">Total</span>
                <span className="font-display font-extrabold text-2xl text-primary">
                  {formatBRL(total)}
                </span>
              </div>
              {isB2bOrder && (
                <p className="text-[10px] text-muted-foreground text-right">
                  Total inclui preço empresa validado pelo backend.
                </p>
              )}
              <p className="text-xs text-muted-foreground text-right">
                em até 12x de {formatBRL(total / 12)}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </StoreLayout>
  );
}
