# Prompt — Landing page do Vertix

> Use este documento como especificação completa para gerar (ou regerar) a landing page do **Vertix**. Ele descreve o produto, a ordem das seções, o conteúdo de cada uma, todos os links/âncoras e as regras visuais. Os textos estão em português do Brasil e devem ser mantidos assim.

---

## 1. Contexto do produto

- **Nome:** Vertix
- **O que faz:** transforma memoriais descritivos (PDF SIGEF/INCRA) em projetos topográficos. Lê os vértices, azimutes e distâncias do PDF, converte coordenadas DMS → UTM (SIRGAS 2000, fusos 18S a 25S), mostra o polígono em um preview 2D, permite revisar/editar a tabela de vértices e exporta **XLSX**, **DXF** (camadas prontas para o AutoCAD) e **KML** (WGS84, para Google Earth).
- **Público:** topógrafos, engenheiros agrimensores, analistas de georreferenciamento.
- **Proposta de valor (uma frase):** "Do memorial descritivo em PDF ao DXF pronto no CAD, sem retrabalho manual."
- **Modelo comercial:** plano Grátis (3 memoriais/mês) e plano Pro ("Em breve").
- **Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, shadcn/ui, framer-motion / motion, lucide-react, Clerk (autenticação), Lenis (smooth scroll), Vercel Analytics.

---

## 2. Mapa de rotas e links

### 2.1 Rotas da aplicação usadas pela landing

| Rota | Tipo | Comportamento |
|---|---|---|
| `/` | Pública | A landing page |
| `/sign-up` | Pública (Clerk) | Criar conta, destino de todos os CTAs "Testar grátis" e "Começar grátis" |
| `/sign-in` | Pública (Clerk) | Login, link "Entrar" da navbar |
| `/dashboard` | Protegida | Redireciona para `/sign-in` sem sessão. Área logada (lista de projetos) |
| `/dashboard/novo` | Protegida | Upload de novo memorial |
| `/dashboard/planos` | Protegida | Planos dentro da área logada |
| `/planos` | Redirect | Redireciona para `/dashboard/planos` (exige login, então **não** use este link na landing; use `/#precos`) |

### 2.2 Âncoras internas (IDs de seção)

Toda seção-alvo de link precisa do `id` abaixo e de `scroll-mt-20`, para compensar a navbar fixa.

| ID | Seção |
|---|---|
| `#recursos` | Recursos (features) |
| `#como-funciona` | Como funciona |
| `#depoimentos` | Depoimentos |
| `#precos` | Preços |
| `#precisao` *(adicionar)* | Impacto/Precisão (hoje sem id) |
| `#faq` *(nova)* | Perguntas frequentes |

Use sempre o formato `/#id` (com barra) nos links da navbar e do footer, para funcionarem também fora da home.

### 2.3 Tabela completa de links

| Origem | Texto | Destino |
|---|---|---|
| Navbar | Logo "Vertix" | `/` |
| Navbar | Recursos | `/#recursos` |
| Navbar | Como funciona | `/#como-funciona` |
| Navbar | Preços | `/#precos` |
| Navbar | FAQ *(novo)* | `/#faq` |
| Navbar | Entrar | `/sign-in` (`prefetch={false}`) |
| Navbar | Começar grátis (botão sólido) | `/sign-up` |
| Hero | Testar grátis (CTA principal, LiquidCtaButton) | `/sign-up` |
| Hero | Ver como funciona → | `#como-funciona` |
| Preços, card Grátis | Começar grátis | `/sign-up` |
| Preços, card Pro | Disponível em breve | sem link (`aria-disabled`) |
| CTA final | Testar grátis | `/sign-up` |
| CTA final | Ver planos → | `/#precos` |
| Footer, Produto | Recursos | `/#recursos` |
| Footer, Produto | Como funciona | `/#como-funciona` |
| Footer, Produto | Preços | `/#precos` |
| Footer, Produto | FAQ *(novo)* | `/#faq` |
| Footer, Conta *(nova coluna)* | Entrar / Criar conta | `/sign-in` / `/sign-up` |
| Footer, Legal | Termos de uso | `/termos` *(criar página; hoje é `#`)* |
| Footer, Legal | Privacidade | `/privacidade` *(criar página; hoje é `#`)* |
| Footer, Contato *(opcional)* | E-mail de suporte | `mailto:` (definir endereço) |

> Usuário já logado (Clerk `SignedIn`): troque "Entrar" + "Começar grátis" da navbar por um botão "Ir para o painel" → `/dashboard`. Os CTAs de cadastro podem continuar apontando para `/sign-up`, porque o Clerk redireciona quem já está logado.

---

## 3. Estrutura da página (ordem exata)

```tsx
// app/page.tsx
<main className="min-h-screen bg-zinc-950">
  <Navbar />               // components/ui/navbar.tsx
  <HeroSection />          // components/sections/hero-section.tsx
  <ImpactSection />        // components/sections/impact-section.tsx       id="precisao"
  <FeaturesSection />      // components/sections/features-section.tsx     id="recursos"
  <HowItWorksSection />    // components/sections/how-it-works-section.tsx id="como-funciona"
  <TestimonialsSection />  // components/sections/testimonials-section.tsx id="depoimentos"
  <PricingSection />       // components/sections/pricing-section.tsx      id="precos"
  <FaqSection />           // components/sections/faq-section.tsx          id="faq" (NOVA)
  <CtaSection />           // components/sections/cta-section.tsx
  <FooterSection />        // components/sections/footer-section.tsx
</main>
```

---

## 4. Conteúdo de cada seção

### 4.1 Navbar (fixa, flutuante)
- Header `fixed top-0 inset-x-0 z-40 p-4`. A `nav` é uma pílula: `max-w-5xl`, `h-12`, `rounded-full`, `bg-zinc-900/70`, `border-zinc-800/50`, `backdrop-blur-md`.
- Esquerda: logo em texto "Vertix" (`font-display`).
- Centro/direita: links (Recursos, Como funciona, Preços, FAQ), ocultos no mobile (`hidden md:flex`).
- Direita: "Entrar" (texto) e "Começar grátis" (botão claro `bg-zinc-100 text-zinc-900`).
- **Adicionar:** menu mobile (hambúrguer → Sheet/Drawer com os mesmos links).

### 4.2 Hero
- `min-h-screen`, centralizado, gradiente sutil `from-zinc-900/50` no topo.
- **Badge:** ícone Sparkles + "Novo — Do PDF ao DXF em minutos".
- **H1 (duas linhas):** "Memorial em PDF." / "DXF pronto no CAD." (a segunda linha com gradiente `zinc-500 → zinc-300 → zinc-500` via `bg-clip-text`).
- **Subtítulo:** "Envie o memorial descritivo, converta DMS para UTM automaticamente, confira o polígono e exporte planilha e DXF para o AutoCAD. Sem retrabalho manual."
- **CTAs:** `LiquidCtaButton` "Testar grátis" → `/sign-up` e link secundário "Ver como funciona →" → `#como-funciona`.
- **Prova social:** avatares sobrepostos, 5 estrelas, nota "4,9" e "Usado por **topógrafos e engenheiros**". Não repita a mesma foto, como acontece hoje com o 4º e o 5º avatar.
- **Opcional:** mockup/screenshot do dashboard (tabela + polígono) abaixo dos CTAs.

### 4.3 Impacto / Precisão (`#precisao`)
- Eyebrow "Precisão". H2 "Feito para o dia a dia do topógrafo". Subtítulo "Compatível com memoriais SIGEF/INCRA e com o fluxo que você já usa no CAD."
- Grid 2×2 (mobile) / 4 colunas (desktop) de métricas:
  - **SIRGAS**: Datum 2000, padrão oficial brasileiro
  - **18S–25S**: Fusos UTM, cobertura nacional
  - **<1 min**: Por memorial, do PDF à planilha
  - **3**: Formatos, XLSX, DXF e KML *(hoje está "2 / XLSX e DXF"; atualizar, porque o KML já existe)*

### 4.4 Recursos (`#recursos`)
- Eyebrow "Recursos". H2 "Tudo o que você precisa, do memorial ao CAD". Subtítulo "Automatize a etapa mais repetitiva do levantamento e ganhe tempo para o que importa."
- Bento grid `md:grid-cols-5` com 6 cards (span 3/2 alternado), cada um com ícone, título, descrição e mini-preview:
  1. **Leitura de PDF** (FileText, span 3): "Extrai vértices, azimutes e distâncias do memorial SIGEF/INCRA." Preview: trecho em mono "Do vértice V-01, segue com azimute de 92°14'08" e distância de 264,31 m..."
  2. **Conversão DMS → UTM** (Compass, span 2): "SIRGAS 2000, fusos 18S a 25S, sem fórmulas manuais."
  3. **Tabela editável** (Table2, span 2): "Corrija leituras incorretas direto na tabela." Preview: 3 linhas V-01..V-03 com E/N.
  4. **Preview 2D** (Map, span 3): "Visualize o polígono com zoom, pan e tooltip por vértice." Preview: SVG de polígono animado (`pathLength` 0→1 em view).
  5. **Área e perímetro** (Ruler, span 3): "Validação automática de fechamento, em m² e hectares."
  6. **Exportação** (Download, span 2): "Baixe XLSX, DXF e KML com camadas prontas para o AutoCAD." Preview: chips `.xlsx` `.dxf` `.kml`.

### 4.5 Como funciona (`#como-funciona`)
- Eyebrow "Como funciona". H2 "Três passos. Nenhuma fórmula." Subtítulo "Do memorial descritivo ao arquivo pronto para o CAD em poucos minutos."
- Lista ordenada (`<ol>`) com 3 cards:
  1. **Envie o PDF** (Upload): "Arraste o memorial descritivo SIGEF/INCRA. A leitura dos vértices é automática."
  2. **Revise e ajuste** (ListChecks): "Confira coordenadas, fuso e datum na tabela e valide o fechamento no preview 2D."
  3. **Exporte XLSX/DXF/KML** (FileDown): "Baixe a planilha e o desenho com camadas prontas para abrir no AutoCAD."

### 4.6 Depoimentos (`#depoimentos`)
- Pill "Depoimentos". H2 "Quem usa, recomenda". Subtítulo "Topógrafos e engenheiros que deixaram a digitação manual para trás."
- 3 colunas de cards em rolagem vertical infinita (`TestimonialsColumn`, durações 15s/19s/17s), com 2ª coluna `hidden md:block`, 3ª `hidden lg:block` e máscara de fade em cima/embaixo.
- Depoimentos atuais são **placeholders** (TODO: substituir por reais):
  - Mariana Costa, Topógrafa autônoma: "Eu digitava vértice por vértice no Excel. Agora envio o PDF e em um minuto tenho a planilha conferida."
  - Rafael Almeida, Engenheiro Agrimensor: "A conversão para UTM SIRGAS 2000 bate com o nosso software de campo e o DXF já abre organizado no AutoCAD."
  - Juliana Ribeiro, Analista de Georreferenciamento: "O preview 2D mostra na hora quando o polígono não fecha. Economiza horas de retrabalho."
- Faixa marquee horizontal: "Compatível com os padrões que você já usa": SIGEF · INCRA · SIRGAS 2000 · UTM · AutoCAD · DXF · KML.

### 4.7 Preços (`#precos`)
- Eyebrow "Preços". H2 "Preços simples e transparentes". Subtítulo "Sem taxas escondidas. Comece grátis e assine quando precisar de mais."
- 2 cards com efeito `BorderGlow` (`components/BorderGlow.jsx`):
  - **Grátis**, R$ 0/mês, "Para conhecer a ferramenta e projetos ocasionais". Itens: 3 memoriais por mês · Exportação XLSX, DXF e KML · Histórico de projetos. CTA "Começar grátis" → `/sign-up`. Card escuro (`#18181b`), glow azul/violeta.
  - **Pro** (destaque), "Em breve", "Para quem processa memoriais todos os dias". Itens: Memoriais ilimitados · Suporte prioritário · Histórico completo. CTA desabilitado "Disponível em breve". Card claro (`#f4f4f5`), glow âmbar/rosa/violeta.
- O componente também é reutilizado em `/dashboard/planos` com as props `compact`, `currentPlan` e `headingLevel`. Mantenha essa API.

### 4.8 FAQ (`#faq`), seção NOVA
- Eyebrow "FAQ". H2 "Perguntas frequentes". Use o `Accordion` do shadcn (`components/ui/accordion.tsx`).
- Perguntas sugeridas:
  1. Quais memoriais o Vertix aceita? (PDF de memorial descritivo SIGEF/INCRA com vértices, azimutes e distâncias.)
  2. Quais datums e fusos são suportados? (SIRGAS 2000, fusos UTM 18S a 25S. WGS84 é tratado como equivalente para o KML. SAD69 não é exportado.)
  3. Posso corrigir uma leitura errada? (Sim, a tabela de vértices é editável antes da exportação.)
  4. Quais arquivos posso exportar? (XLSX, DXF com camadas para AutoCAD e KML para Google Earth.)
  5. Meus PDFs ficam seguros? (Arquivos privados por conta, com autenticação Clerk e armazenamento Supabase.)
  6. Quanto custa? (Grátis até 3 memoriais/mês. Plano Pro em breve.) Inclua o link "Ver planos" → `#precos`.

### 4.9 CTA final
- H2 "Pronto para parar de digitar?". Texto "Envie seu primeiro memorial descritivo e tenha planilha e DXF prontos em minutos. Grátis para começar."
- `LiquidCtaButton` "Testar grátis" → `/sign-up` e link "Ver planos →" → `/#precos`.

### 4.10 Footer
- `border-t border-zinc-900`, grid 4 colunas: marca (2 colunas: "Vertix" + "Do memorial descritivo em PDF ao DXF pronto no CAD, sem retrabalho manual."), **Produto**, **Conta**, **Legal**.
- Remover o item duplicado "Planos" (hoje aponta para o mesmo `/#precos` que "Preços").
- Barra inferior: "© {ano atual} Vertix. Todos os direitos reservados." (gerar o ano dinamicamente) + links Termos/Privacidade.

---

## 5. Design system

- **Tema:** somente escuro (`<html class="dark">`, `colorScheme: dark`, `themeColor #09090b`). Fundo `bg-zinc-950`, texto `zinc-100`, textos secundários `zinc-500`, bordas `zinc-800/50` (hover `zinc-700/50`), cards `bg-zinc-900/50 rounded-2xl`. Seções alternadas com `bg-zinc-900/20` ou `/30`.
- **Paleta:** monocromática zinc. Cor só nos glows dos cards de preço e nas estrelas (`#FACC15`).
- **Tipografia:** `font-display` (Cal Sans) para H1/H2 e números; `font-heading` (Instrument Sans) para H3; corpo em Manrope (`--font-manrope`). Eyebrows: `text-sm uppercase tracking-wider text-zinc-500`.
- **Espaçamento:** seções `px-6 py-24`, containers `max-w-5xl` (preços `max-w-3xl`, depoimentos `max-w-6xl`, CTA `max-w-3xl`).
- **Movimento:** framer-motion com `initial {opacity:0, y:20}`, `whileInView {opacity:1, y:0}`, `viewport {once:true}` e stagger de 0.05–0.1s. Smooth scroll global via Lenis (`LenisProvider`). Respeitar `prefers-reduced-motion`.
- **Componentes reaproveitados:** `LiquidCtaButton` (`components/buttons/liquid-cta-button.tsx`, borda metálica líquida via `@paper-design/shaders-react`), `BorderGlow`, `TestimonialsColumn`, `Card` / `Accordion` do shadcn.

---

## 6. SEO e metadata (`app/layout.tsx`)

- `title`: "Vertix — Memorial descritivo em PDF para DXF"
- `description`: o texto do subtítulo do hero.
- `openGraph`: `locale pt_BR`, `type website`. **Adicionar** `og:image` (1200×630) e `twitter:card summary_large_image`.
- `lang="pt-BR"`. Ícones: `/icon.svg`, `/icon-light-32x32.png`, `/icon-dark-32x32.png`, `/apple-icon.png`.
- **Adicionar:** `app/sitemap.ts`, `app/robots.ts` (bloquear `/dashboard` e `/admin`), JSON-LD `SoftwareApplication` com `offers` do plano Grátis, e remover `generator: "v0.app"`.

---

## 7. Acessibilidade e qualidade

- Um único `<h1>` (hero). Cada seção com `<h2>`, cards com `<h3>`.
- Ícones decorativos com `aria-hidden`. SVGs informativos com `role="img"` e `aria-label`.
- `alt` descritivo nos avatares. Use `next/image` em vez de `<img>` para as fotos remotas e configure `images.remotePatterns` para `images.unsplash.com`.
- Não aninhe `<button>` dentro de `<Link>`. Hoje o `LiquidCtaButton` renderiza `<button>` dentro de `<Link>`: faça o componente aceitar `href` ou `asChild`.
- Contraste mínimo AA: `zinc-500` sobre `zinc-950` é o limite. Evite `zinc-600/700` em textos importantes.
- Layout responsivo sem scroll horizontal a 360px.

---

## 8. Checklist de pendências da versão atual

- [ ] Adicionar `id="precisao"` na seção de impacto
- [ ] Criar seção FAQ (`#faq`) e incluir nos links da navbar e do footer
- [ ] Criar páginas `/termos` e `/privacidade` (e liberá-las como públicas no `proxy.ts`)
- [ ] Incluir KML em métricas, recursos, passos, preços e marquee
- [ ] Menu mobile na navbar
- [ ] Estado logado na navbar (`/dashboard`)
- [ ] Substituir depoimentos e avatares placeholder por reais
- [ ] Remover "Planos" duplicado do footer e gerar o ano dinamicamente
- [ ] Corrigir `<button>` dentro de `<Link>` nos CTAs
- [ ] og:image, sitemap, robots, JSON-LD
