# Vertix

O Vertix transforma memoriais descritivos em projetos topográficos: recebe o PDF, processa os vértices e permite revisar, editar e exportar os dados. O motor geoespacial interno é organizado em `lib/topocad`.

## Funcionalidades

- Autenticação e contas com Clerk.
- Projetos de memorial em PDF, processamento de vértices e visualização da geometria no dashboard.
- Edição de vértices e atualização dos dados do projeto.
- Exportação pelo fluxo do dashboard em DXF, XLSX e KML.
- Endpoint autenticado adicional para baixar o PDF original ou DXF em `app/api/projects/[id]/export/[format]/route.ts`.
- Download administrativo do PDF original e preparação de DXF/XLSX com permissão staff; a preparação de DXF/XLSX é auditada.
- Administração de usuários, projetos, permissões e uso.

O KML é gerado em KML 2.2 a partir das coordenadas UTM, com saída geográfica WGS84. SIRGAS 2000 e WGS84 são tratados como equivalentes para essa conversão; SAD69 e projetos sem referência geodésica válida não são exportados. Proprietário e município ainda não são armazenados no projeto, por isso os campos correspondentes do `ExtendedData` saem vazios.

`lib/topocad/zip.ts` é um helper interno usado na criação de arquivos XLSX; não há atualmente um formato ZIP independente no fluxo de exportação do usuário.

## Stack e organização

- Next.js 16 App Router, React 19 e TypeScript.
- Clerk para autenticação e Supabase para banco, Storage e operações server-side.
- `proj4` para projeções cartográficas; Leaflet para visualização de mapas.
- `app/`: páginas, Route Handlers e Server Actions.
- `components/`: interfaces do dashboard e do painel administrativo.
- `lib/engine/`: processamento do memorial e coordenação do fluxo.
- `lib/topocad/`: parsing, UTM, geometria e exportação DXF/XLSX.
- `lib/export/`: geração e validação de KML.
- `lib/supabase/`: clientes Supabase.
- `supabase/`: schema, políticas e scripts de verificação.

## Desenvolvimento local

Use pnpm e configure as variáveis Clerk/Supabase nos ambientes do projeto antes de iniciar a aplicação. Nunca coloque valores secretos em arquivos versionados.

```bash
pnpm install
pnpm dev
```

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm run test:kml
pnpm run build
```

`test:kml` usa o test runner nativo do Node.js e cobre conversão/retorno UTM, fechamento do polígono, ordem longitude-latitude, escape XML, limites do Brasil e bloqueios de datum/fuso.

## Banco e documentação operacional

Os scripts SQL ficam em `supabase/`. Revise e aplique alterações somente no ambiente autorizado; o código e este README não aplicam SQL automaticamente. Confira `supabase/verify.sql` após mudanças de schema e acompanhe as pendências em `ACTION-PLAN.md`.

- `ROADMAP.md`: estado do produto, prioridades e decisões de escopo.
- `ACTION-PLAN.md`: marcos confirmados, validações e próximos passos.
- `PROJECT-CONTINUITY-SKILL.md`: mapa técnico e regras para manutenção.

## Inventário atual de rotas e funções

**Rotas API:**

- `GET /api/health`
- `GET /api/projetos`, `POST /api/projetos`
- `GET/PATCH/DELETE /api/projetos/[id]`
- `POST /api/projetos/[id]/processar`
- `GET /api/projetos/[id]/exportar?formato=dxf|xlsx|kml`
- `GET /api/projects/[id]/export/[format]` para PDF e DXF
- `POST /api/projetos/azimute`
- `GET /api/admin/users`, `/api/admin/projects`, `/api/admin/logs`, `/api/admin/credits`
- `POST /api/admin/project-download`
- `POST /api/webhooks/clerk`

**Funções de domínio principais:**

- TopoCAD: `processarTexto`, `processarPaginas`, `processarVertices`, `recalcularGeometria`, `extrairVertices`, `textoParaNumero`, `dmsParaDecimal`.
- Geometria/UTM: `areaPlanimetrica`, `perimetroGrade`, `calcularGeometria`, `fusoUtm`, `descobrirEpsgUtm`, `geograficasParaUtm`, `utmParaGeograficas`.
- Exportação: `gerarDxf`, `gerarXlsx`, `gerarKml`, `criarZip`.
- Detecção de referência: `detectarParametrosMemorial`, `detectarMetadadosMemorial`, `inferirCrsDoMemorial`, `parametrosArquivoValidos`, `normalizarDatum`.
- Segurança e operação: `getStaffAccess`, `isStaffRole`, `getUsageStatus`, `incrementUsage`, `audit`, `canUseFeature`.

Este inventário foi revisado em 2026-11-10 contra os Route Handlers e módulos `lib/topocad`, `lib/export`, `lib/usage` e `lib/staff` presentes no branch atual.
