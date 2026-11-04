# Linha do tempo e plano de ação

**Atualizado em:** 2026-10-29

**Base revisada:** `2bedd40` — merge do PR #9, com a exportação KML.

## Objetivo

Dar continuidade ao Vertix e ao motor TopoCAD com mudanças pequenas, rastreáveis e compatíveis com o fluxo geoespacial. Separar o que foi validado no código do que ainda depende de sessão autenticada ou configuração no Supabase/Vercel.

## Linha do tempo confirmada

| Data | Marco | Evidência no Git |
| --- | --- | --- |
| 2026-10-27 | Refinamento da identidade de autenticação do Vertix | `78a657a` — `Refine Vertix auth branding` |
| 2026-10-27 | Permissões para exclusão de projetos | `d4ae616` — `Enforce project deletion permissions`; integrado pelo PR #8 |
| 2026-10-27 | Exportação KML no fluxo do projeto | `f5e026c` — `Add KML export support`; merge `2bedd40`, PR #9 |
| 2026-10-29 | Validação local da entrega KML | TypeScript, build, 8 testes KML, parsing XML e `git diff --check` passaram; o navegador confirmou `/sign-in`, mas os fluxos pós-login seguem pendentes |

Datas futuras não são estimadas aqui; a sequência abaixo indica ordem, não prazo.

## Estado atual por frente

- **Fundação:** `pnpm exec tsc --noEmit` e `pnpm run build` passaram na última validação registrada. A aplicação das migrações e o estado remoto de RLS/Storage não foram confirmados por esse build.
- **Motor e exportação:** KML 2.2 foi integrado; converte UTM para WGS84, fecha o polígono, inclui placemarks de vértices e `ExtendedData`, escapa texto XML e rejeita SAD69/CRS inválido/coordenadas fora do Brasil.
- **Uso e plano:** `lib/usage.ts` aplica limite gratuito mensal configurável (padrão 3), créditos bônus e uso ilimitado para `pro`. A contagem é de processamento de memoriais, não de downloads. Cobrança real não está conectada.
- **Dados KML:** datum, fuso e hemisfério já estão no schema do projeto. Proprietário e município não são armazenados; esses valores são exportados vazios até existir uma decisão de captura/persistência.
- **Administração:** permissões e auditoria estão no código. Validar a configuração SQL e os fluxos autenticados no ambiente de destino continua pendente.

## Plano de ação

### 1. Confirmar o ambiente de dados e segurança

- Revisar a ordem dos scripts `supabase/001_schema.sql`, `002_admin-security.sql`, `003_staff-rbac.sql`, `004_drop_legacy_admin.sql` e `005_vertices_codigo_repetido.sql`.
- Em ambiente autorizado, confirmar quais scripts já foram aplicados e executar `supabase/verify.sql`.
- Conferir RLS, Storage privado, escopo por `user_id`, webhook Clerk e permissões de staff.
- Não executar migrações no ambiente de produção sem revisão e aprovação explícita.

### 2. Rodar smoke test autenticado

- Usar uma conta de teste autorizada; verificar sign-in, sign-out, sessão expirada e redirects.
- Criar e processar PDF de teste; conferir estados do projeto, edição e geometria.
- Baixar DXF, XLSX e KML; conferir KML em um consumidor geográfico.
- Confirmar bloqueios KML para SAD69, datum/fuso ausentes ou inconsistentes e erro de coordenadas fora dos limites.
- Repetir em desktop e viewport móvel.

### 3. Completar cobertura geoespacial e metadados

- Construir fixtures de parser com DMS, Unicode, quebras de linha, datum, zona, vértices inválidos, fechamento, área e perímetro.
- Testar idempotência de reprocessamento e as rotas de exportação.
- Decidir se proprietário e município serão digitados ou extraídos do memorial; só então propor persistência/schema.

### 4. Preparar administração e produção

- Testar staff autorizado/não autorizado, auditoria, acesso direto, sessão expirada e ações destrutivas.
- Definir provedor/preços antes de implementar cobrança real.
- Fazer Preview, smoke test, revisão de logs e rollback antes de qualquer promoção para Production.

## Validações registradas

- [x] `pnpm exec tsc --noEmit` — passou em 2026-10-29.
- [x] `pnpm run test:kml` — 8 casos passaram em 2026-10-29.
- [x] `pnpm run build` — passou em 2026-10-29.
- [x] Parsing XML do KML gerado e `git diff --check` — passaram em 2026-10-29.
- [ ] UI autenticada no navegador — não concluída; a sessão de validação redirecionou para `/sign-in`.
- [ ] Migrações/RLS/Storage confirmados no Supabase de destino.
- [ ] Fluxo completo validado com memorial real anonimizado e ferramentas consumidoras.

## Fase 0 — entrada de qualquer novo agente

1. Ler `README.md`, `ROADMAP.md`, este arquivo e `PROJECT-CONTINUITY-SKILL.md`.
2. Conferir branch, status Git, `package.json`, `next.config.mjs`, `proxy.ts` e nomes de variáveis sem imprimir valores.
3. Identificar se a tarefa é UI, domínio geoespacial, autenticação, banco, webhook ou administração.
4. Rastrear chamadores, dados e consumidores antes de editar.
5. Registrar hipótese, arquivos afetados, risco e validação prevista.

## Registro de decisões

Use este formato no PR/commit ou ao concluir uma mudança:

- **Decisão:**
- **Motivo:**
- **Alternativas descartadas:**
- **Arquivos:**
- **Risco:**
- **Validação:**
- **Rollback:**
