# Roadmap do Vertix

**Última revisão:** 2026-11-13
**Base do código:** `6f26ecd` (`main`, 2026-11-13)

Documentos irmãos:

- `TIMELINE.md` — o que foi feito, quando, com evidência no Git.
- `ACTION-PLAN.md` — checklist do que falta fazer, em ordem de execução.

---

## 1. Visão do produto

O Vertix transforma memoriais descritivos de imóveis rurais e urbanos em projetos topográficos revisáveis. O fluxo é: envio do PDF, leitura e extração dos vértices, conversão DMS/UTM, validação geométrica, visualização no mapa, edição e exportação em DXF, XLSX e KML.

O produto atende dois tipos de memorial:

| Tipo | Entrada | Estado |
| --- | --- | --- |
| **Coordenadas** | Memorial com coordenadas UTM ou geográficas de cada vértice | Fluxo completo entregue |
| **Azimute e distância** | Memorial sem coordenadas + PDF da planta; precisa de um ponto de amarração (base fundiária, manual ou mapa) | Em construção |

`TopoCAD` (`lib/topocad`) é o motor do fluxo por coordenadas. `Vertix Core` (`lib/vertix-core`) é o motor do fluxo por azimute. A marca do produto é Vertix.

## 2. Arquitetura

- **App:** Next.js 16 (App Router), React 19, TypeScript, pnpm.
- **Autenticação:** Clerk, com organização Clerk usada para o staff administrativo.
- **Dados:** Supabase (Postgres + Storage privado), acessado no servidor com a chave de serviço.
- **Geoespacial:** `proj4` para projeções e Leaflet para o mapa.
- **Hospedagem:** Vercel; o v0 é usado para gerar parte das mudanças.

| Pasta | Responsabilidade |
| --- | --- |
| `app/dashboard` | Área do usuário: projetos, novo projeto, planos |
| `app/admin` | Painel de staff: usuários, projetos, uso, logs, planos, staff, configurações |
| `app/api` | Rotas de projetos, exportação, admin, health e webhook Clerk |
| `lib/engine`, `lib/topocad` | Parser do memorial, DMS, UTM, geometria, exportação DXF/XLSX |
| `lib/vertix-core` | Ângulos, poligonal, âncora, lote, memorial e base fundiária (fluxo azimute) |
| `lib/export` | KML 2.2 e regras de disponibilidade |
| `supabase/` | Scripts SQL manuais e numerados, mais `verify.sql` |

## 3. Estado atual

### Entregue e no `main`

- Landing page, cadastro e login com Clerk e marca Vertix.
- Upload de memorial em PDF, processamento, mapa, edição de vértices e reprocessamento.
- Exportação DXF (R12), XLSX e KML 2.2 (WGS84; bloqueia SAD69 e CRS ausente).
- Painel admin com RBAC de staff via organização Clerk, auditoria, download do PDF original, créditos e exclusão de projetos com permissão.
- Planos `free`/`pro`, limite mensal gratuito configurável (padrão 3) e créditos bônus.
- Campo `memorial_type` (coordenadas/azimute) e upload de memorial + planta para o tipo azimute.
- Acesso por ferramenta e por plano (`memorial_azimute`, `export_kml`), configurável no admin.
- Biblioteca `lib/vertix-core` (cálculos do fluxo azimute e busca de lote na base fundiária/GeoPortal SEDAM-RO).

### Problemas conhecidos

1. **Entrega D1 do azimute foi apagada.** O commit `6f26ecd` ("Restored: Merge pull request #13", feito pelo v0) removeu os 11 arquivos do PR #14 (`255657b`): leitura dos PDFs, tela de revisão da tabela de segmentos e os SQL `006`, `007`, `007b` e `008`.
2. **`lib/vertix-core` não é usada por nenhum arquivo** do app. O código existe, mas ainda não está ligado a nenhuma rota ou tela.
3. **`supabase/005_project-type.sql` vai falhar.** Ele insere em `public.feature_access`, uma tabela que não existe. O código lê essa configuração de `app_settings` (chave `feature_access`), que era criada pelo `006` removido.
4. **Dois arquivos com número `005`** em `supabase/` (`005_project-type.sql` e `005_vertices_codigo_repetido.sql`), o que confunde a ordem de execução.
5. Proprietário e município não são armazenados; esses campos saem vazios no KML.
6. Cobrança real não está conectada; planos existem apenas no código.
7. Nenhum teste com login real no navegador foi feito; o estado das migrações no Supabase remoto não foi confirmado.

## 4. Fases

### Fase 1 — Estabilizar o que existe (P0)

Recuperar a entrega D1 apagada, corrigir a numeração e o conteúdo dos SQL, confirmar banco, RLS, Storage e webhook no ambiente remoto, e rodar um teste completo com login.

### Fase 2 — Fluxo por azimute completo (P1)

Terminar o segundo tipo de memorial, em etapas:

| Etapa | Entrega |
| --- | --- |
| D1 | Leitura dos PDFs (memorial + planta) e tela de revisão da tabela de segmentos — *feita, precisa ser restaurada* |
| D2 | Base fundiária: importar lotes da SEDAM/RO para `fundiario_lotes` e buscar o lote do projeto (banco + GeoPortal) |
| D3 | Ponto de amarração: escolher âncora pela base fundiária, por digitação manual ou clicando no mapa |
| D4 | Cálculo da poligonal a partir de azimutes e distâncias, com fechamento, área e comparação com a área oficial |
| D5 | Vértices gravados no projeto, mapa, edição e exportação DXF/XLSX/KML iguais ao fluxo por coordenadas |

### Fase 3 — Qualidade do motor geoespacial (P1)

Fixtures e testes do parser, DMS, datum, fuso/hemisfério, fechamento, área e perímetro; validação com memoriais reais anonimizados e conferência dos arquivos exportados em QGIS/AutoCAD/Google Earth.

### Fase 4 — Produto e administração (P2)

Proprietário e município no projeto, busca/filtros/paginação no admin, métricas de uso, sincronização Clerk idempotente.

### Fase 5 — Monetização (P2)

Escolher provedor de pagamento, definir preços e ligar a assinatura `pro` ao pagamento real.

### Fase 6 — Escala e operação (P3)

Testes de integração e E2E, logs estruturados, alertas, processamento de PDFs grandes e rotina de deploy com Preview, smoke test e rollback.

## 5. Regras arquiteturais

- Não usar `localStorage` para dados persistentes.
- Toda consulta a dados de usuário filtra por `user_id` e respeita RLS.
- Segredos ficam só nas variáveis de ambiente; nunca em código, documentação ou logs.
- Validar entradas antes de persistir ou processar; rotas finas, regras de domínio em `lib/`.
- Não arredondar coordenadas UTM de origem. O KML usa oito casas decimais, com erro de retorno inferior a 1 cm.
- SQL é manual, numerado, idempotente e aplicado só com aprovação; build local não prova o estado remoto.
- Mudanças feitas pelo v0 devem ser conferidas contra o `main` antes do merge, para não apagar entregas de outros branches.
- Preservar acessibilidade, layout móvel, estados de erro e segurança.

## 6. Critério de pronto

Uma entrega está pronta quando passa `tsc`, testes e build; foi validada no navegador quando tem tela; tem SQL e configuração documentados e confirmados no ambiente de destino; e não expõe segredos.

## 7. Fora de escopo sem decisão explícita

Trocar provedor de autenticação, banco ou framework; adicionar filas externas; ligar cobrança sem provedor e preços definidos; armazenar nome de proprietário a partir da base fundiária.
