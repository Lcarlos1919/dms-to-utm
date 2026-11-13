# Plano de ação do Vertix

**Última revisão:** 2026-11-13
**Base do código:** `6f26ecd` (`main`)

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
- [x] D1 — leitura dos PDFs e tela de revisão (commit `255657b`). **Apagada depois; ver tarefa 1.1.**

### Validações registradas
- [x] `pnpm exec tsc --noEmit`, `pnpm run build` e `pnpm run test:kml` — passaram em 2026-10-29.

---

## 2. O que falta fazer

### Etapa 1 — Estabilizar (P0) ⚠️

- [ ] **1.1** Restaurar os 11 arquivos do PR #14 a partir de `255657b` em um branch, conferir com `tsc` e build e abrir PR.
  - `lib/azimute/`, `lib/vertix-core/planta.ts`, `lib/vertix-core/revisao.ts`
  - `app/api/projetos/[id]/azimute/route.ts`, `components/dashboard/azimute-revisao.tsx`, ajuste em `app/dashboard/projeto/[id]/page.tsx`
  - `supabase/006_feature_access.sql`, `007_base_fundiaria.sql`, `007b_verificacao.sql`, `008_azimute_dados.sql`
- [ ] **1.2** Corrigir `supabase/005_project-type.sql`: remover o `insert into public.feature_access` (tabela inexistente); a configuração fica em `app_settings`, criada pelo `006`.
- [ ] **1.3** Renumerar os dois `005` para deixar a ordem de execução sem ambiguidade e atualizar `verify.sql`.
- [ ] **1.4** No Supabase autorizado, listar quais scripts já foram aplicados, aplicar os que faltam na ordem e rodar `verify.sql`.
- [ ] **1.5** Conferir RLS, Storage privado, isolamento por `user_id`, webhook Clerk e permissões de staff em Preview.
- [ ] **1.6** Teste com login real: usuário comum e staff, criar/processar/editar/exportar projeto, acesso negado e sessão expirada, desktop e celular.
- [ ] **1.7** Combinar uma regra para o v0: antes de "restaurar" ou fazer merge, comparar com o `main` atual.

### Etapa 2 — Fluxo por azimute (P1)

- [ ] **D2** Importador da base fundiária SEDAM/RO para `fundiario_lotes`; ligar `lib/vertix-core/fundiario.ts` a uma rota de busca (banco + GeoPortal, com `fundiario_config`).
- [ ] **D3** Tela de ponto de amarração: escolher lote da base, digitar coordenada ou clicar no mapa; gravar `anchor_source`, datum, fuso e hemisfério.
- [ ] **D4** Calcular a poligonal com `lib/vertix-core` (ângulos, poligonal, lote): fechamento, área, comparação com a área oficial e avisos.
- [ ] **D5** Gravar os vértices em `project_vertices` e reutilizar mapa, edição e exportação DXF/XLSX/KML.
- [ ] Liberar `memorial_azimute` para os planos desejados no admin quando D5 estiver validado.

### Etapa 3 — Qualidade do motor (P1)

- [ ] Testes unitários do parser, DMS, datum, fuso/hemisfério, fechamento, área e perímetro usando as fixtures existentes.
- [ ] Testes de `lib/vertix-core` (azimute → coordenadas, fechamento angular e linear).
- [ ] Adicionar script `pnpm test` que rode todos os testes.
- [ ] Validar com memoriais reais anonimizados e abrir DXF/XLSX/KML em QGIS, AutoCAD e Google Earth.
- [ ] Testar idempotência do reprocessamento e as rotas de exportação.

### Etapa 4 — Produto e administração (P2)

- [ ] Decidir se proprietário e município serão digitados ou extraídos do memorial; depois criar coluna e preencher o KML.
- [ ] Busca, filtros e paginação no painel admin.
- [ ] Métricas de uso (memoriais por mês, erros de processamento, exportações).
- [ ] Sincronização Clerk idempotente; decidir se organizações serão também donas de dados.

### Etapa 5 — Monetização (P2)

- [ ] Escolher provedor de pagamento e definir preços.
- [ ] Ligar a assinatura `pro` ao pagamento (checkout, webhook, cancelamento).
- [ ] Atualizar a página de planos e o admin de assinaturas com dados reais.

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
