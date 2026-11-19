# Roadmap do Vertix

**Última revisão:** 2026-11-17
**Base do código:** branch `claude/confident-pascal-cy49z6` (sobre `6f26ecd`)

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
| **Azimute e distância** | Memorial sem coordenadas + PDF da planta; precisa de um ponto de amarração (memorial, base fundiária, digitado ou mapa) | Fluxo completo no código; falta validar com memoriais reais |

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

- Cadastro e login com Clerk e marca Vertix. A raiz do app (app-vertix.vercel.app) leva direto ao login ou ao painel; a landing page fica em vert1x.vercel.app.
- Upload de memorial em PDF, processamento, mapa, edição de vértices e reprocessamento.
- Exportação DXF (R12), XLSX e KML 2.2 (WGS84; bloqueia SAD69 e CRS ausente).
- Painel admin com RBAC de staff via organização Clerk, auditoria, download do PDF original, créditos e exclusão de projetos com permissão.
- Planos `free`/`pro`, limite mensal gratuito configurável (padrão 3) e créditos bônus.
- Campo `memorial_type` (coordenadas/azimute) e upload de memorial + planta para o tipo azimute.
- Acesso por ferramenta e por plano (`memorial_azimute`, `export_kml`), configurável no admin.
- Biblioteca `lib/vertix-core` (cálculos do fluxo azimute e busca de lote na base fundiária/GeoPortal SEDAM-RO), agora ligada ao app.
- **Memorial por azimute pronto automaticamente** (`lib/azimute/processar.ts`): lê memorial e planta, confere a tabela e posiciona o lote sozinho, pela coordenada escrita no memorial ou pelo encaixe no lote da base fundiária. Grava vértices, área, perímetro e EPSG e aplica a compensação de Bowditch.
- **Ponto de partida manual (D3)** quando o posicionamento automático não é seguro: escolher na base, digitar UTM ou lat/long, ou clicar no mapa de satélite, com pré-visualização.
- Leitor de memorial tolerante a vários formatos: azimute antes ou depois do vértice de destino, rumos, tabela De/Para, coordenada inicial UTM ou geográfica, fuso ou meridiano central.
- Memorial enviado como "coordenadas" que só tem azimutes passa sozinho para o fluxo por azimute.
- **PDF escaneado (imagem, sem texto)**: memorial e rodapé da planta são lidos por visão com a API da Anthropic (`lib/azimute/ler-imagem.ts`), validados e seguem o mesmo fluxo. Requer `ANTHROPIC_API_KEY` na Vercel; sem ela, o sistema pede o preenchimento manual da tabela.

### Problemas conhecidos

1. ~~Entrega D1 apagada pelo commit `6f26ecd`~~ — restaurada.
2. ~~`lib/vertix-core` sem uso~~ — ligada ao pipeline do azimute.
3. ~~`005_project-type.sql` inserindo em tabela inexistente~~ — corrigido e renomeado para `005b_project-type.sql`.
4. ~~Dois scripts `005`~~ — agora `005` e `005b`.
5. ~~SQL pendentes no Supabase~~ — conferido em 2026-11-18 no projeto GEO-CONVERSOR: `005b`–`008` aplicados, `fundiario_lotes` com 114.256 lotes (base de 2026-10-29, 253 glebas), `buscar_lote` funcionando, RLS ligada, bucket `memoriais` privado, PostGIS 3.3.7 instalado e `memorial_azimute` liberado para o plano Pro. Já existe 1 memorial por azimute pronto em produção.
6. O leitor de memoriais ainda não foi testado com memoriais reais. Faltam exemplos de cada formato usado pelos clientes.
7. O proprietário não é armazenado. O município só é preenchido no KML dos memoriais por azimute; nos memoriais por coordenadas ele ainda sai vazio.
8. Cobrança real não está conectada; planos existem apenas no código.
9. Nenhum teste com login real no navegador foi registrado.

## 4. Fases

### Fase 1 — Estabilizar o que existe (P0)

Recuperar a entrega D1 apagada, corrigir a numeração e o conteúdo dos SQL, confirmar banco, RLS, Storage e webhook no ambiente remoto, e rodar um teste completo com login.

### Fase 2 — Fluxo por azimute completo (P1)

Terminar o segundo tipo de memorial, em etapas:

| Etapa | Entrega |
| --- | --- |
| D1 | Leitura dos PDFs (memorial + planta) e tela de revisão da tabela de segmentos — **feita (restaurada)** |
| D2 | Busca do lote na base fundiária (Supabase + GeoPortal) e encaixe automático da poligonal — **feita** (falta só um importador da base no repositório) |
| D3 | Ponto de partida manual: pela base, digitado ou clicando no mapa; só aparece quando o automático não é seguro — **feita** |
| D4 | Poligonal a partir de azimutes e distâncias, com compensação de Bowditch, fechamento e área — **feita** |
| D5 | Vértices gravados no projeto, mapa, edição e exportação DXF/XLSX/KML iguais ao fluxo por coordenadas — **feita** |
| D6 | Validação com memoriais reais de todos os formatos e ajustes no leitor — **próxima** |

### Fase 3 — Qualidade do motor geoespacial (P1)

Fixtures e testes do parser, DMS, datum, fuso/hemisfério, fechamento, área e perímetro; validação com memoriais reais anonimizados e conferência dos arquivos exportados em QGIS/AutoCAD/Google Earth.

### Fase 4 — Produto e administração (P2)

Proprietário e município no projeto, busca/filtros/paginação no admin, métricas de uso, sincronização Clerk idempotente.

### Fase 5 — Monetização (P2)

Escolher provedor de pagamento, definir preços e ligar a assinatura `pro` ao pagamento real.
Hipótese de preço a validar: Pro entre R$ 69,90 e R$ 99,90/mês, justificado pela Fase 7 (ver `MERCADO.md`).

### Fase 7 — Inteligência fundiária (P2, diferencial do plano Pro)

Usar bases públicas (dados abertos, Lei 12.527/2011) para entregar valor que o topógrafo hoje faz à mão.
Regra: vender o software, a automação e o cruzamento; não revender o dado bruto.

| Item | Entrega |
| --- | --- |
| F1 | **Sobreposição**: ao gerar o polígono, cruzar com as parcelas certificadas do SIGEF/INCRA e com a base SEDAM e avisar "este polígono sobrepõe N parcelas", com área e percentual sobreposto |
| F2 | **Confrontantes**: botão "baixar vizinhos num raio de 1 km" em DXF/KML a partir das mesmas bases |
| F3 | **Base própria e atualizada**: importar os shapefiles estaduais do Acervo Fundiário/SIGEF para o Supabase com PostGIS (já instalado), com atualização semanal ou quinzenal e data da base visível ao usuário |
| F4 | **Geometria espacial**: coluna `geometry` com índice GiST em `fundiario_lotes` (hoje a geometria está em JSON) para consultas de sobreposição e vizinhança no banco |

Regra técnica: nunca depender só da API ao vivo do governo (instável, lenta, com bloqueios). O GeoPortal ao vivo fica como complemento.

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
