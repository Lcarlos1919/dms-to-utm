# Roadmap do TopoCAD

## 1. Visão do produto

O TopoCAD transforma memoriais descritivos em dados geoespaciais utilizáveis: leitura de PDF, extração de vértices, conversão para coordenadas UTM, validação geométrica, visualização, edição e exportação.

## 2. Estado atual

- Hardening administrativo aplicado em `lib/auth.ts`, `lib/admin-auth.ts`, `lib/audit.ts` e `proxy.ts`.
- Scripts SQL de verificação e remoção de compatibilidade legada adicionados em `supabase/verify.sql` e `supabase/004_drop_legacy_admin.sql`.
- Next.js 16 App Router, React 19 e TypeScript.
- Clerk para autenticação, usuários e organizações.
- Supabase para banco, Storage e operações server-side.
- Rota de webhook Clerk em `app/api/webhooks/clerk/route.ts`.
- Dashboard de projetos em `app/dashboard`.
- Painel administrativo em `app/admin`.
- Motor geoespacial e parser em `lib/engine` e `lib/topocad`.
- Exportações PDF/DXF/XLSX/ZIP em `app/api` e `lib/topocad`.
- RLS e schema principal em `supabase/001_schema.sql`; segurança administrativa em `supabase/admin-security.sql`.

## 3. Prioridades

### P0 — estabilidade e segurança
1. Corrigir os erros TypeScript existentes em `lib/topocad/exportar.ts` e `lib/topocad/motor.ts`.
2. Executar e versionar as migrações SQL em um ambiente Supabase controlado.
3. Confirmar variáveis de ambiente Clerk, Supabase, webhook e sessão admin em Preview e Production.
4. Validar RLS, escopo por `user_id`, upload privado e autorização administrativa.
5. Remover diagnósticos temporários de acesso admin após a investigação.

### P1 — fluxo principal
1. Cobrir parser com fixtures de memorial normal, Unicode, quebra de linha, vazio, sem vértices e polígono aberto.
2. Tornar processamento idempotente e observável.
3. Melhorar estados de loading, erro, retry e processamento.
4. Validar edição de vértices, fechamento, área, perímetro e exportações.

### P2 — administração e produto
1. Finalizar usuários, permissões, créditos, auditoria e projetos no painel admin.
2. Integrar perfis Clerk por webhook com operações idempotentes.
3. Implementar planos e cobrança real somente após definir provedor e preços.
4. Adicionar busca, filtros, paginação e métricas ao painel.

### P3 — qualidade e escala
1. Testes unitários do parser, geodesia, geometria e exportadores.
2. Testes de integração de rotas e RLS.
3. Testes E2E de autenticação, projeto, processamento e admin.
4. Instrumentação de erros, métricas, logs estruturados e alertas.
5. Otimização de arquivos grandes, filas e processamento assíncrono.

## 4. Regras arquiteturais

- Não usar `localStorage` para dados persistentes.
- Toda consulta que toca dados do usuário deve filtrar por `user_id`.
- Segredos apenas no ambiente; nunca em código, documentação ou logs.
- Validação de entrada com Zod antes de persistir ou processar.
- Componentes de interface em `components`; regras de domínio em `lib`; rotas finas.
- Reutilizar componentes shadcn existentes antes de criar novos.
- Toda alteração deve preservar mobile, acessibilidade, estados de erro e segurança.

## 5. Critério de pronto

Uma entrega só está pronta quando compila, passa lint/testes aplicáveis, foi validada no navegador quando houver UI, possui migração/configuração documentada e não deixa segredos ou logs de identificação em produção.

## 6. Próxima sequência recomendada

1. Corrigir TypeScript.
2. Criar suíte mínima de testes do motor TopoCAD.
3. Validar Supabase/Clerk/webhook em Preview.
4. Testar o fluxo completo com um memorial real anonimizado.
5. Corrigir autorização e auditoria admin.
6. Fazer deploy de produção e executar checklist de smoke test.

## 7. Fora de escopo sem decisão explícita

Não introduzir OAuth adicional, outro banco, outro provedor de pagamentos, filas externas ou troca de framework sem registrar a decisão e seu impacto.

Última revisão: 2026-10-15.

**Nota:** este arquivo é o mapa vivo do produto; atualize o estado e as prioridades após cada marco relevante.
