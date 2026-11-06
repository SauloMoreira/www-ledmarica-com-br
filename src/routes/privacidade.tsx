import { createFileRoute, Link } from "@tanstack/react-router";
import { StoreLayout } from "@/components/layout/StoreLayout";
import { buildSeo } from "@/lib/seo";
import { formatDateBR } from "@/lib/dateBR";

export const Route = createFileRoute("/privacidade")({
  head: () =>
    buildSeo({
      title: "Política de Privacidade",
      description:
        "Política de Privacidade da Led Maricá em conformidade com a LGPD (Lei 13.709/2018). Saiba como tratamos seus dados pessoais.",
      url: "/privacidade",
    }),
  component: PrivacyPolicyPage,
});

const POLICY_SECTIONS: { title: string; content: string }[] = [
  {
    title: "Identificação do Controlador",
    content:
      "A Led Maricá, empresa de material elétrico e iluminação localizada em Maricá/RJ, é a controladora dos dados pessoais coletados nesta plataforma, nos termos da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD). Desenvolvimento tecnológico por SC Moreira Tech.",
  },
  {
    title: "Dados pessoais coletados",
    content:
      "Coletamos: dados de cadastro (nome, e-mail, telefone, CPF/CNPJ, endereço); dados de navegação (IP anonimizado, navegador, páginas visitadas, cliques); dados de compra (histórico de pedidos, produtos, valores, métodos de pagamento — sem dados de cartão); dados de interação (chat com IA, mensagens via WhatsApp, avaliações); e cookies conforme a seção específica.",
  },
  {
    title: "Finalidades do tratamento",
    content:
      "Execução de contrato (processar pedidos, entregas e pagamentos); comunicação (confirmações, atualizações e atendimento); marketing (ofertas e promoções, com consentimento); personalização (recomendações com base no histórico); analytics (melhoria da experiência); obrigação legal (NF-e e tributos); legítimo interesse (prevenção de fraudes e segurança).",
  },
  {
    title: "Base legal para o tratamento (Art. 7º LGPD)",
    content:
      "Consentimento (Art. 7º, I): cookies de marketing, publicidade e personalização. Execução de contrato (Art. 7º, V): pedidos e entregas. Obrigação legal (Art. 7º, II): dados fiscais (NF-e). Legítimo interesse (Art. 7º, IX): analytics anonimizados, prevenção de fraudes e segurança.",
  },
  {
    title: "Cookies e tecnologias de rastreamento",
    content:
      'Utilizamos 4 categorias de cookies: Necessários (autenticação, carrinho, sessão — sempre ativos); Analytics (Google Analytics, Microsoft Clarity — dados anonimizados); Marketing (Meta Pixel, Google Ads — publicidade direcionada); Personalização (recomendações e preferências de IA). Você pode gerenciar suas preferências a qualquer momento pelo botão "Gerenciar cookies" no rodapé.',
  },
  {
    title: "Compartilhamento de dados",
    content:
      "Compartilhamos com: Mercado Pago (processamento de pagamentos); Melhor Envio/Correios (cálculo e gestão de frete); Google/Meta (dados anonimizados, com consentimento); Resend (e-mails transacionais); Anthropic/Lovable AI (mensagens de chat — sem dados pessoais identificáveis). Não vendemos, alugamos ou cedemos dados a terceiros para fins não descritos.",
  },
  {
    title: "Seus direitos (Art. 18 LGPD)",
    content:
      "Você tem direito a: confirmação e acesso aos dados; correção; anonimização ou eliminação; portabilidade; revogação do consentimento; oposição ao tratamento; informação sobre compartilhamento. Para exercer, contate privacidade@ledmarica.com.br ou WhatsApp (21) 98212-6467. Responderemos em até 15 dias úteis.",
  },
  {
    title: "Retenção e eliminação de dados",
    content:
      "Dados de conta: enquanto ativa + 5 anos. Dados fiscais: 5 anos (CTN Art. 173). Navegação: máximo 2 anos. Cookies de marketing: máximo 90 dias (renovados com novo consentimento). Chat: 1 ano após a última interação.",
  },
  {
    title: "Segurança dos dados",
    content:
      "Adotamos medidas técnicas e organizacionais: criptografia em trânsito (SSL/TLS), autenticação segura, controle de acesso por funções (RLS), backups automáticos e monitoramento contínuo. Nenhum dado de cartão de crédito é armazenado em nossos servidores — o processamento é integralmente do Mercado Pago.",
  },
  {
    title: "Alterações na política",
    content:
      "Esta política pode ser atualizada periodicamente. Em mudanças significativas, notificaremos por e-mail ou aviso no site. A versão atualizada estará sempre disponível em ledmarica.com.br/privacidade. Em alterações na política de cookies, solicitaremos novo consentimento.",
  },
  {
    title: "Contato e canal do titular",
    content:
      "Led Maricá · Encarregado (DPO): SC Moreira Tech · E-mail: privacidade@ledmarica.com.br · WhatsApp: (21) 98212-6467 · Maricá/RJ. Caso não esteja satisfeito com nossa resposta, você pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD) — www.gov.br/anpd.",
  },
];

function PrivacyPolicyPage() {
  return (
    <StoreLayout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <nav className="text-xs text-muted-foreground mb-6">
          <Link to="/" className="hover:text-foreground">
            Início
          </Link>{" "}
          / <span className="text-foreground">Política de Privacidade</span>
        </nav>

        <h1 className="font-display font-bold text-3xl tracking-tight mb-2">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          Última atualização: {formatDateBR(new Date())} · Em conformidade com a LGPD
          (Lei 13.709/2018)
        </p>

        <div className="space-y-8">
          {POLICY_SECTIONS.map((section, i) => (
            <section key={section.title}>
              <h2 className="font-display font-semibold text-lg mb-2">
                {i + 1}. {section.title}
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                {section.content}
              </p>
            </section>
          ))}
        </div>

        <div className="mt-12 p-5 bg-primary-tint border border-primary/20 rounded-lg">
          <h3 className="font-display font-semibold text-base mb-1">Encarregado de Dados (DPO)</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <strong className="text-foreground">SC Moreira Tech</strong>
            <br />
            E-mail: privacidade@ledmarica.com.br
            <br />
            WhatsApp: (21) 98212-6467
          </p>
        </div>
      </div>
    </StoreLayout>
  );
}
