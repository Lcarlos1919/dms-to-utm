# Plano de ação do Vertix

**Última revisão:** 2026-11-17
**Base do código:** branch `claude/confident-pascal-cy49z6`

Documentos irmãos: `ROADMAP.md` (visão e fases) e `TIMELINE.md` (histórico com commits).

Legenda: `[x]` feito · `[ ]` a fazer · ⚠️ bloqueia outras tarefas.

---

## 1. O que já foi feito

### Base da aplicação
- [x] Next.js 16, React 19, TypeScript e pnpm.
- [x] Login e cadastro com Clerk, marca Vertix nas telas de autenticação.
- [x] Webhook Clerk verificado (`app/api/webhooks/clerk/route.ts`).
- [x] Supabase com schema base (`001`), segurança admin (`002`), RBAC de staff (`003`), remoção do admin legado (`004`) e código repetido de vértices (`005_vertices_codigo_repetido`).
- [x] Landing page com seções de recursos, preços, depoimentos e CTA.

### Fluxo por coordenadas
- [x] Upload e validação de PDF (`lib/pdf-validation.ts`).
- [x] Parser do memorial com `unpdf` e detecção de datum, fuso e hemisfério.
- [x] Conversão DMS/UTM, fechamento, área e perímetro.
- [x] Mapa Leaflet, edição de vértices, reprocessamento e repetição de projetos com erro.
- [x] Exportação DXF R12 e XLSX.
- [x] Exportação KML 2.2 (WGS84, bloqueio de SAD69/CRS inválido, limites do Brasil) com 8 testes.
- [x] Fixtures sintéticas em `lib/topocad/__fixtures__` (normal, quebra de linha, Unicode, sem vértices, vazio, aberto).

### Administração e planos
- [x] Painel admin: usuários, projetos, uso, logs, planos, assinaturas, staff e configurações.
- [x] RBAC de staff via organização Clerk, convites e auditoria.
- [x] Download do PDF original e preparação de DXF/XLSX auditados.
- [x] Exclusão de projetos com verificação de permissão.
- [x] Planos `free`/`pro`, limite gratuito mensal configurável e créditos bônus.
- [x] Acesso por ferramenta e plano (`memorial_azimute`, `export_kml`) editável no admin.

### Fluxo por azimute (parcial)
- [x] Campo `memorial_type` e upload de memorial + planta.
- [x] Biblioteca `lib/vertix-core` (ângulos, poligonal, âncora, lote, memorial, base fundiária).
- [x] D1 — leitura dos PDFs e tela de revisão (restaurada do commit `255657b`).
- [x] D2 — busca do lote na base fundiária (Supabase + GeoPortal) e encaixe automático.
- [x] D3 — ponto de partida pela base, digitado (UTM ou lat/long) ou clicado no mapa.
- [x] D4 — poligonal com compensação de Bowditch, fechamento, área e perímetro.
- [x] D5 — vértices gravados; mapa, edição e exportação iguais ao fluxo por coordenadas.
- [x] Pipeline automático: ao enviar, o memorial sai **pronto** quando há coordenada no texto ou encaixe seguro no lote.
- [x] Leitor tolerante a vários formatos; memorial enviado como "coordenadas" sem coordenadas passa para o fluxo por azimute.
- [x] Testes do motor: `pnpm run test:azimute` (12 casos).

### Validações registradas
- [x] Revisão de 2026-11-17: `tsc`, build com checagem de tipos ligada, `test:kml` 8/8 e `test:azimute` 12/12.
- [x] `pnpm exec tsc --noEmit`, `pnpm run build` e `pnpm run test:kml` — passaram em 2026-10-29.

---

## 2. O que falta fazer

### Etapa 1 — Estabilizar (P0) ⚠️

- [x] **1.1** Restaurar os 11 arquivos do PR #14 a partir de `255657b` em um branch, conferir com `tsc` e build e abrir PR.
  - `lib/azimute/`, `lib/vertix-core/planta.ts`, `lib/vertix-core/revisao.ts`
  - `app/api/projetos/[id]/azimute/route.ts`, `components/dashboard/azimute-revisao.tsx`, ajuste em `app/dashboard/projeto/[id]/page.tsx`
  - `supabase/006_feature_access.sql`, `007_base_fundiaria.sql`, `007b_verificacao.sql`, `008_azimute_dados.sql`
- [x] **1.2** Corrigir `supabase/005_project-type.sql` (agora `005b_project-type.sql`): remover o `insert into public.feature_access` (tabela inexistente); a configuração fica em `app_settings`, criada pelo `006`.
- [x] **1.3** Renumerar os dois `005` para deixar a ordem de execução sem ambiguidade e atualizar `verify.sql`.
- [x] **1.4** SQL `005b`–`008` aplicados e conferidos no Supabase (2026-11-18): base fundiária com 114.256 lotes, `buscar_lote` ok, RLS ligada, bucket privado, PostGIS 3.3.7.
- [ ] **1.5** Conferir RLS, Storage privado, isolamento por `user_id`, webhook Clerk e permissões de staff em Preview.
- [ ] **1.6** Teste com login real: usuário comum e staff, criar/processar/editar/exportar projeto, acesso negado e sessão expirada, desktop e celular.
- [ ] **1.7** Combinar uma regra para o v0: antes de "restaurar" ou fazer merge, comparar com o `main` atual.

### Etapa 2 — Fluxo por azimute (P1)

- [x] D2 — busca do lote e encaixe automático (`lib/azimute/base.ts`).
- [x] D3 — tela do ponto de partida (`components/dashboard/azimute-ancora.tsx`).
- [x] D4 — poligonal compensada (`lib/vertix-core/montagem.ts`).
- [x] D5 — gravação do projeto pronto (`lib/azimute/processar.ts`).
- [ ] **D6** Receber os memoriais de exemplo, rodar cada um pelo leitor e ajustar os formatos que falharem; transformar cada exemplo anonimizado em teste.
- [ ] Adicionar ao repositório o importador da base SEDAM para `fundiario_lotes` (hoje a base é importada fora do repositório).
- [ ] Testar no navegador, com login, o envio, a revisão, o ponto de partida (base, digitado, mapa) e as exportações.
- [ ] Liberar `memorial_azimute` para os planos desejados no admin quando D6 estiver validado.

### Etapa 3 — Qualidade do motor (P1)

- [x] Testes do motor de coordenadas com as fixtures (`pnpm run test:topocad`, 6 casos: SIGEF, quebra de linha, Unicode, sem vértices, PDF vazio, poligonal aberta, edição).
- [ ] Ampliar os testes com datum, fuso/hemisfério declarados e memoriais reais anonimizados.
- [ ] Testes de `lib/vertix-core` (azimute → coordenadas, fechamento angular e linear).
- [x] `pnpm test` roda todos os testes (KML, azimute e coordenadas).
- [ ] Configurar o ESLint: o script `lint` existe, mas o ESLint não está instalado nem configurado.
- [ ] Validar com memoriais reais anonimizados e abrir DXF/XLSX/KML em QGIS, AutoCAD e Google Earth.
- [ ] Testar idempotência do reprocessamento e as rotas de exportação.

### Etapa 4 — Produto e administração (P2)

- [x] Município (e lote/gleba no XLSX) preenchido na exportação dos memoriais por azimute, a partir do cabeçalho lido.
- [ ] Proprietário e município nos memoriais por coordenadas: decidir se serão digitados ou extraídos; depois criar coluna e preencher o KML.
- [ ] Busca, filtros e paginação no painel admin.
- [ ] Métricas de uso (memoriais por mês, erros de processamento, exportações).
- [ ] Sincronização Clerk idempotente; decidir se organizações serão também donas de dados.

### Etapa 5 — Monetização (P2)

- [ ] Escolher provedor de pagamento e definir preços.
- [ ] Ligar a assinatura `pro` ao pagamento (checkout, webhook, cancelamento).
- [ ] Atualizar a página de planos e o admin de assinaturas com dados reais.

### Etapa 5b — Inteligência fundiária (P2) — ver `ROADMAP.md` Fase 7 e `MERCADO.md`

- [ ] **F4** Adicionar coluna `geometry` (SRID 4674) com índice GiST em `fundiario_lotes`, preenchida a partir do JSON (SQL novo, idempotente).
- [ ] **F3** Importador dos shapefiles do Acervo Fundiário/SIGEF de RO (parcelas certificadas) para uma tabela própria, com data da base e atualização periódica.
- [ ] **F1** Checagem de sobreposição ao concluir o projeto: parcelas SIGEF e lotes SEDAM que intersectam o polígono, com área e percentual; aviso na tela e no relatório.
- [ ] **F2** Exportar confrontantes num raio configurável (padrão 1 km) em DXF/KML.
- [ ] Mostrar ao usuário a data da base usada em cada conferência.
- [ ] Revisar termos de uso: citar as fontes públicas e deixar claro que o produto é o processamento, não o dado.

### Etapa 5c — Mercado e vendas (P2) — ver `MERCADO.md`

- [ ] Decidir o foco inicial: Rondônia (venda direta) ou Brasil (anúncios).
- [ ] Levantar a lista pública de credenciados no SIGEF em RO e os polos (Porto Velho, Ji-Paraná, Vilhena, Ariquemes, Cacoal, Rolim de Moura).
- [ ] Validar preço do Pro (hipótese R$ 69,90–99,90/mês) com 5–10 profissionais antes de ligar a cobrança.

### Etapa 6 — Escala e operação (P3)

- [ ] Testes de integração para rotas, RLS e Storage.
- [ ] E2E com login cobrindo projeto, processamento, edição, downloads e admin.
- [ ] Logs estruturados, alertas e monitoramento de erros.
- [ ] Processamento de PDFs grandes e muitos vértices.
- [ ] Rotina de deploy: Preview, teste com login, revisão de logs e plano de rollback antes de Production.

---

## 3. Antes de começar qualquer tarefa

1. Ler `README.md`, `ROADMAP.md`, `TIMELINE.md`, este arquivo e `PROJECT-CONTINUITY-SKILL.md`.
2. Conferir branch, `git status`, `package.json` e os nomes das variáveis de ambiente, sem imprimir valores.
3. Identificar a área: tela, motor geoespacial, autenticação, banco, webhook ou admin.
4. Rastrear quem chama o código e quem consome os dados antes de editar.
5. Rodar `pnpm exec tsc --noEmit`, `pnpm run test:kml` e `pnpm run build` antes de abrir o PR.
6. Ao concluir, marcar a tarefa aqui e registrar o marco em `TIMELINE.md`.

## 4. Registro de decisões

Use este formato no PR ou no commit:

- **Decisão:**
- **Motivo:**
- **Alternativas descartadas:**
- **Arquivos:**
- **Risco:**
- **Validação:**
- **Rollback:**
