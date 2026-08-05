import { forwardRef, useImperativeHandle, useState, type ChangeEvent, type DragEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Upload,
  Star,
  ArrowLeft,
  ArrowRight,
  X,
  Sparkles,
  Plus,
  Wand2,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { generateImageSeo } from "@/server/imageSeo.functions";
import { pickUrl, variantUrl, type ProductImageRow } from "@/lib/productImages";
import { enhanceProductImage } from "@/lib/imageEnhance";
import { fetchExternalImage } from "@/server/barcodeLookup.functions";
import { AiImageGeneratorDialog } from "@/components/admin/AiImageGeneratorDialog";
import { isAllowedImageMime, parseSafeImageDataUrl, validateImageFile } from "@/lib/uploadGuards";

interface Props {
  productId: string;
  productName: string;
  brand?: string | null;
  category?: string | null;
  /** Chamado sempre que as imagens do produto são salvas/alteradas. */
  onImagesChanged?: () => void;
}

export interface ProductImageManagerHandle {
  savePending: () => Promise<ProductImageRow[]>;
  refetchImages: () => Promise<ProductImageRow[]>;
  /** Adiciona imagens externas (URLs) como pendentes — baixa via server fn p/ contornar CORS */
  addExternalImages: (urls: string[]) => Promise<{ added: number; failed: number }>;
}

type PendingImage = {
  id: string;
  file: File;
  previewUrl: string;
  originalFile?: File;
  originalPreviewUrl?: string;
  optimized?: boolean;
};

const MAX_IMAGES = 10;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

async function fetchProductImages(productId: string) {
  const { data, error } = await supabase
    .from("product_images")
    .select("*")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductImageRow[];
}

export const ProductImageManager = forwardRef<ProductImageManagerHandle, Props>(
  function ProductImageManager({ productId, productName, brand, category, onImagesChanged }, ref) {
    const queryClient = useQueryClient();
    const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [optimizingId, setOptimizingId] = useState<string | null>(null);
    const [optimizingAll, setOptimizingAll] = useState(false);
    const [enhancingPendingId, setEnhancingPendingId] = useState<string | null>(null);
    const [aiOpen, setAiOpen] = useState(false);

    const {
      data: images = [],
      isLoading,
      refetch,
    } = useQuery<ProductImageRow[]>({
      queryKey: ["product-images", productId],
      queryFn: () => fetchProductImages(productId),
      enabled: !!productId,
    });

    const refreshProductCaches = () => {
      queryClient.invalidateQueries({ queryKey: ["product-images", productId] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
      onImagesChanged?.();
    };

    const invalidate = () => refreshProductCaches();
    const totalImages = images.length + pendingImages.length;
    const unoptimizedCount = images.filter((i) => !i.optimized).length;

    async function uploadPendingImages() {
      if (!pendingImages.length) return fetchProductImages(productId);

      setUploading(true);
      try {
        const existingCount = images.length;
        for (let i = 0; i < pendingImages.length; i++) {
          const pending = pendingImages[i];
          const f = pending.file;
          const ext =
            (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
          const unique =
            typeof crypto !== "undefined" && "randomUUID" in crypto
              ? crypto.randomUUID()
              : `${Date.now()}-${i}`;
          const path = `${productId}/${Date.now()}-${unique}.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(path, f, { contentType: f.type, cacheControl: "31536000", upsert: false });
          if (upErr) throw new Error(`Falha ao enviar "${f.name}": ${upErr.message}`);

          const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
          const originalUrl = pub.publicUrl;
          if (!originalUrl) throw new Error(`Não foi possível gerar a URL pública de "${f.name}".`);

          const { error: dbErr } = await supabase.from("product_images").insert({
            product_id: productId,
            sort_order: existingCount + i,
            is_primary: existingCount === 0 && i === 0,
            original_url: originalUrl,
            original_size: f.size,
            original_format: ext,
            url_full: variantUrl(originalUrl, "full"),
            url_card: variantUrl(originalUrl, "card"),
            url_thumb: variantUrl(originalUrl, "thumb"),
            url_og: variantUrl(originalUrl, "og"),
            optimized: false,
          });
          if (dbErr) throw new Error(`Falha ao salvar "${f.name}" no produto: ${dbErr.message}`);
        }

        pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
        setPendingImages([]);
        const saved = await fetchProductImages(productId);
        refreshProductCaches();
        return saved;
      } finally {
        setUploading(false);
      }
    }

    async function addExternalImages(urls: string[]) {
      const valid = (urls ?? [])
        .map((u) => (u ?? "").trim())
        .filter((u) => /^https?:\/\//i.test(u) || /^data:/i.test(u));
      if (!valid.length) return { added: 0, failed: 0 };
      const remainingSlots = MAX_IMAGES - totalImages;
      if (remainingSlots <= 0) {
        toast.error(`Máximo de ${MAX_IMAGES} imagens atingido.`);
        return { added: 0, failed: valid.length };
      }
      const toFetch = valid.slice(0, remainingSlots);
      const files: File[] = [];
      let failed = valid.length - toFetch.length;
      for (const url of toFetch) {
        try {
          let blob: Blob;
          let contentType: string;
          let baseName: string;

          if (/^data:/i.test(url)) {
            // data URL — valida com allowlist segura (bloqueia svg, html, etc.)
            const parsed = parseSafeImageDataUrl(url);
            if (!parsed.ok) throw new Error(parsed.reason);
            contentType = parsed.mime;
            blob = new Blob([parsed.bytes.buffer.slice(parsed.bytes.byteOffset, parsed.bytes.byteOffset + parsed.bytes.byteLength) as ArrayBuffer], { type: contentType });
            baseName = `ia-gerada-${Date.now()}.${parsed.ext}`;
          } else {
            const res = await fetchExternalImage({ data: { url } });
            contentType = res.contentType;
            if (!isAllowedImageMime(contentType)) {
              throw new Error(`Formato remoto não permitido (${contentType}).`);
            }
            const bin = atob(res.base64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            blob = new Blob([bytes], { type: contentType });
            const ext = (contentType.split("/")[1] || "jpg").replace(/[^a-z0-9]/g, "") || "jpg";
            const cleanUrl = url.split("?")[0];
            const raw = cleanUrl.substring(cleanUrl.lastIndexOf("/") + 1) || `imagem.${ext}`;
            baseName = raw.toLowerCase().endsWith(`.${ext}`)
              ? raw
              : `${raw.replace(/\.[^.]+$/, "")}.${ext}`;
          }

          files.push(new File([blob], baseName, { type: contentType }));
        } catch (e) {
          console.error("[addExternalImages] falha em", url.slice(0, 80), e);
          failed += 1;
        }
      }
      if (files.length) handleFiles(files);
      return { added: files.length, failed };
    }

    useImperativeHandle(
      ref,
      () => ({
        savePending: uploadPendingImages,
        refetchImages: async () => {
          const result = await refetch();
          return result.data ?? [];
        },
        addExternalImages,
      }),
      [pendingImages, images, productId],
    );

    function handleFiles(fileList: FileList | File[]) {
      const files = Array.from(fileList);
      if (!files.length) return;
      if (totalImages + files.length > MAX_IMAGES) {
        toast.error(
          `Máximo de ${MAX_IMAGES} imagens. Você tem ${totalImages} e está adicionando ${files.length}.`,
        );
        return;
      }
      for (const f of files) {
        const v = validateImageFile(f);
        if (!v.ok) return toast.error(`"${f.name}": ${v.reason}`);
      }

      const next = files.map((file, i) => ({
        id: `${Date.now()}-${i}-${file.name}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setPendingImages((current) => [...current, ...next]);
    }

    const removePendingImage = (id: string) => {
      setPendingImages((current) => {
        const target = current.find((img) => img.id === id);
        if (target) {
          URL.revokeObjectURL(target.previewUrl);
          if (target.originalPreviewUrl) URL.revokeObjectURL(target.originalPreviewUrl);
        }
        return current.filter((img) => img.id !== id);
      });
    };

    async function enhancePending(id: string) {
      const target = pendingImages.find((img) => img.id === id);
      if (!target) return;
      setEnhancingPendingId(id);
      try {
        const enhanced = await enhanceProductImage(target.originalFile ?? target.file);
        const newPreview = URL.createObjectURL(enhanced);
        setPendingImages((current) =>
          current.map((img) => {
            if (img.id !== id) return img;
            // guarda original na 1ª otimização
            const originalFile = img.originalFile ?? img.file;
            const originalPreviewUrl = img.originalPreviewUrl ?? img.previewUrl;
            // só revoga preview anterior se já era uma versão otimizada
            if (img.optimized) URL.revokeObjectURL(img.previewUrl);
            return {
              ...img,
              file: enhanced,
              previewUrl: newPreview,
              originalFile,
              originalPreviewUrl,
              optimized: true,
            };
          }),
        );
        toast.success("Imagem otimizada com sucesso");
      } catch (e) {
        toast.error(
          e instanceof Error
            ? `Não foi possível otimizar a imagem. A imagem original foi mantida. (${e.message})`
            : "Não foi possível otimizar a imagem. A imagem original foi mantida.",
        );
      } finally {
        setEnhancingPendingId(null);
      }
    }

    function restorePendingOriginal(id: string) {
      setPendingImages((current) =>
        current.map((img) => {
          if (img.id !== id || !img.optimized || !img.originalFile || !img.originalPreviewUrl)
            return img;
          URL.revokeObjectURL(img.previewUrl);
          return {
            ...img,
            file: img.originalFile,
            previewUrl: img.originalPreviewUrl,
            originalFile: undefined,
            originalPreviewUrl: undefined,
            optimized: false,
          };
        }),
      );
    }

    const setPrimary = useMutation({
      mutationFn: async (imageId: string) => {
        const { error } = await supabase
          .from("product_images")
          .update({ is_primary: true })
          .eq("id", imageId);
        if (error) throw error;
      },
      onSuccess: () => {
        toast.success("Imagem principal atualizada");
        invalidate();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
    });

    const removeImage = useMutation({
      mutationFn: async (img: ProductImageRow) => {
        const idx = img.original_url.indexOf("/product-images/");
        if (idx >= 0) {
          const path = img.original_url.substring(idx + "/product-images/".length).split("?")[0];
          await supabase.storage.from("product-images").remove([path]);
        }
        const { error } = await supabase.from("product_images").delete().eq("id", img.id);
        if (error) throw error;
      },
      onSuccess: () => {
        toast.success("Imagem removida");
        invalidate();
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
    });

    async function move(img: ProductImageRow, direction: "up" | "down") {
      const idx = images.findIndex((i) => i.id === img.id);
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= images.length) return;
      const a = images[idx];
      const b = images[swapIdx];
      await Promise.all([
        supabase.from("product_images").update({ sort_order: b.sort_order }).eq("id", a.id),
        supabase.from("product_images").update({ sort_order: a.sort_order }).eq("id", b.id),
      ]);
      invalidate();
    }

    async function optimizeOne(img: ProductImageRow) {
      setOptimizingId(img.id);
      try {
        const seo = await generateImageSeo({
          data: {
            productName,
            brand: brand ?? null,
            category: category ?? null,
            index: img.sort_order,
          },
        });
        if (!seo.ok) {
          toast.error(seo.error);
          return;
        }
        const { error } = await supabase
          .from("product_images")
          .update({
            url_full: img.url_full ?? variantUrl(img.original_url, "full"),
            url_card: img.url_card ?? variantUrl(img.original_url, "card"),
            url_thumb: img.url_thumb ?? variantUrl(img.original_url, "thumb"),
            url_og: img.url_og ?? variantUrl(img.original_url, "og"),
            alt_text: seo.alt,
            title_text: seo.title,
            caption: seo.caption,
            seo_filename: seo.filename,
            optimized: true,
          })
          .eq("id", img.id);
        if (error) throw error;
        toast.success("SEO da imagem gerado");
        invalidate();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro");
      } finally {
        setOptimizingId(null);
      }
    }

    async function optimizeAll() {
      const queue = images.filter((i) => !i.optimized);
      if (!queue.length) return;
      setOptimizingAll(true);
      for (const img of queue) {
        await optimizeOne(img);
      }
      setOptimizingAll(false);
    }

    function onDrop(e: DragEvent) {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    }

    if (isLoading) {
      return (
        <div className="text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />
          Carregando imagens…
        </div>
      );
    }

    const primary = images.find((i) => i.is_primary);
    const others = images.filter((i) => !i.is_primary);

    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-semibold text-sm">Imagens do produto</h3>
            <p className="text-xs text-muted-foreground">
              {totalImages}/{MAX_IMAGES} • A estrela define a principal
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {unoptimizedCount > 0 && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={optimizeAll}
                disabled={optimizingAll}
              >
                {optimizingAll ? (
                  <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                )}
                SEO em todas ({unoptimizedCount})
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={totalImages >= MAX_IMAGES}
              onClick={() => setAiOpen(true)}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Gerar com IA
            </Button>
            <label
              className={`inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3 h-8 rounded-md border border-input bg-background hover:bg-accent ${totalImages >= MAX_IMAGES ? "opacity-50 pointer-events-none" : ""}`}
            >
              {uploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Adicionar
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                disabled={uploading || totalImages >= MAX_IMAGES}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  if (e.target.files) handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {totalImages === 0 && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl py-12 text-center transition ${dragOver ? "border-primary bg-primary/5" : "border-border bg-surface/30"}`}
          >
            <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {uploading ? "Enviando…" : 'Arraste imagens aqui ou use "Adicionar"'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              JPG/PNG/WebP • até 10MB cada • até {MAX_IMAGES} imagens
            </p>
          </div>
        )}

        {primary && (
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" /> Imagem principal
            </div>
            <div className="grid sm:grid-cols-[160px_1fr] gap-3">
              <div className="aspect-square rounded-lg overflow-hidden border border-border bg-surface">
                <img
                  src={pickUrl(primary, "card") ?? primary.original_url}
                  alt={primary.alt_text ?? productName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="text-xs space-y-1.5">
                <div className="flex flex-wrap gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold ${primary.optimized ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}
                  >
                    {primary.optimized ? "SEO ✓" : "Sem SEO"}
                  </span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-700">
                    Principal
                  </span>
                </div>
                {primary.alt_text && (
                  <p>
                    <span className="text-muted-foreground">Alt:</span> {primary.alt_text}
                  </p>
                )}
                {primary.title_text && (
                  <p>
                    <span className="text-muted-foreground">Title:</span> {primary.title_text}
                  </p>
                )}
                {primary.seo_filename && (
                  <p className="text-muted-foreground">📁 {primary.seo_filename}</p>
                )}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {!primary.optimized && (
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => optimizeOne(primary)}
                      disabled={optimizingId === primary.id}
                    >
                      {optimizingId === primary.id ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      Gerar SEO
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeImage.mutate(primary)}
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="w-3 h-3 mr-1" /> Remover
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {pendingImages.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Pendentes para salvar ({pendingImages.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {pendingImages.map((img) => {
                const isEnhancing = enhancingPendingId === img.id;
                return (
                  <div
                    key={img.id}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-surface"
                  >
                    <img
                      src={img.previewUrl}
                      alt={img.file.name}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-primary text-primary-foreground">
                      Novo
                    </span>
                    {img.optimized && (
                      <span className="absolute top-1.5 left-12 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-500 text-white">
                        Otimizada
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removePendingImage(img.id)}
                      title="Remover"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded bg-white/95 text-destructive hover:bg-white flex items-center justify-center"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    {isEnhancing && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-[11px] font-medium gap-1.5">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Otimizando imagem…
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 right-1.5 flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        className="flex-1 h-7 text-[10px] px-1.5"
                        disabled={isEnhancing}
                        onClick={() => enhancePending(img.id)}
                        title="Otimizar imagem (ajusta luz, contraste, foco e centralização)"
                      >
                        <Wand2 className="w-3 h-3 mr-1" />
                        {img.optimized ? "Otimizar de novo" : "Otimizar imagem"}
                      </Button>
                      {img.optimized && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => restorePendingOriginal(img.id)}
                          title="Restaurar imagem original"
                        >
                          <Undo2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {others.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
              Imagens adicionais ({others.length})
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {others.map((img, i) => (
                <div
                  key={img.id}
                  className="relative group aspect-square rounded-lg overflow-hidden border border-border bg-surface"
                >
                  <img
                    src={pickUrl(img, "thumb") ?? img.original_url}
                    alt={img.alt_text ?? productName}
                    className="w-full h-full object-cover"
                  />
                  <span
                    className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-semibold ${img.optimized ? "bg-emerald-500 text-white" : "bg-amber-500 text-white"}`}
                  >
                    {img.optimized ? "SEO" : "·"}
                  </span>
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1 p-1">
                    <button
                      type="button"
                      onClick={() => setPrimary.mutate(img.id)}
                      title="Tornar principal"
                      className="w-7 h-7 rounded bg-white/95 text-yellow-600 hover:bg-white flex items-center justify-center"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => move(img, "up")}
                        disabled={i === 0}
                        title="Mover para frente"
                        className="w-7 h-7 rounded bg-white/95 hover:bg-white disabled:opacity-30 flex items-center justify-center"
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(img, "down")}
                        disabled={i === others.length - 1}
                        title="Mover para trás"
                        className="w-7 h-7 rounded bg-white/95 hover:bg-white disabled:opacity-30 flex items-center justify-center"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-1">
                      {!img.optimized && (
                        <button
                          type="button"
                          onClick={() => optimizeOne(img)}
                          disabled={optimizingId === img.id}
                          title="Gerar SEO"
                          className="w-7 h-7 rounded bg-white/95 text-primary hover:bg-white flex items-center justify-center"
                        >
                          {optimizingId === img.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => removeImage.mutate(img)}
                        title="Remover"
                        className="w-7 h-7 rounded bg-white/95 text-destructive hover:bg-white flex items-center justify-center"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {totalImages > 0 && totalImages < MAX_IMAGES && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`text-center text-xs py-3 border border-dashed rounded-lg transition ${dragOver ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"}`}
          >
            Arraste mais imagens aqui ({totalImages}/{MAX_IMAGES})
          </div>
        )}

        <AiImageGeneratorDialog
          open={aiOpen}
          onOpenChange={setAiOpen}
          kind="product"
          name={productName}
          brand={brand ?? null}
          category={category ?? null}
          onApply={async (dataUrl) => {
            const result = await addExternalImages([dataUrl]);
            if (result.added > 0) toast.success("Imagem da IA adicionada");
            else if (result.failed > 0) toast.error("Falha ao adicionar imagem da IA");
          }}
        />
      </div>
    );
  },
);
