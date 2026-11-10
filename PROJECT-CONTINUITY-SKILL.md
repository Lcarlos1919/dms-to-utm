# Guia de continuidade do Vertix / TopoCAD

## Missão

Atue como mantenedor do Vertix. O produto usa o motor interno TopoCAD. Entenda o estado atual antes de editar, preserve os contratos existentes e prefira mudanças pequenas, seguras, testáveis e compatíveis com os dados geoespaciais.

## Primeiro passo obrigatório

Leia, nesta ordem:

1. `README.md`
2. `ROADMAP.md`
3. `ACTION-PLAN.md`
4. `package.json`
5. os arquivos diretamente relacionados à tarefa

Depois confira `git status --short --branch` e identifique o framework/runtime. A documentação é um mapa, não prova que o código ou o banco remoto estejam no estado descrito; confira ambos.

## Mapa do sistema

- `app/`: páginas, layouts, Server Actions e Route Handlers do App Router.
- `components/`: UI reutilizável, dashboard, admin e componentes shadcn.
- `lib/engine/`: processamento do memorial, uso mensal e coordenação do fluxo.
- `lib/topocad/`: parser, tipos, geodesia, UTM, geometria, DXF e XLSX.
- `lib/export/`: geração KML e validação da referência geodésica.
- `lib/supabase/`: clientes Supabase server/client.
- `lib/profiles.ts`, `lib/admin-auth.ts`, `lib/audit.ts`: permissões, autorização staff e auditoria.
- `lib/usage.ts`: limites e contagem de memoriais processados.
- `app/api/projetos/[id]/exportar/route.ts`: exports do dashboard (DXF, XLSX e KML).
- `app/api/projects/[id]/export/[format]/route.ts`: endpoint autenticado adicional para PDF original e DXF.
- `app/api/admin/project-download/route.ts`: downloads/preparação administrativa (PDF original, DXF e XLSX), protegidos por permissão staff; a preparação de DXF/XLSX é auditada.
- `supabase/001_schema.sql`–`005_vertices_codigo_repetido.sql`: schema e alterações versionadas.
- `supabase/002_admin-security.sql`, `003_staff-rbac.sql`, `004_drop_legacy_admin.sql` e `supabase/verify.sql`: segurança/administração e verificação.
- `proxy.ts`: integração Clerk no App Router.

## Como decidir onde editar

- UI: `components/` ou página/layout específico.
- Regras de domínio: `lib/`; não duplicar cálculos em componentes.
- Persistência: conferir schema/políticas, depois editar cliente Supabase e rota/server action.
- Autenticação: Clerk; não criar auth paralela.
- Dados de usuário: filtrar sempre por `user_id` e conferir RLS.
- Admin: exigir identidade Clerk, e-mail verificado, permissão staff e sessão conforme o fluxo atual.
- Webhook: validar assinatura, aceitar eventos conhecidos e manter idempotência.

## Regras geoespaciais

- Preservar unidades, ordem de vértices e nomes de campos existentes.
- Não arredondar coordenadas UTM de origem. KML serializa longitude/latitude com oito casas decimais e deve manter erro de retorno inferior a 1 cm.
- Validar DMS, datum, zona/hemisfério UTM, fechamento, área e perímetro.
- Para KML, SIRGAS 2000 e WGS84 são tratados como equivalentes nesta conversão; SAD69 não é convertido.
- KML verifica latitude de -34 a 6 e longitude de -74 a -34. Uma falha deve interromper a exportação com mensagem clara.
- `datum`, `utm_zone` e `utm_hemisphere` já existem em `projects`; confirme o schema antes de propor migração. Proprietário e município ainda não são campos persistidos, então não inferir valores: o `ExtendedData` os mantém vazios até decisão de produto.
- Usar fixtures e testes existentes; não declarar precisão geoespacial sem amostra/teste verificável.

## Planos e uso

- `profiles.plan` diferencia `free` e `pro`; o limite gratuito vem de `app_settings` (fallback de 3 por mês) e pode ser acrescido por créditos bônus.
- `usage` contabiliza processamento de memoriais, não downloads. Não acrescente consumo ao KML sem uma decisão de produto e sem alinhar os outros formatos.
- O código de planos não comprova que exista cobrança real conectada.

## Regras de segurança

- Nunca escrever ou imprimir tokens, senhas, hashes, cookies ou valores de variáveis secretas.
- Não usar `localStorage` como banco.
- Validar entradas e limitar tamanho de arquivos/arrays.
- Usar clientes server-side para operações privilegiadas.
- Auditoria registra ação, ator, alvo e metadados mínimos; evitar PII desnecessária.
- Não afirmar que SQL foi aplicado sem verificar o ambiente remoto.

## Estado de referência

- A base revisada inclui o merge do PR #9 de exportação KML (`2bedd40`, 2026-10-27).
- A exportação KML reutiliza os vértices persistidos e o endpoint atual do usuário, respeitando autenticação, propriedade e status do projeto.
- Build/TypeScript e a suíte KML passaram na última validação registrada; o smoke test autenticado no navegador ainda precisa de sessão de teste.
- Antes de declarar a produção pronta, confirmar as migrações e políticas no ambiente correto e executar `supabase/verify.sql`.

## Processo de implementação

1. Localize o comportamento e os chamadores atuais.
2. Trace origem, transformação e consumidores dos dados.
3. Faça a menor alteração completa.
4. Preserve acessibilidade e responsividade.
5. Rode primeiro o check mais estreito; depois build/lint/testes aplicáveis.
6. Para UI, valide no navegador; se a autenticação bloquear o teste, registre a limitação.
7. Revise diff, arquivos alterados e riscos.
8. Atualize `ROADMAP.md` e/ou `ACTION-PLAN.md` quando o estado do projeto mudar.
9. Sincronize Git ao finalizar.

## Padrões de qualidade

- Server Components por padrão; Client Components somente quando a interação exigir.
- Rotas finas: autenticação, validação, chamada de domínio e resposta.
- Nomes claros e contratos tipados.
- Não esconder falhas com `catch` vazio.
- Não fazer refatoração ampla durante correção localizada.
- Não instalar dependências sem necessidade e sem atualizar o lockfile.

## Resposta final esperada

Informe o que mudou, arquivos principais, validações executadas, limitações/bloqueios, riscos e commit/branch. Nunca diga que algo passou se não foi executado.

## Comandos de referência

```bash
pnpm exec tsc --noEmit
pnpm run test:kml
pnpm run build
pnpm run dev
```

O manifesto também define `pnpm run lint`; confirme que o executor está disponível antes de relatar o resultado. Se um comando não existir ou estiver bloqueado, informe isso e escolha uma alternativa verificável.
