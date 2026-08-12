# Lumina Hub

════════════════════════════════════════════════════════════════════
  LED MARICÁ — PLATAFORMA COMERCIAL INTELIGENTE
  Prompt Completo · Fase 1 · Lovable + Supabase
  Material Elétrico & Iluminação · Maricá/RJ
  Desenvolvido por SC Moreira Tech
════════════════════════════════════════════════════════════════════

Crie uma plataforma de e-commerce completa para a Led Maricá, empresa
de material elétrico e iluminação de Maricá/RJ. A plataforma deve ser
profissional, premium e funcional — uma central comercial inteligente
com loja online, atendimento com IA, CRM, pedidos, estoque, marketing
automatizado e dashboards executivos.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 1 — STACK TÉCNICA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Framework:   React 18 + TypeScript + Vite
Estilo:      Tailwind CSS v3 + shadcn/ui
Estado:      Zustand (carrinho + UI) + TanStack Query (server state)
Formulários: React Hook Form + Zod
Roteamento:  React Router v6 com lazy loading
Animações:   Framer Motion
Ícones:      Lucide React
Backend:     Supabase (Auth + PostgreSQL + Storage + Edge Functions)
Pagamento:   Mercado Pago Checkout Pro
Frete:       Melhor Envio API v2
CEP:         ViaCEP (gratuito)
Email:       Resend (transacional)
Deploy:      Vercel

Estrutura de pastas:
  src/
    components/
      ui/          (Button, Input, Card, Badge, Modal, Toast)
      layout/      (Header, Footer, Sidebar, PageWrapper)
      store/       (ProductCard, CartDrawer, FilterSidebar)
      admin/       (DataTable, StatsCard, Chart, KanbanBoard)
    pages/
      store/       (Home, Catalog, Product, Cart, Checkout, Orders, Chat)
      admin/       (Dashboard, Orders, Products, Stock, Customers, CRM, Marketing)
      auth/        (Login, Register, ForgotPassword)
    hooks/         (useCart, useAuth, useProducts, useOrders)
    stores/        (cartStore, uiStore)
    lib/           (supabase, mercadopago, melhorenvio, viacep)
    styles/        (tokens.css, globals.css)
    types/         (database.types.ts, api.types.ts)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 2 — IDENTIDADE VISUAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TEMA: CLARO (light mode — sem dark mode na Fase 1)
Estilo: clean, profissional, premium — inspiração Stripe/Linear
aplicada ao varejo de material elétrico e iluminação.

── LOGO ────────────────────────────────────────────────────────────
Fazer upload dos arquivos em public/assets/:
  • public/assets/logo-navbar.png   → header (height: 44px)
  • public/assets/logo-hero.png     → seção hero (max-width: 380px)
  • public/assets/logo-footer.png   → footer (width: 180px)

IMPORTANTE: NUNCA usar placeholder de texto.
Sempre usar os arquivos de imagem do logo.
O logo tem fundo transparente — funciona sobre #FFFFFF e #F4F6FA.

── FONTES (Google Fonts) ───────────────────────────────────────────
Display/Títulos/Preços: "Plus Jakarta Sans" — weights 600, 700, 800
Body/Texto/Botões:      "DM Sans"           — weights 400, 500, 600

Regras tipográficas:
  h1 hero         → Plus Jakarta Sans 800 · 40px · letter-spacing: -1px
  h1 interno      → Plus Jakarta Sans 700 · 28px · ls: -0.5px
  h2 seção        → Plus Jakarta Sans 600 · 20px · ls: -0.2px
  h3 card         → Plus Jakarta Sans 600 · 16px
  body            → DM Sans 400 · 14px · line-height: 1.7
  label/meta      → DM Sans 500 · 11px · uppercase · ls: 1.5px
  preço           → Plus Jakarta Sans 800 · 26px · color: #1A56DB
  badge técnico   → monospace · 11px · bg: #EBF0FD · color: #1A56DB

── PALETA — CSS Variables (criar em src/styles/tokens.css) ─────────

/* Cores de Ação */
--color-primary:         #1A56DB;
--color-primary-hover:   #1348C0;
--color-primary-tint:    #EBF0FD;
--color-primary-border:  #C7D7FA;
--color-accent:          #D97706;
--color-accent-hover:    #B45309;
--color-accent-tint:     #FEF3C7;
--color-accent-border:   #FDE68A;

/* Fundos */
--bg-page:               #F4F6FA;
--bg-card:               #FFFFFF;
--bg-surface:            #EDF1F7;
--bg-border:             #E2E8F2;
--bg-divider:            #C8D4E8;

/* Texto */
--text-primary:          #0F172A;
--text-secondary:        #1E293B;
--text-muted:            #475569;
--text-faint:            #94A3B8;
--text-disabled:         #CBD5E1;

/* Semânticas */
--color-success:         #059669;  --color-success-tint: #ECFDF5;
--color-warning:         #D97706;  --color-warning-tint: #FEF3C7;
--color-danger:          #DC2626;  --color-danger-tint:  #FEF2F2;

/* Radius */
--radius-sm: 4px;  --radius-md: 8px;
--radius-lg: 12px; --radius-xl: 16px; --radius-pill: 999px;

/* Sombras */
--shadow-sm: 0 1px 3px rgba(15,23,42,.08), 0 1px 2px rgba(15,23,42,.04);
--shadow-md: 0 4px 12px rgba(15,23,42,.08), 0 2px 4px rgba(15,23,42,.04);
--shadow-lg: 0 8px 24px rgba(15,23,42,.10), 0 4px 8px rgba(15,23,42,.06);

── COMPONENTES PADRÃO ───────────────────────────────────────────────

Botão Primário:
  bg:#1A56DB · color:#fff · radius:8px · padding:10px 20px
  DM Sans 500 13px · hover:brightness(0.94)
  box-shadow: 0 1px 2px rgba(26,86,219,.30)

Botão Secundário:
  bg:transparent · color:#1A56DB · border:1.5px solid #1A56DB

Botão Ghost:
  bg:#EDF1F7 · color:#1E293B · border:1px solid #E2E8F2

Input:
  bg:#FFFFFF · border:1.5px solid #E2E8F2 · radius:8px
  padding:10px 14px · DM Sans 400 14px · color:#1E293B
  focus: border #1A56DB + ring rgba(26,86,219,.08) 3px

Card:
  bg:#FFFFFF · border:1px solid #E2E8F2 · radius:12px
  shadow:var(--shadow-sm) · padding:16px

Header:
  bg:#FFFFFF · border-bottom:1.5px solid #E2E8F2
  shadow: 0 1px 4px rgba(15,23,42,.06)
  height:64px · position:sticky · top:0 · z-index:50

Badge/Pill (radius:999px · DM Sans 500 10.5px):
  Azul:     bg #EBF0FD · color #1A56DB · border #C7D7FA
  Âmbar:    bg #FEF3C7 · color #B45309 · border #FDE68A
  Verde:    bg #ECFDF5 · color #059669 · border #A7F3D0
  Vermelho: bg #FEF2F2 · color #DC2626 · border #FECACA
  Cinza:    bg #EDF1F7 · color #475569 · border #E2E8F2

Card de Produto:
  bg:#FFFFFF · border:1px solid #E2E8F2 · radius:12px
  shadow:var(--shadow-sm)
  hover: translateY(-2px) + shadow-md (transition 200ms)
  Imagem: aspect-ratio 1:1 · bg:#EDF1F7 · radius:8px no topo
  Nome: DM Sans 500 13px · color:#1E293B
  Preço: Plus Jakarta Sans 700 17px · color:#1A56DB

Status com dot animado:
  Pago:       dot #059669 · bg #ECFDF5 · text #059669
  Aguardando: dot #D97706 · bg #FEF3C7 · text #B45309
  Enviado:    dot #1A56DB · bg #EBF0FD · text #1A56DB
  Cancelado:  dot #DC2626 · bg #FEF2F2 · text #DC2626

Banners principais: bg #1A56DB · texto branco
Banners de promoção: bg #FEF3C7 · texto #B45309

Motion (Framer Motion):
  Page transition: fade + translateY(6px)→0 · 200ms ease-out
  Cards catálogo: stagger 40ms · fade + translateY(10px)
  Modal: scale(0.96)→1 + opacity · 180ms ease-out
  Toast: slide da direita · 220ms

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 3 — BANCO DE DADOS (SUPABASE / POSTGRESQL)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Criar todas as tabelas com UUID PK, RLS habilitado e timestamps.

── TABLE: profiles ──────────────────────────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL DEFAULT 'customer'
              CHECK (role IN ('customer','admin')),
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
-- RLS: customer vê apenas o próprio · admin vê todos

── TABLE: categories ────────────────────────────────────────────────
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  icon        TEXT,
  description TEXT,
  parent_id   UUID REFERENCES categories(id),
  sort_order  INT DEFAULT 0,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);
-- Seeds: Iluminação LED · Disjuntores · Fios e Cabos
--        Tomadas e Interruptores · Refletores · Quadros Elétricos
--        Ferramentas · Acessórios

── TABLE: products ──────────────────────────────────────────────────
CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  specs           JSONB DEFAULT '{}',
  price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  sale_price      NUMERIC(10,2) CHECK (sale_price >= 0),
  cost_price      NUMERIC(10,2),
  stock_qty       INT NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  stock_min_alert INT DEFAULT 10,
  sku             TEXT UNIQUE,
  ncm             TEXT,
  brand           TEXT,
  weight_kg       NUMERIC(6,3) DEFAULT 0.300,
  height_cm       INT DEFAULT 10,
  width_cm        INT DEFAULT 10,
  length_cm       INT DEFAULT 10,
  category_id     UUID REFERENCES categories(id),
  images          TEXT[] DEFAULT '{}',
  tags            TEXT[] DEFAULT '{}',
  active          BOOLEAN DEFAULT true,
  featured        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
-- INDEX: slug, category_id, active, featured, price, stock_qty

-- SEEDS DE PRODUTOS (15 itens reais com NCM):
--  Lâmpada LED 9W Bulbo Bivolt E27     · NCM 8539.50.00 · R$ 8,50
--  Lâmpada LED Tubular T8 18W 120cm   · NCM 8539.50.00 · R$ 12,00
--  Refletor LED 20W Bivolt Externo     · NCM 9405.40.00 · R$ 22,00
--  Refletor LED 50W Bivolt Externo     · NCM 9405.40.00 · R$ 38,00
--  Luminária Plafon LED 12W Redondo    · NCM 9405.10.00 · R$ 28,00
--  Spot LED Embutir 5W Dicroica        · NCM 9405.10.00 · R$ 15,00
--  Fita LED SMD 5050 RGB 5m + Fonte    · NCM 8543.70.99 · R$ 18,00
--  Fio Elétrico Flexível 2,5mm 100m   · NCM 8544.49.00 · R$ 120,00
--  Cabo PP 2x1,5mm Preto 100m         · NCM 8544.42.00 · R$ 95,00
--  Disjuntor Monopolar 10A Curva B     · NCM 8536.20.00 · R$ 11,50
--  Disjuntor Bipolar 25A Curva C       · NCM 8536.20.00 · R$ 27,00
--  Tomada 2P+T 20A Padrão NBR 14136   · NCM 8536.69.40 · R$ 6,00
--  Interruptor Simples 10A             · NCM 8536.50.90 · R$ 4,50
--  Extensão Elétrica 3m 3 Tomadas     · NCM 8544.42.00 · R$ 18,00
--  Quadro Distribuição 12 Disjuntores  · NCM 8537.10.20 · R$ 55,00

── TABLE: addresses ─────────────────────────────────────────────────
CREATE TABLE addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label        TEXT DEFAULT 'Casa',
  recipient    TEXT NOT NULL,
  zip_code     TEXT NOT NULL,
  street       TEXT NOT NULL,
  number       TEXT NOT NULL,
  complement   TEXT,
  neighborhood TEXT,
  city         TEXT NOT NULL,
  state        CHAR(2) NOT NULL,
  is_default   BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT now()
);

── TABLE: orders ────────────────────────────────────────────────────
CREATE TABLE orders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number       BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  user_id            UUID NOT NULL REFERENCES profiles(id),
  status             TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','awaiting_payment','paid',
                       'preparing','shipped','out_for_delivery',
                       'delivered','cancelled','refunded')),
  payment_status     TEXT DEFAULT 'pending'
                     CHECK (payment_status IN ('pending','paid','failed','refunded')),
  payment_method     TEXT,
  payment_id         TEXT,
  payment_link       TEXT,
  subtotal           NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount           NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping_cost      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total              NUMERIC(10,2) NOT NULL DEFAULT 0,
  coupon_code        TEXT,
  shipping_carrier   TEXT,
  shipping_service   TEXT,
  tracking_code      TEXT,
  estimated_delivery DATE,
  address_id         UUID REFERENCES addresses(id),
  address_snapshot   JSONB,
  invoice_number     TEXT,
  invoice_url        TEXT,
  notes              TEXT,
  admin_notes        TEXT,
  cancelled_reason   TEXT,
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

── TABLE: order_items ───────────────────────────────────────────────
CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id),
  product_name  TEXT NOT NULL,
  product_sku   TEXT,
  product_image TEXT,
  qty           INT NOT NULL CHECK (qty > 0),
  unit_price    NUMERIC(10,2) NOT NULL,
  total_price   NUMERIC(10,2) NOT NULL
);

── TABLE: cart_items ────────────────────────────────────────────────
CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id TEXT,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty        INT NOT NULL DEFAULT 1 CHECK (qty > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (user_id, product_id),
  UNIQUE NULLS NOT DISTINCT (session_id, product_id)
);

── TABLE: coupons ───────────────────────────────────────────────────
CREATE TABLE coupons (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT UNIQUE NOT NULL,
  description     TEXT,
  discount_type   TEXT NOT NULL CHECK (discount_type IN ('fixed','percent')),
  discount_value  NUMERIC(10,2) NOT NULL,
  min_order_value NUMERIC(10,2) DEFAULT 0,
  max_uses        INT,
  used_count      INT DEFAULT 0,
  active          BOOLEAN DEFAULT true,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

── TABLE: leads ─────────────────────────────────────────────────────
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  company         TEXT,
  origin          TEXT DEFAULT 'site'
                  CHECK (origin IN ('site','chat','whatsapp',
                  'instagram','indicacao','outro')),
  interest        TEXT,
  status          TEXT DEFAULT 'new'
                  CHECK (status IN ('new','contacted','qualified',
                  'proposal','won','lost')),
  estimated_value NUMERIC(10,2),
  lost_reason     TEXT,
  notes           TEXT,
  converted_order UUID REFERENCES orders(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

── TABLE: lead_interactions ─────────────────────────────────────────
CREATE TABLE lead_interactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type       TEXT CHECK (type IN ('note','call','email','whatsapp','chat','meeting')),
  content    TEXT NOT NULL,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

── TABLE: chat_messages ─────────────────────────────────────────────
CREATE TABLE chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id    UUID REFERENCES profiles(id),
  role       TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content    TEXT NOT NULL,
  metadata   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

── TABLE: marketing_campaigns ───────────────────────────────────────
CREATE TABLE marketing_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  type         TEXT CHECK (type IN ('cart_recovery','post_purchase',
               'reactivation','promotion','newsletter')),
  status       TEXT DEFAULT 'draft'
               CHECK (status IN ('draft','active','paused','finished')),
  subject      TEXT,
  content      TEXT,
  sent_count   INT DEFAULT 0,
  open_count   INT DEFAULT 0,
  click_count  INT DEFAULT 0,
  scheduled_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

── STORAGE BUCKETS ──────────────────────────────────────────────────
products-images → público     · max 5MB · accept: image/*
invoices        → privado     · PDFs de NF · somente admin
chat-attachments→ privado     · imagens enviadas no chat

── EDGE FUNCTIONS ───────────────────────────────────────────────────
/functions/mercadopago-webhook  → eventos de pagamento
/functions/chat-ai              → integração Claude API
/functions/shipping-calculate   → proxy Melhor Envio
/functions/send-email           → disparo via Resend

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 4 — ROTAS E PÁGINAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── ROTAS PÚBLICAS (Loja) ─────────────────────────────────────────────

/
  Home: hero com logo, CTA duplo (Ver catálogo + Falar com IA),
  8 produtos em destaque, 6 categorias em grid com ícones,
  banner frete grátis acima R$199, diferenciais (IA 24h · Entrega
  Rápida · NF Garantida), últimos produtos adicionados.

/catalogo
  Filtros sidebar (categoria, faixa de preço, marca, disponibilidade),
  grid responsivo (3 cols desktop · 2 tablet · 1 mobile),
  ordenação (mais vendidos, menor preço, maior preço, novidades),
  busca com debounce 300ms, paginação (24 produtos/página).

/produto/:slug
  Carrossel de imagens, preço com desconto em destaque,
  seletor de quantidade, calculadora de frete (CEP → Melhor Envio),
  botões: "Adicionar ao carrinho" + "Comprar agora",
  badges: NCM · ICMS-ST incluso · Bivolt · INMETRO,
  tabs: Descrição · Especificações Técnicas · Avaliações (8),
  produtos relacionados (4 cards).

/carrinho
  Lista de itens com thumbnail, nome, qty editável, subtotal por item.
  Campo de cupom com validação em tempo real (Supabase).
  Cálculo de frete com opções Correios via Melhor Envio.
  Resumo: subtotal · desconto · frete · total.
  Info parcelas (até 12x sem juros via Mercado Pago).
  Botão "Finalizar pedido" → /checkout.

/checkout
  Wizard 3 etapas com progress bar:

  Etapa 1 — Identificação e Endereço:
    Login rápido ou continuar como visitante.
    Busca automática por CEP via ViaCEP.
    Formulário: nome, CPF/CNPJ, rua, número, complemento,
    bairro, cidade, estado.

  Etapa 2 — Método de Entrega:
    Opções vindas da Melhor Envio API (PAC, Sedex, Mini Envios…)
    com prazo em dias úteis e preço formatado.
    Seleção de opção → atualiza total.

  Etapa 3 — Pagamento:
    Criar order no Supabase (status: 'pending').
    Gerar preference no Mercado Pago.
    Redirecionar para URL de pagamento MP.
    Resumo do pedido sticky no lado direito.

/pedido/:id/confirmacao
  Número do pedido, status atual, itens comprados,
  endereço de entrega, método de pagamento,
  próximos passos em timeline, CTAs: "Acompanhar pedido"
  e "Continuar comprando".

/login · /cadastro · /esqueci-senha
  Formulários clean, validação Zod, login Google (Supabase Auth).

/conta
  Área protegida. Sidebar: Meus Pedidos · Dados · Endereços · Sair.

/conta/pedidos
  Lista com status colorido, valor, data, filtro por status.

/conta/pedidos/:id
  Timeline visual (5 etapas), rastreio com link,
  itens, endereço, download de NF (quando disponível).

/chat
  Chat com IA expandido. Widget flutuante disponível em
  TODAS as páginas da loja (canto inferior direito).

── ROTAS ADMIN (role: 'admin') ───────────────────────────────────────

/admin/dashboard
  4 KPI cards: Faturamento mês · Pedidos hoje · Leads ativos ·
  Ticket médio. Gráfico barras (faturamento 7 dias).
  Gráfico pizza (vendas por categoria).
  Tabela 5 pedidos recentes. Alertas estoque crítico.
  Feed leads novos (últimas 24h).

/admin/pedidos
  Tabela com filtros (status, período, busca), ações em lote,
  export CSV.

/admin/pedidos/:id
  Itens, cliente, endereço, histórico de status.
  Campos editáveis: atualizar status, código de rastreio,
  número NF + URL PDF, notas internas.

/admin/produtos
  CRUD completo. Formulário com upload múltiplas imagens
  (Supabase Storage). Campos: nome, slug, descrição, specs,
  preço, preço promocional, custo, estoque, SKU, NCM, peso,
  dimensões, categoria, tags, featured, active.

/admin/estoque
  Todos os produtos com qty, mínimo configurado,
  barra de nível colorida (vermelho < min · amarelo < 2×min · verde ok).
  Filtro por categoria. Ordenação por qty asc (críticos primeiro).

/admin/clientes
  Nome, email, telefone, total gasto, nº pedidos, data cadastro.
  Clique → detalhe com histórico de pedidos.

/admin/crm
  Pipeline kanban: Novo · Contatado · Qualificado · Proposta
  · Ganho · Perdido. Cards arrastáveis entre colunas.
  Drawer lateral ao clicar: dados, histórico, valor estimado,
  tarefas, botões de ação.

/admin/marketing
  Lista de campanhas com status e métricas.
  Templates: carrinho abandonado · pós-compra · reativação.
  Botão "Nova campanha" com editor. Toggle de automações.

/admin/dashboards
  6 dashboards em abas: Executivo · Vendas · Estoque
  · Leads · Marketing · Logística.

/admin/config
  Dados da loja, integrações (tokens/chaves), frete grátis,
  horários de atendimento.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 5 — MÓDULOS E FUNCIONALIDADES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── CARRINHO (Zustand) ────────────────────────────────────────────────
Estado: items[], coupon, shippingOption, shippingQuotes[]
Ações: addItem, removeItem, updateQty, clearCart,
       applyCoupon, setShipping, mergeCartOnLogin
Persiste no localStorage + sincroniza com cart_items (Supabase).
CartDrawer: slide da direita com overlay, lista itens,
            subtotal, botão "Ir para o carrinho".

── CHECKOUT FLOW ─────────────────────────────────────────────────────
1. /carrinho → "Finalizar pedido"
2. Se não logado → modal de login rápido ou continuar como visitante
3. Etapa 1: endereço → busca CEP (ViaCEP)
4. Etapa 2: frete → Melhor Envio API (cache 30min por CEP+peso)
5. Etapa 3: cria order (status:'pending') → gera MP preference
            → redireciona para URL de pagamento do Mercado Pago
6. Webhook recebe evento → atualiza order → email de confirmação

── CHAT IA ───────────────────────────────────────────────────────────
Widget flutuante (canto inferior direito em todas as páginas):
  Ícone + badge "Online", abre janela 360×520px,
  mensagem de boas-vindas, sugestões rápidas, campo de texto.

Edge Function /functions/chat-ai:
  Model: claude-3-5-haiku-20241022
  System prompt:
    "Você é o assistente virtual da Led Maricá, loja de material
    elétrico e iluminação em Maricá/RJ. Responda sempre em português
    brasileiro. Ajude com produtos, recomende itens por necessidade,
    capture leads, e ofereça transferência para WhatsApp quando
    necessário. Seja técnico, preciso e prestativo."
  Retorna JSON: { message, products[], intent, leadData }
  Registra em chat_messages, cria/atualiza lead automaticamente.

Botão WhatsApp: abre wa.me/5521982126467 com mensagem pré-formatada.

── FRETE (Melhor Envio) ──────────────────────────────────────────────
Edge Function /functions/shipping-calculate:
  Recebe: CEP destino, peso (kg), dimensões (cm), valor do pedido
  From: { postal_code: "24900000" } (CEP da Led Maricá)
  Endpoint: POST /api/v2/me/shipment/calculate
  Options: { insurance_value: total, receipt: false, own_hand: false }
  Retorna: [{ id, name, price, delivery_time }]
  Cache: 30min (mesmo CEP + mesmo peso)

Exibido em: produto (calculadora), carrinho (tabela), checkout etapa 2.

── PAGAMENTO (Mercado Pago) ──────────────────────────────────────────
Checkout Pro (redirect):
  Criar preference com items[], payer{}, back_urls{}, notification_url
  back_url success  → /pedido/:id/confirmacao
  back_url failure  → /checkout?payment=error
  back_url pending  → /pedido/:id/confirmacao?status=pending
  statement_descriptor: 'LED MARICA'
  installments: 12

Webhook Edge Function:
  Valida assinatura do MP
  Atualiza: payment_status, payment_id, status → 'paid'
  Decrementa estoque dos itens
  Dispara email de confirmação via Resend
  Cria interação no CRM se lead existente

── CRM / LEADS ───────────────────────────────────────────────────────
Captura automática:
  Chat IA → cria lead ao captar nome + email
  Checkout visitante → cria/atualiza lead
  Formulário de contato → direto para tabela leads

Pipeline kanban (drag-and-drop):
  Colunas: Novo · Contatado · Qualificado · Proposta · Ganho · Perdido
  Cards: nome, empresa, valor estimado, origem, data
  Arrastar → atualiza status no banco (otimistic update)

Drawer do lead:
  Dados completos + valor estimado
  Timeline de interações (nota, ligação, email, whatsapp…)
  Tarefas com data/hora de follow-up
  Botões: Enviar proposta · Ganho · Perdido

── ESTOQUE ───────────────────────────────────────────────────────────
Decremento automático ao confirmar pagamento (webhook)
Alertas em /admin/estoque e /admin/dashboard quando qty ≤ stock_min_alert
Campo stock_min_alert configurável por produto no admin

── MARKETING (automações) ────────────────────────────────────────────
Automação 1 — Carrinho abandonado:
  Trigger: cart com items há mais de 2h sem checkout
  Ação: email via Resend + cupom 5% de desconto

Automação 2 — Pós-compra:
  Trigger: status = 'delivered'
  Ação: email pedindo avaliação + sugestão de produtos relacionados

Automação 3 — Reativação:
  Trigger: cliente sem compra há 60 dias
  Ação: email com oferta personalizada baseada no histórico

Campanhas manuais: editor simples, preview, agendamento, métricas.

── NOTA FISCAL (registro externo) ────────────────────────────────────
Emissão continua no sistema fiscal atual da empresa.
Admin registra em /admin/pedidos/:id:
  invoice_number (ex: "NF 1234")
  invoice_url (URL do PDF da NF)
Cliente visualiza e faz download em /conta/pedidos/:id.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 6 — COMPONENTES DE LAYOUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── HEADER DA LOJA ────────────────────────────────────────────────────
Position: sticky top-0 · z-index: 50
bg: #FFFFFF · border-bottom: 1.5px solid #E2E8F2
shadow: 0 1px 4px rgba(15,23,42,.06) · height: 64px

Coluna esquerda (1/4):
  <img src="/assets/logo-navbar.png" height="44" alt="Led Maricá">

Coluna centro (2/4):
  Barra de busca: input pill (border-radius:999px) com ícone lupa
  Links de navegação: Início · Catálogo · Promoções · Contato

Coluna direita (1/4):
  - Ícone usuário → menu dropdown (logado: nome + avatar · não logado: Login)
  - Ícone carrinho com badge (quantidade de itens)
  - Botão pequeno "Falar com IA" (outline azul · DM Sans 500 12px)

Mobile: hamburger menu lateral + busca expansível no topo

── FOOTER DA LOJA ────────────────────────────────────────────────────
bg: #1A56DB · padding: 48px 0 24px · texto branco

Grid 4 colunas:

Coluna 1 — Marca:
  <img src="/assets/logo-footer.png" width="160" alt="Led Maricá">
  "Qualidade que ilumina o seu projeto."
  WhatsApp: (21) 98212-6467 (ícone + link wa.me)
  Ícones redes sociais (Instagram · Facebook)

Coluna 2 — Links rápidos:
  Catálogo · Promoções · Sobre nós · Contato · Blog

Coluna 3 — Categorias:
  Iluminação LED · Disjuntores · Fios e Cabos
  Refletores · Tomadas · Quadros Elétricos

Coluna 4 — Informações:
  Formas de pagamento (logos: Visa, Master, PIX, Boleto)
  Política de troca · Prazo de entrega
  CNPJ: XX.XXX.XXX/0001-XX

Rodapé (border-top: 1px solid rgba(255,255,255,.15)):
  "© 2025 Led Maricá · Maricá/RJ"
  "Desenvolvido por SC Moreira Tech"

── LAYOUT ADMIN ─────────────────────────────────────────────────────

Sidebar fixa (240px · bg: #FFFFFF · border-right: 1px solid #E2E8F2):
  Topo: logo (80px) + nome "Painel Admin"
  Navegação com ícones Lucide + labels:
    Dashboard       (LayoutDashboard)
    Pedidos         (ShoppingCart) + badge pedidos novos
    Produtos        (Package)
    Estoque         (Warehouse) + badge alertas
    Clientes        (Users)
    CRM / Leads     (Target) + badge leads novos
    Marketing       (Megaphone)
    Dashboards      (BarChart3)
    Configurações   (Settings)
  Rodapé: avatar + nome + "Sair"

Topbar (64px · bg: #FFFFFF · border-bottom: 1px solid #E2E8F2):
  Breadcrumb da página atual
  Buscador global (pedidos, produtos, clientes)
  Sino de notificações com dropdown (estoque crítico, pedidos novos)
  Avatar do admin com menu dropdown

Área de conteúdo:
  bg: #F4F6FA · padding: 24px
  Cards e tabelas sempre em bg: #FFFFFF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 7 — INTEGRAÇÕES EXTERNAS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── MERCADO PAGO ─────────────────────────────────────────────────────
SDK: @mercadopago/sdk-js (frontend) + SDK Node (Edge Function)
Variável: MERCADOPAGO_ACCESS_TOKEN

Criar preference:
  POST https://api.mercadopago.com/checkout/preferences
  {
    items: [{ title, quantity, unit_price, currency_id: 'BRL' }],
    payer: { email, first_name, last_name },
    back_urls: {
      success: "https://ledmarica.com.br/pedido/:id/confirmacao",
      failure: "https://ledmarica.com.br/checkout?payment=error",
      pending: "https://ledmarica.com.br/pedido/:id/confirmacao"
    },
    auto_return: "approved",
    notification_url: "https://.../functions/mercadopago-webhook",
    statement_descriptor: "LED MARICA",
    installments: 12,
    payment_methods: { excluded_payment_types: [] }
  }

── MELHOR ENVIO ──────────────────────────────────────────────────────
Variável: MELHOR_ENVIO_TOKEN
Base URL: https://www.melhorenvio.com.br/api/v2

POST /me/shipment/calculate:
  {
    from: { postal_code: "24900000" },
    to:   { postal_code: <cep_destino> },
    package: { weight: <kg>, height: <cm>, width: <cm>, length: <cm> },
    options: { insurance_value: <total>, receipt: false, own_hand: false }
  }

Retorno: array de opções com id, name, price, delivery_time (business_days)
Exibir: serviço, prazo, preço formatado (R$ X,XX)
Cache: 30min (key: CEP+peso+dimensões)

── VIACEP ────────────────────────────────────────────────────────────
GET https://viacep.com.br/ws/{CEP}/json/
Chamada no onBlur do campo CEP
Auto-preenche: logradouro, bairro, localidade (cidade), uf (estado)
Loading spinner enquanto busca
Erro: "CEP não encontrado" se retornar { erro: true }

── RESEND ────────────────────────────────────────────────────────────
Variável: RESEND_API_KEY
From: "Led Maricá <noreply@ledmarica.com.br>"

Templates HTML responsivos (identidade visual da marca — fundo branco,
azul #1A56DB como cor primária, Plus Jakarta Sans para títulos):

  1. Confirmação de pedido
     Assunto: "Pedido #{{order_number}} confirmado!"
     Conteúdo: resumo dos itens, total, endereço, prazo estimado

  2. Pedido enviado
     Assunto: "Seu pedido está a caminho!"
     Conteúdo: código de rastreio com link, data estimada de entrega

  3. Pedido entregue
     Assunto: "Pedido entregue! Como foi a experiência?"
     Conteúdo: avaliação + sugestão de produtos

  4. Carrinho abandonado (automação)
     Assunto: "Você esqueceu algo no carrinho 🛒"
     Conteúdo: itens + botão "Finalizar compra" + cupom 5%

  5. Reativação (automação)
     Assunto: "Sentimos sua falta, {{nome}}!"
     Conteúdo: oferta especial + produtos em destaque

── ANTHROPIC CLAUDE ──────────────────────────────────────────────────
Variável: ANTHROPIC_API_KEY
Endpoint: POST https://api.anthropic.com/v1/messages
Model: claude-3-5-haiku-20241022

Headers: { "anthropic-version": "2023-06-01" }
max_tokens: 1024

System prompt completo da Edge Function:
  "Você é o assistente virtual da Led Maricá, loja de material elétrico
  e iluminação em Maricá/RJ. Responda sempre em português brasileiro,
  de forma técnica, precisa e prestativa.

  Você pode: responder dúvidas sobre produtos elétricos e LEDs,
  recomendar produtos conforme a necessidade do cliente, informar preços
  e disponibilidade, calcular quantidades para projetos, capturar o nome
  e email do cliente para o CRM, e oferecer transferência para WhatsApp
  (21) 98212-6467 quando necessário.

  Retorne SEMPRE um JSON no formato:
  {
    message: string,
    products: [{ id, name, price }] | [],
    intent: 'info' | 'recommendation' | 'lead_capture' | 'transfer',
    leadData: { name?, email?, interest? } | null
  }"

── SUPABASE AUTH ─────────────────────────────────────────────────────
Providers habilitados: Email/Senha + Google OAuth
Redirect URL após login: /conta
Criar profile automaticamente via trigger no after insert on auth.users

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 8 — VARIÁVEIS DE AMBIENTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

── .env.local (frontend Vite) ────────────────────────────────────────
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbG...
VITE_MERCADOPAGO_PUBLIC_KEY=APP_USR-xxxx
VITE_SITE_URL=https://ledmarica.com.br

── Supabase Edge Functions / Vercel (servidor) ───────────────────────
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...
MERCADOPAGO_ACCESS_TOKEN=APP_USR-xxxx
MELHOR_ENVIO_TOKEN=eyJhbG...
RESEND_API_KEY=re_xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx
STORE_ZIP_CODE=24900000
STORE_WHATSAPP=5521982126467
STORE_NAME=Led Maricá
STORE_EMAIL=contato@ledmarica.com.br

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 9 — REGRAS DE NEGÓCIO IMPORTANTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.  Frete grátis para pedidos acima de R$ 199,00 (configurável no admin)
2.  Parcelamento até 12x sem juros — gerido pelo Mercado Pago
3.  Estoque mínimo configurável por produto — alertas automáticos
4.  NF emitida fora da plataforma — admin registra número e PDF
5.  Chat IA disponível em todas as páginas públicas como widget flutuante
6.  Admin pode assumir e atualizar manualmente qualquer pedido
7.  Leads criados automaticamente pelo chat e pelo checkout de visitante
8.  Carrinho anônimo (session_id) migrado para o usuário ao fazer login
9.  Slugs gerados automaticamente a partir do nome do produto
10. Preço de custo visível apenas para admins — nunca exposto ao cliente
11. Fotos armazenadas no Supabase Storage (bucket: products-images)
12. Todos os valores monetários em BRL com 2 casas decimais (NUMERIC 10,2)
13. SEO: meta tags (title, description, OG) em todas as páginas
14. Responsivo: mobile-first, funcionar em 320px+ sem quebrar
15. Loading states em TODAS as operações assíncronas (skeleton ou spinner)
16. Error boundaries em cada página — nunca mostrar tela em branco
17. Toasts de feedback para todas as ações do usuário (sucesso + erro)
18. Dados sensíveis (custo, admin_notes) nunca enviados para o cliente
19. RLS no Supabase deve ser testado — nunca confiar só no frontend
20. Webhook do Mercado Pago deve validar a assinatura antes de processar

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SEÇÃO 10 — ORDEM DE IMPLEMENTAÇÃO
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FASE A — Fundação (fazer primeiro):
  [ ] Configurar Supabase + criar todas as 11 tabelas com RLS
  [ ] Configurar autenticação (email/senha + Google)
  [ ] Criar src/styles/tokens.css com todas as CSS variables
  [ ] Componentes base: Button, Input, Card, Badge, Toast, Modal
  [ ] Header + Footer + layout de página (loja e admin)
  [ ] Sistema de rotas com proteção por role (admin guard)
  [ ] Upload dos 3 arquivos de logo em public/assets/

FASE B — Loja core:
  [ ] Home page completa com todas as seções
  [ ] Catálogo com filtros, busca e paginação
  [ ] Página de produto com galeria e calculadora de frete (ViaCEP + Melhor Envio)
  [ ] Carrinho global (Zustand + persistência + sync Supabase)
  [ ] CartDrawer lateral

FASE C — Checkout e pagamento:
  [ ] Checkout wizard 3 etapas
  [ ] Integração Mercado Pago (preference + redirect)
  [ ] Edge Function webhook (validação + atualização de order)
  [ ] Emails transacionais via Resend (confirmação, enviado, entregue)
  [ ] Página de confirmação de pedido
  [ ] Área do cliente (/conta/pedidos)

FASE D — Admin core:
  [ ] Dashboard com KPIs, gráficos e alertas
  [ ] Gestão de pedidos (lista + detalhe + atualizar status + NF)
  [ ] CRUD de produtos com upload de imagens
  [ ] Gestão de estoque com alertas visuais

FASE E — IA, CRM e marketing:
  [ ] Widget de chat IA flutuante em todas as páginas
  [ ] Edge Function de IA (Claude API)
  [ ] Página /chat expandida
  [ ] CRM kanban de leads (drag-and-drop)
  [ ] Drawer de detalhe do lead
  [ ] Automações de email (carrinho abandonado, pós-compra, reativação)
  [ ] Interface de campanhas no admin

FASE F — Polish e extras:
  [ ] Dashboards adicionais (vendas, estoque, leads, logística)
  [ ] SEO: meta tags, sitemap.xml, robots.txt
  [ ] Performance: lazy loading, code splitting, image optimization
  [ ] Testes básicos de RLS e fluxo de compra end-to-end

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  INFORMAÇÕES DA EMPRESA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Nome:         Led Maricá
Segmento:     Material Elétrico e Iluminação
Cidade:       Maricá, Rio de Janeiro — RJ
WhatsApp:     (21) 98212-6467
CEP da loja:  24900-000
Desenvolvido: SC Moreira Tech

════════════════════════════════════════════════════════════════════
  FIM DO PROMPT — LED MARICÁ · FASE 1 · SC MOREIRA TECH · 2025
════════════════════════════════════════════════════════════════════
gerenciar meus dados confidenciais

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://www-ledmarica-com-br.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3f0ae235-0d23-458c-97a5-352d790386aa).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
