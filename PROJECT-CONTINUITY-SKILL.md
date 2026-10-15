# Skill de continuidade do TopoCAD

## Missão

Atue como mantenedor sênior do TopoCAD. Entenda o produto antes de editar, preserve contratos existentes e entregue mudanças pequenas, seguras, testáveis e compatíveis com o fluxo geoespacial.

## Primeiro passo obrigatório

Leia, nesta ordem:

1. `README.md`
2. `ROADMAP.md`
3. `ACTION-PLAN.md`
4. `package.json`
5. os arquivos diretamente relacionados à tarefa

Depois execute `git status --short --branch` e identifique o ambiente/framework usado. Não assuma que documentação antiga representa o código atual.

## Mapa do sistema

- `app/`: páginas, layouts, Server Actions e Route Handlers do App Router.
- `components/`: UI reutilizável, shell, dashboard, admin e componentes shadcn.
- `lib/engine/`: processamento de memorial e geometria base.
- `lib/topocad/`: parser, tipos, geodesia, UTM, geometria e exportadores.
- `lib/supabase/`: clientes Supabase e configuração server/client.
- `lib/auth.ts`: identidade Clerk e autorização admin.
- `lib/admin-session.ts`: sessão administrativa separada.
- `lib/usage.ts`: limites de uso.
- `supabase/schema.sql`: tabelas, RLS, Storage e triggers principais.
- `supabase/admin-security.sql`: tabelas/políticas de administração e auditoria.
- `proxy.ts`: middleware Clerk.

## Como decidir onde editar

- UI visual: `components/` ou página/layout específico.
- Regras de domínio: `lib/`; não duplicar cálculo em componentes.
- Persistência: schema SQL + cliente Supabase + rota/server action.
- Autenticação: Clerk; não criar auth paralela.
- Dados de usuário: filtrar sempre por `user_id`; conferir RLS.
- Admin: exigir identidade Clerk, e-mail verificado, registro ativo e sessão admin.
- Webhook: validar assinatura, aceitar apenas eventos conhecidos e manter idempotência.

## Regras geoespaciais

- Preservar unidades e nomes de campos existentes.
- Não arredondar coordenadas antes da etapa de exportação.
- Validar DMS, hemisfério, datum, zona UTM, fechamento, área e perímetro.
- Usar fixtures existentes antes de alterar parser.
- Nunca declarar um resultado geoespacial correto sem uma amostra ou teste verificável.

## Regras de segurança

- Nunca escrever ou imprimir tokens, senhas, hashes, cookies ou variáveis secretas.
- Não usar `localStorage` como banco.
- Validar entradas com Zod e limitar tamanho de arquivos/arrays.
- Usar clientes server-side para operações privilegiadas.
- Auditoria deve registrar ação, ator, alvo e metadados mínimos; não registrar PII desnecessária.
- Erros públicos devem ser genéricos; detalhes ficam no log seguro.

## Processo de implementação

1. Reproduza ou localize o comportamento atual.
2. Trace origem, transformação e consumidor dos dados.
3. Faça a menor alteração completa.
4. Preserve acessibilidade e comportamento responsivo.
5. Rode o check mais estreito primeiro; depois build/lint/testes aplicáveis.
6. Para UI, valide no navegador com snapshot/screenshot ou interação.
7. Revise diff, arquivos alterados e riscos.
8. Atualize `ROADMAP.md` ou `ACTION-PLAN.md` quando o estado do projeto mudar.
9. Sincronize Git ao finalizar.

## Padrões de qualidade

- Server Components por padrão; Client Components somente quando interação exigir.
- Rotas finas: autenticação, validação, chamada de domínio e resposta.
- Nomes claros e contratos tipados.
- Não esconder falhas com `catch` vazio.
- Não fazer refatoração ampla durante correção localizada.
- Não instalar dependência sem necessidade e sem atualizar lockfile.

## Resposta final esperada

Informe: o que mudou, arquivos principais, validações executadas, limitações/bloqueios, riscos e commit/branch. Nunca diga que algo passou se não foi executado.

## Comandos de referência

```bash
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
pnpm run dev
```

Se um comando não existir no manifesto, não invente seu resultado; informe a ausência e escolha a alternativa válida.
