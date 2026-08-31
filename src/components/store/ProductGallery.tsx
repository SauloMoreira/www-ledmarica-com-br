import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { pickUrl, type ProductImageRow } from "@/lib/productImages";
import { ProductImagePlaceholder } from "@/components/store/ProductImagePlaceholder";

interface Props {
  images: ProductImageRow[];
  productName: string;
}

const ZOOM_FACTOR = 2.5;
const LENS_SIZE = 140; // px

export function ProductGallery({ images, productName }: Props) {
  const sorted = [...images].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    return a.sort_order - b.sort_order;
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [isZooming, setIsZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lensPos, setLensPos] = useState({ x: 0, y: 0 });
  const [canHover, setCanHover] = useState(true);
  const mainRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(hover: hover) and (pointer: fine)");
    const update = () => setCanHover(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setActiveIndex((i) => Math.min(sorted.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sorted.length]);

  if (!sorted.length) {
    return (
      <div className="flex gap-3">
        <div className="border border-border rounded-lg flex-1 aspect-square overflow-hidden">
          <ProductImagePlaceholder iconSize={88} />
        </div>
      </div>
    );
  }

  const safeIndex = Math.min(activeIndex, sorted.length - 1);
  const current = sorted[safeIndex];
  const mainSrc = pickUrl(current, "full") ?? current.original_url;
  const mainAlt = current.alt_text || `${productName} — Led Maricá`;
  const mainTitle = current.title_text || productName;

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!mainRef.current) return;
    const rect = mainRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setZoomPos({
      x: Math.max(0, Math.min(100, x)),
      y: Math.max(0, Math.min(100, y)),
    });
    setLensPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }

  return (
    <div className="relative">
      <div className="flex gap-3">
        {/* Thumbnails: vertical em desktop, horizontal em mobile (abaixo via flex-col-reverse no wrapper) */}
        {sorted.length > 1 && (
          <div className="hidden md:flex flex-col gap-2 w-[68px] flex-shrink-0">
            {sorted.map((img, i) => {
              const thumb = pickUrl(img, "thumb") ?? img.original_url;
              const active = i === safeIndex;
              return (
                <button
                  key={img.id}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => setActiveIndex(i)}
                  aria-label={`Ver imagem ${i + 1}`}
                  className={`w-[68px] h-[68px] rounded-md overflow-hidden bg-surface p-0 transition-colors ${
                    active
                      ? "border-2 border-accent"
                      : "border border-border hover:border-accent/60"
                  }`}
                >
                  <img
                    src={thumb}
                    alt={img.alt_text || `${productName} ${i + 1}`}
                    className="w-full h-full object-cover"
                    width={68}
                    height={68}
                    loading="lazy"
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Imagem principal */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          <div
            ref={mainRef}
            onMouseEnter={() => canHover && setIsZooming(true)}
            onMouseLeave={() => setIsZooming(false)}
            onMouseMove={handleMouseMove}
            className="relative w-full aspect-square bg-surface border border-border rounded-lg overflow-hidden select-none p-8"
            style={{ cursor: isZooming ? "crosshair" : "default" }}
          >
            <img
              src={mainSrc}
              alt={mainAlt}
              title={mainTitle}
              width={800}
              height={800}
              className="w-full h-full object-contain"
              loading="eager"
              fetchPriority="high"
              decoding="async"
              draggable={false}
            />

            {/* Lens (quadrado translúcido) */}
            {isZooming && (
              <div
                aria-hidden
                className="pointer-events-none absolute border-2 border-accent bg-accent/10 rounded-sm"
                style={{
                  width: LENS_SIZE,
                  height: LENS_SIZE,
                  left: Math.max(
                    0,
                    Math.min(
                      (mainRef.current?.clientWidth ?? 0) - LENS_SIZE,
                      lensPos.x - LENS_SIZE / 2,
                    ),
                  ),
                  top: Math.max(
                    0,
                    Math.min(
                      (mainRef.current?.clientHeight ?? 0) - LENS_SIZE,
                      lensPos.y - LENS_SIZE / 2,
                    ),
                  ),
                }}
              />
            )}

            {/* Contador */}
            {sorted.length > 1 && (
              <span className="absolute top-3 right-3 bg-foreground/70 text-background text-[11px] font-medium px-2 py-0.5 rounded-full">
                {safeIndex + 1} / {sorted.length}
              </span>
            )}

            {/* Setas (mostradas só em mobile / touch) */}
            {sorted.length > 1 && (
              <>
                {safeIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => i - 1)}
                    aria-label="Imagem anterior"
                    className="md:hidden absolute left-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/95 border border-border shadow-soft flex items-center justify-center"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                )}
                {safeIndex < sorted.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setActiveIndex((i) => i + 1)}
                    aria-label="Próxima imagem"
                    className="md:hidden absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-card/95 border border-border shadow-soft flex items-center justify-center"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </>
            )}
          </div>

          {current.caption && (
            <p className="text-xs text-muted-foreground italic px-1">{current.caption}</p>
          )}

          {/* Thumbnails horizontais (mobile) */}
          {sorted.length > 1 && (
            <div className="md:hidden flex gap-2 overflow-x-auto pb-1">
              {sorted.map((img, i) => {
                const thumb = pickUrl(img, "thumb") ?? img.original_url;
                const active = i === safeIndex;
                return (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setActiveIndex(i)}
                    aria-label={`Ver imagem ${i + 1}`}
                    className={`flex-shrink-0 w-16 h-16 rounded-md overflow-hidden bg-surface p-0 transition-colors ${
                      active ? "border-2 border-accent" : "border border-border"
                    }`}
                  >
                    <img
                      src={thumb}
                      alt={img.alt_text || `${productName} ${i + 1}`}
                      className="w-full h-full object-cover"
                      width={64}
                      height={64}
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Painel de zoom flutuante (desktop) */}
      {isZooming && canHover && (
        <div
          aria-hidden
          className="hidden md:block absolute top-0 left-full ml-4 w-[480px] h-[480px] bg-surface border border-border rounded-lg overflow-hidden shadow-floating z-30"
          style={{
            backgroundImage: `url(${mainSrc})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: `${ZOOM_FACTOR * 100}%`,
            backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
          }}
        />
      )}
    </div>
  );
}
