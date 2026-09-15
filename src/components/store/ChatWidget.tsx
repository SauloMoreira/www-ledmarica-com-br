import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { chatWithAI, loadChatHistory } from "@/server/chat.functions";
import { requestHumanHandoff } from "@/server/leadHandoff.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackLeadCaptured } from "@/lib/tracking";
import ledinhoAvatar from "@/assets/ledinho-mascote.jpeg";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

type HandoffStep = "idle" | "offer" | "form" | "ready";

const SESSION_KEY = "ledm_chat_session";
const STORAGE_KEY = "ledm_chat_open";

const HUMAN_TRIGGERS = [
  "humano",
  "atendente",
  "vendedor",
  "vendedora",
  "consultor",
  "consultora",
  "pessoa de verdade",
  "alguém da equipe",
  "alguem da equipe",
  "whatsapp",
  "whats",
  "zap",
  "falar com alguém",
  "falar com alguem",
  "atendimento humano",
  "quero falar",
  "conectar com atendente",
  "conectar com um atendente",
  "conectar com humano",
  "transferir",
  "encaminhar para atendimento",
];

// Frases que a IA pode soltar pedindo dados de contato em texto livre.
// Quando detectadas, abrimos o formulário inline automaticamente.
const AI_ASKS_CONTACT_PATTERNS: RegExp[] = [
  /informe seu\s+(nome|telefone|whatsapp|e-?mail)/i,
  /me passa(r)?\s+seu\s+(nome|telefone|whatsapp|e-?mail)/i,
  /me informe\s+seu\s+(nome|telefone|whatsapp|e-?mail)/i,
  /seu\s+nome.*(telefone|whatsapp|e-?mail)/i,
  /(nome|telefone|whatsapp).*para que.*(equipe|atendente|contato)/i,
  /conectar (com|com um|você com).*(atendente|humano)/i,
];

function detectHumanRequest(text: string): boolean {
  const t = text.toLowerCase();
  return HUMAN_TRIGGERS.some((k) => t.includes(k));
}

function aiAskedForContact(text: string): boolean {
  return AI_ASKS_CONTACT_PATTERNS.some((re) => re.test(text));
}

function formatPhoneBR(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function getOrCreateSession(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = `s_${crypto.randomUUID()}`;
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

const WELCOME: Msg = {
  role: "assistant",
  content:
    "Olá! Sou o **Ledinho**, assistente da **Led Maricá** ⚡\n\nPosso te ajudar a encontrar produtos, tirar dúvidas técnicas ou fazer um orçamento. E se preferir falar com uma pessoa, é só pedir que eu te encaminho para nossa equipe no WhatsApp. Como posso ajudar?",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Handoff state
  const [handoffStep, setHandoffStep] = useState<HandoffStep>("idle");
  const [handoffName, setHandoffName] = useState("");
  const [handoffPhone, setHandoffPhone] = useState("");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [handoffLoading, setHandoffLoading] = useState(false);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState<string>("5521982126467");
  const [whatsappText, setWhatsappText] = useState<string>("");
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  const chat = useServerFn(chatWithAI);
  const loadHistory = useServerFn(loadChatHistory);
  const handoff = useServerFn(requestHumanHandoff);

  useEffect(() => {
    const sid = getOrCreateSession();
    setSessionId(sid);
    setOpen(localStorage.getItem(STORAGE_KEY) === "1");
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    const openHandler = () => {
      setOpen(true);
      localStorage.setItem(STORAGE_KEY, "1");
    };
    window.addEventListener("open-chat", openHandler);
    return () => window.removeEventListener("open-chat", openHandler);
  }, []);

  useEffect(() => {
    if (!open || !sessionId) return;
    loadHistory({ data: { sessionId } })
      .then((res) => {
        if (res.messages.length > 0) {
          setMessages(res.messages.map((m: any) => ({ role: m.role, content: m.content })));
        }
      })
      .catch(() => {});
  }, [open, sessionId, loadHistory]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, handoffStep]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  };

  const closeChat = () => {
    setOpen(false);
    localStorage.setItem(STORAGE_KEY, "0");
  };

  // Refs "espelho" do estado, para o timer de inatividade ler o valor mais
  // recente sem precisar recriar o setTimeout a cada resposta da IA.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingRef = useRef(loading);
  const handoffStepRef = useRef(handoffStep);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  useEffect(() => {
    handoffStepRef.current = handoffStep;
  }, [handoffStep]);

  // Fecha o widget sozinho após 5s sem nenhuma interação (toque, clique,
  // digitação ou rolagem), exceto enquanto a IA está respondendo ou o
  // cliente está preenchendo o formulário de contato — nesses casos o
  // timer é adiado para não fechar em cima de uma resposta ou apagar o
  // que a pessoa já digitou.
  const AUTO_CLOSE_MS = 5000;

  const resetInactivityTimer = () => {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (!open) return;
    closeTimerRef.current = setTimeout(() => {
      if (loadingRef.current || handoffStepRef.current === "form") {
        resetInactivityTimer();
        return;
      }
      closeChat();
    }, AUTO_CLOSE_MS);
  };

  useEffect(() => {
    resetInactivityTimer();
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, messages, loading, handoffStep, input, handoffName, handoffPhone]);

  // Permite fechar com Esc — comportamento padrão esperado para
  // painéis flutuantes/modais.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const startHandoffOffer = () => {
    setHandoffStep("offer");
    setMessages((p) => [
      ...p,
      {
        role: "assistant",
        content:
          "Claro, posso te encaminhar para um atendente pelo WhatsApp.\n\nAntes disso, se quiser, eu também consigo te ajudar por aqui com dúvidas sobre produtos, preços, comparações, frete, formas de pagamento, troca, devolução e acompanhamento de pedido.\n\n**Como prefere seguir?**",
      },
    ]);
  };

  const handleContinueHere = () => {
    setHandoffStep("idle");
    setMessages((p) => [
      ...p,
      { role: "user", content: "Pode tentar me ajudar por aqui." },
      {
        role: "assistant",
        content: "Combinado! Me conta sua dúvida que eu te ajudo. 👇",
      },
    ]);
  };

  const handleWantWhatsapp = () => {
    setHandoffStep("form");
    setHandoffError(null);
    setMessages((p) => [
      ...p,
      { role: "user", content: "Quero ir para o WhatsApp." },
      {
        role: "assistant",
        content:
          "Perfeito. Para encaminhar seu atendimento, me informe seu **nome** e **telefone com WhatsApp**.\n\n_Usaremos esses dados apenas para registrar seu atendimento e facilitar o retorno da nossa equipe._",
      },
    ]);
  };

  const submitHandoff = async () => {
    setHandoffError(null);
    const trimmedName = handoffName.trim();
    const digits = handoffPhone.replace(/\D/g, "");
    if (trimmedName.length < 2 || /^\d+$/.test(trimmedName)) {
      setHandoffError("Informe um nome válido.");
      return;
    }
    if (digits.length < 10 || digits.length > 11) {
      setHandoffError("Telefone inválido. Use DDD + número (10 ou 11 dígitos).");
      return;
    }
    setHandoffLoading(true);
    try {
      const { getLeadTrackingPayload } = await import("@/lib/leadTracking");
      const res = await handoff({
        data: {
          name: trimmedName,
          phone: digits,
          sessionId,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
          tracking: getLeadTrackingPayload({ origin_context: "chat" }),
        },
      });
      setWhatsappUrl(res.whatsappUrl);
      setWhatsappPhone(res.whatsappPhone || "5521982126467");
      setWhatsappText(res.whatsappText || "");
      setHandoffStep("ready");
      trackLeadCaptured("chat_handoff");
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content: res.leadSaved
            ? `Pronto, **${trimmedName}**! Registrei seu atendimento e vou te encaminhar para o WhatsApp com um resumo da nossa conversa.`
            : `Pronto, **${trimmedName}**! Não consegui registrar agora, mas você pode seguir para o WhatsApp normalmente.`,
        },
      ]);
    } catch (e: any) {
      // Mesmo com erro, tenta gerar link com os dados informados
      const fallbackPhone = "5521982126467";
      const fallbackPlain = `Olá! Vim pelo site e gostaria de atendimento humano.\n\nMeu nome: ${trimmedName}\nMeu telefone: 55${digits}`;
      setWhatsappPhone(fallbackPhone);
      setWhatsappText(fallbackPlain);
      setWhatsappUrl(`https://wa.me/${fallbackPhone}?text=${encodeURIComponent(fallbackPlain)}`);
      setHandoffStep("ready");
      setMessages((p) => [
        ...p,
        {
          role: "assistant",
          content: `Não consegui registrar seu atendimento agora, **${trimmedName}**, mas você pode seguir para o WhatsApp normalmente.`,
        },
      ]);
    } finally {
      setHandoffLoading(false);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    // Intercepta pedido humano antes de mandar para a IA
    if (handoffStep === "idle" && detectHumanRequest(text)) {
      setMessages((p) => [...p, { role: "user", content: text }]);
      setInput("");
      startHandoffOffer();
      return;
    }

    const userMsg: Msg = { role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await chat({
        data: {
          messages: next
            .filter((m) => m !== WELCOME || messages.length > 1)
            .map((m) => ({ role: m.role, content: m.content })),
          sessionId,
          userId,
        },
      });
      if (res.error) {
        setMessages((p) => [...p, { role: "assistant", content: `⚠️ ${res.error}` }]);
      } else {
        setMessages((p) => [...p, { role: "assistant", content: res.reply }]);
        if ((res as { leadCaptured?: boolean }).leadCaptured) {
          trackLeadCaptured("chat");
        }
        // Se a IA acabou pedindo nome/telefone/email em texto, abre o formulário inline
        if (handoffStep === "idle" && aiAskedForContact(res.reply || "")) {
          setHandoffStep("form");
          setHandoffError(null);
        }
      }
    } catch (e) {
      setMessages((p) => [
        ...p,
        { role: "assistant", content: "⚠️ Erro de conexão. Tente novamente." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const inputDisabled = loading || handoffStep === "form" || handoffStep === "ready";

  return (
    <>
      {/* Floating button */}
      <button
        onClick={toggle}
        aria-label={open ? "Fechar chat" : "Abrir chat"}
        style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)" }}
        className={cn(
          "fixed right-4 sm:right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-105 hover:brightness-110",
          open && "rotate-90",
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Panel */}
      {open && (
        <div
          className="fixed inset-x-2 bottom-2 top-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl animate-in fade-in slide-in-from-bottom-4 sm:inset-auto sm:bottom-24 sm:right-6 sm:top-auto sm:h-[34rem] sm:w-[calc(100vw-3rem)] sm:max-w-sm"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          onPointerDownCapture={resetInactivityTimer}
          onKeyDownCapture={resetInactivityTimer}
        >
          <div className="flex items-center gap-3 border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-primary-foreground/20 ring-2 ring-primary-foreground/30">
              <img
                src={ledinhoAvatar}
                alt="Ledinho — assistente da Led Maricá"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex-1">
              <p className="font-display text-sm font-semibold">Atendimento Led Maricá</p>
              <p className="text-xs opacity-80">IA 24h • encaminha para humano no WhatsApp</p>
            </div>
            <button
              type="button"
              onClick={closeChat}
              aria-label="Fechar chat"
              className="-m-1 shrink-0 rounded-full p-3 text-primary-foreground/90 transition-colors hover:bg-primary-foreground/15 active:bg-primary-foreground/25"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-muted/30 p-4">
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-end gap-2",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "assistant" && (
                  <img
                    src={ledinhoAvatar}
                    alt="Ledinho"
                    className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                  />
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card border border-border text-foreground",
                  )}
                >
                  <div className="prose prose-sm max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_a]:text-inherit [&_a]:underline">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex items-end gap-2 justify-start">
                <img
                  src={ledinhoAvatar}
                  alt="Ledinho"
                  className="h-7 w-7 shrink-0 rounded-full object-cover ring-1 ring-border"
                />
                <div className="rounded-2xl border border-border bg-card px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {/* Handoff: oferta inicial */}
            {handoffStep === "offer" && !loading && (
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={handleContinueHere}>
                  Pode tentar me ajudar
                </Button>
                <Button size="sm" onClick={handleWantWhatsapp}>
                  Quero ir para o WhatsApp
                </Button>
              </div>
            )}

            {/* Handoff: formulário nome+telefone */}
            {handoffStep === "form" && (
              <div className="rounded-2xl border border-border bg-card p-3 space-y-2">
                <input
                  value={handoffName}
                  onChange={(e) => setHandoffName(e.target.value)}
                  placeholder="Seu nome"
                  maxLength={120}
                  autoComplete="name"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <input
                  value={handoffPhone}
                  onChange={(e) => setHandoffPhone(formatPhoneBR(e.target.value))}
                  placeholder="(21) 99999-9999"
                  inputMode="tel"
                  autoComplete="tel"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                {handoffError && <p className="text-xs text-destructive">{handoffError}</p>}
                <Button
                  size="sm"
                  className="w-full"
                  onClick={submitHandoff}
                  disabled={handoffLoading}
                >
                  {handoffLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Continuar para o WhatsApp"
                  )}
                </Button>
                <p className="text-[10px] text-muted-foreground">
                  Usamos seus dados apenas para registrar este atendimento.
                </p>
              </div>
            )}

            {/* Handoff: pronto */}
            {handoffStep === "ready" &&
              whatsappUrl &&
              (() => {
                const isMobile =
                  typeof navigator !== "undefined" &&
                  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
                const encoded = encodeURIComponent(whatsappText);
                const webUrl = `https://web.whatsapp.com/send?phone=${whatsappPhone}&text=${encoded}`;
                const waMeUrl = `https://wa.me/${whatsappPhone}?text=${encoded}`;
                const appUrl = `whatsapp://send?phone=${whatsappPhone}&text=${encoded}`;
                const primaryUrl = isMobile ? waMeUrl : webUrl;

                return (
                  <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
                    <a
                      href={primaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      <Button
                        size="sm"
                        className="w-full bg-green-600 hover:bg-green-700 text-white"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {isMobile ? "Abrir WhatsApp" : "Abrir WhatsApp Web"}
                      </Button>
                    </a>

                    {!isMobile && (
                      <a href={appUrl} className="block">
                        <Button size="sm" variant="outline" className="w-full">
                          Abrir no app WhatsApp Desktop
                        </Button>
                      </a>
                    )}

                    <p className="text-[11px] text-muted-foreground text-center">
                      Se nada abrir, copie os dados abaixo e fale conosco direto:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(whatsappPhone);
                            setCopyFeedback("Número copiado!");
                            setTimeout(() => setCopyFeedback(null), 2000);
                          } catch {
                            setCopyFeedback("Não foi possível copiar.");
                          }
                        }}
                      >
                        Copiar número
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(whatsappText);
                            setCopyFeedback("Mensagem copiada!");
                            setTimeout(() => setCopyFeedback(null), 2000);
                          } catch {
                            setCopyFeedback("Não foi possível copiar.");
                          }
                        }}
                      >
                        Copiar mensagem
                      </Button>
                    </div>
                    <a href={`tel:+${whatsappPhone}`} className="block">
                      <Button size="sm" variant="outline" className="w-full">
                        Ligar agora
                      </Button>
                    </a>
                    {copyFeedback && (
                      <p className="text-[11px] text-center text-primary">{copyFeedback}</p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setHandoffStep("idle");
                        setHandoffName("");
                        setHandoffPhone("");
                        setWhatsappUrl(null);
                        setCopyFeedback(null);
                      }}
                    >
                      Continuar conversando aqui
                    </Button>
                  </div>
                );
              })()}
          </div>

          <div className="flex items-center gap-2 border-t border-border bg-card p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                handoffStep === "form"
                  ? "Preencha o formulário acima…"
                  : handoffStep === "ready"
                    ? "Clique em Falar no WhatsApp"
                    : "Digite sua mensagem..."
              }
              disabled={inputDisabled}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary disabled:opacity-60"
            />
            <Button size="icon" onClick={send} disabled={inputDisabled || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
