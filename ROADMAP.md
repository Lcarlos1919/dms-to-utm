# Roadmap do Vertix

**Última revisão:** 2026-10-29

**Referência de código:** merge do PR #9 (`2bedd40`, 2026-10-27).

## 1. Visão do produto

O Vertix transforma memoriais descritivos em projetos topográficos revisáveis: leitura de PDF, extração de vértices, conversão DMS/UTM, validação geométrica, visualização, edição e exportação. `TopoCAD` é o nome interno do motor geoespacial; a marca do produto é Vertix.

## 2. Estado atual verificado no código

### Entregue

- Next.js 16 App Router, React 19 e TypeScript.
- Clerk para autenticação, identidade e organização administrativa; Supabase para banco, Storage e operações server-side.
- Dashboard de projetos, processamento de memoriais, visualização e edição de vértices.
- Painel administrativo, permissões de staff e auditoria; a exclusão de projetos respeita as permissões existentes.
- Webhook Clerk em `app/api/webhooks/clerk/route.ts`.
- Exportação do usuário em DXF, XLSX e KML pelo fluxo do projeto.
- KML 2.2 em `lib/export/kml.ts`: converte UTM para WGS84 com `proj4`, fecha o anel, inclui os pontos e `ExtendedData`, escapa XML e valida limites geográficos do Brasil. SIRGAS 2000/WGS84 são tratados como equivalentes; SAD69 e CRS ausente/inconsistente são bloqueados.
- Download administrativo do PDF original e preparação de DXF/XLSX em `app/api/admin/project-download/route.ts`.
- Uso mensal de memoriais com plano `free`/`pro`, limite gratuito configurável e créditos bônus em `lib/usage.ts`.

### Limitações e estado externo ainda não confirmado

- Proprietário e município não são campos do modelo atual; o KML inclui os elementos correspondentes, mas seus valores ficam vazios. Definir captura manual ou extração e persistência antes de ampliar o schema.
- O fluxo principal atual não oferece ZIP independente. `lib/topocad/zip.ts` é um helper usado na construção de XLSX.
- O uso registrado é de processamento de memoriais, não de downloads. Os exports atuais não acrescentam consumo mensal.
- O código contém os scripts SQL `001`–`005` e `verify.sql`; a aplicação deles e o estado de RLS/Storage no ambiente remoto precisam ser confirmados separadamente.
- Planos e limites existem no código; cobrança real/provedor de pagamento ainda não está conectada.
- A validação local recente passou em TypeScript, build e testes KML. O smoke test autenticado no navegador e a validação de um memorial real ainda estão pendentes.

## 3. Prioridades

### P0 — prontidão operacional e segurança

1. Conferir a ordem e o estado das migrações `supabase/001_schema.sql`–`005_vertices_codigo_repetido.sql` no ambiente autorizado; executar `supabase/verify.sql` sem assumir que o schema local prova o estado remoto.
2. Validar RLS, isolamento por `user_id`, Storage privado, webhook Clerk e autorização admin em Preview.
3. Executar smoke test autenticado com usuário comum e staff, incluindo expiração de sessão e acesso negado.

### P1 — fluxo geoespacial

1. Criar fixtures representativas para parser, DMS, Unicode, datum, zona/hemisfério, vértices inválidos, fechamento, área e perímetro.
2. Validar o fluxo completo com memorial anonimizado e conferir DXF/XLSX/KML em ferramentas consumidoras.
3. Confirmar conversões KML com amostras conhecidas, incluindo limites geográficos, SIRGAS 2000, WGS84 e bloqueio de SAD69.
4. Decidir como obter proprietário e município antes de armazená-los ou exportá-los com valores preenchidos.

### P2 — administração e produto

1. Continuar a revisão de usuários, permissões, créditos, auditoria, projetos e operações destrutivas.
2. Manter sincronização Clerk idempotente e decidir se organizações serão também tenants de dados.
3. Definir provedor, preços e política comercial antes de implementar cobrança real.
4. Avaliar busca, filtros, paginação e métricas do painel admin.

### P3 — qualidade e escala

1. Expandir testes unitários do parser, geodesia, geometria e exportadores.
2. Adicionar testes de integração para rotas, RLS e Storage.
3. Criar E2E autenticado para projeto, processamento, edição, downloads e admin.
4. Planejar logs estruturados, métricas, alertas e processamento de arquivos grandes.

## 4. Regras arquiteturais

- Não usar `localStorage` para dados persistentes.
- Toda consulta a dados do usuário deve filtrar por `user_id` e respeitar RLS.
- Segredos ficam apenas no ambiente; nunca em código, documentação ou logs.
- Validar entradas antes de persistir/processar; manter rotas finas e regras de domínio em `lib/`.
- Não arredondar coordenadas UTM de origem. A serialização KML usa oito casas decimais e tem teste de retorno com erro inferior a 1 cm.
- Preservar acessibilidade, layout móvel, estados de erro e segurança.

## 5. Critério de pronto

Uma entrega é considerada pronta quando passa os checks aplicáveis, é validada no navegador quando há UI, tem SQL/configuração documentados e confirmados no ambiente de destino e não expõe segredos. Build local não comprova que migrações remotas foram aplicadas.

## 6. Próxima sequência recomendada

1. Confirmar banco, RLS, Storage e Clerk em Preview.
2. Rodar smoke test autenticado do fluxo completo com memorial de teste anonimizado.
3. Ampliar fixtures geoespaciais e validar os arquivos exportados em ferramentas externas.
4. Definir persistência dos metadados de proprietário/município.
5. Revisar produção, rollback, auditoria e cobrança antes de promover deploy.

## 7. Fora de escopo sem decisão explícita

Não introduzir outro provedor de autenticação, banco, pagamentos, filas externas ou framework sem registrar a decisão e o impacto.

Consulte `ACTION-PLAN.md` para a linha do tempo confirmada, validações recentes e checklist operacional.
