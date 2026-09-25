import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ShopperIdentity = { name: string; email: string; phone: string; savedAt: string };

type PromptState = {
  open: boolean;
  /** Obrigatório (sem "Agora não") — usado no checkout para completar o WhatsApp. */
  required: boolean;
  productId?: string | null;
  productName?: string | null;
  /** Rota para seguir depois de salvar (ex.: "/checkout"). */
  next?: string | null;
};

type State = {
  identity: ShopperIdentity | null;
  prompt: PromptState;
  saveIdentity: (i: Omit<ShopperIdentity, "savedAt">) => void;
  openPrompt: (p?: Partial<Omit<PromptState, "open">>) => void;
  closePrompt: () => void;
};

/**
 * Identidade do comprador (nome, e-mail, WhatsApp) informada no 1º
 * "Adicionar ao carrinho". Persistida no navegador só para pré-preencher o
 * login por código e não perguntar de novo — a fonte de verdade é o servidor.
 */
export const useShopperIdentity = create<State>()(
  persist(
    (set) => ({
      identity: null,
      prompt: { open: false, required: false },
      saveIdentity: (i) => set({ identity: { ...i, savedAt: new Date().toISOString() } }),
      openPrompt: (p) =>
        set({
          prompt: {
            open: true,
            required: p?.required ?? false,
            productId: p?.productId ?? null,
            productName: p?.productName ?? null,
            next: p?.next ?? null,
          },
        }),
      closePrompt: () => set((s) => ({ prompt: { ...s.prompt, open: false } })),
    }),
    { name: "led-marica-shopper", partialize: (s) => ({ identity: s.identity }) },
  ),
);
