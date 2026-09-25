import { Header } from "./Header";
import { Footer } from "./Footer";
import { CartDrawer } from "@/components/store/CartDrawer";
import { ShopperIdentifyDialog } from "@/components/store/ShopperIdentifyDialog";
import { ChatWidgetLazy } from "@/components/store/ChatWidgetLazy";
import { LgpdLayer } from "@/components/lgpd/LgpdLayer";
import { useCartSync } from "@/hooks/useCartSync";
import type { ReactNode } from "react";

export function StoreLayout({ children }: { children: ReactNode }) {
  useCartSync();
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
      <ShopperIdentifyDialog />
      <ChatWidgetLazy />
      <LgpdLayer />
    </div>
  );
}
