# Linha do tempo e plano de ação

## Objetivo

Dar continuidade ao TopoCAD com o menor risco possível, mantendo o fluxo principal funcional e evitando retrabalho entre agentes.

## Fase 0 — entrada de qualquer novo agente

1. Ler `README.md`, `ROADMAP.md`, este arquivo e `PROJECT-CONTINUITY-SKILL.md`.
2. Conferir branch, status Git, `package.json`, `next.config.mjs`, `proxy.ts` e variáveis sem imprimir valores.
3. Identificar se a tarefa é UI, domínio geoespacial, autenticação, banco, webhook ou administração.
4. Ler os chamadores e consumidores do código antes de editar.
5. Registrar hipótese, arquivos afetados, risco e validação prevista.

## Fase 1 — fundação técnica

**Status:** concluída a primeira rodada de hardening de autenticação administrativa e verificação SQL; manter a validação de ambiente e o build como pendências operacionais.

**Entregáveis:** build verde, tipos coerentes, SQL aplicado, ambientes documentados.

- Corrigir os tipos compartilhados do motor TopoCAD.
- Validar `supabase/001_schema.sql` e `supabase/admin-security.sql` em ambiente não produtivo.
- Confirmar `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SIGNING_SECRET`, `SUPABASE_URL`, chave service role e segredos admin.
- Confirmar que nenhum segredo aparece em logs, commits ou respostas HTTP.
- Criar checklist de rollback para SQL e deploy.

**Saída:** `pnpm exec tsc --noEmit`, lint e build sem falhas novas.

## Fase 2 — motor TopoCAD

**Entregáveis:** parser confiável e resultados geoespaciais auditáveis.

- Executar fixtures em `lib/topocad/__fixtures__`.
- Testar DMS, Unicode, quebras de linha, datum, zona UTM, fechamento e vértices inválidos.
- Garantir que erros possuem código estável e mensagem útil.
- Garantir que reprocessar o mesmo projeto não duplica vértices, jobs ou arquivos.
- Validar área, perímetro, easting/northing e exportações com amostras conhecidas.

## Fase 3 — fluxo do usuário

**Entregáveis:** criar, processar, editar, visualizar e exportar um projeto.

- Testar Clerk sign-in/sign-up e redirecionamento.
- Criar projeto com PDF válido, rejeitar arquivo inválido e respeitar limite.
- Acompanhar estados `draft`, `processing`, `ready` e `error`.
- Editar vértices e recalcular geometria.
- Baixar cada formato de exportação.
- Testar desktop e viewport móvel.

## Fase 4 — perfis, organizações e webhook

**Entregáveis:** perfil sincronizado e webhook operacional.

- Validar `user.created`, `user.updated` e `user.deleted` com assinatura Clerk.
- Tornar operações idempotentes por `user_id`.
- Definir explicitamente se organizações Clerk são apenas contexto de acesso ou serão tenant de dados.
- Não misturar `org_id` com `user_id` sem migração de modelo, RLS e plano de compatibilidade.
- Testar eventos duplicados, assinatura inválida e payload incompleto.

## Fase 5 — painel admin

**Entregáveis:** acesso controlado, operações auditadas e sem loop de login.

- Exigir sessão Clerk válida, e-mail principal verificado, registro ativo em `admin_users` e sessão admin.
- Usuário não autorizado deve retornar ao dashboard/login normal, sem 404 enganoso ou loop.
- Auditar login, alterações de permissão, créditos, projetos e ações destrutivas.
- Nunca registrar e-mail, token, cookie, senha ou segredo em produção.
- Testar usuário autorizado, não autorizado, sessão expirada e tentativa de acesso direto.

## Fase 6 — produção

1. Aplicar variáveis nos ambientes corretos.
2. Executar SQL previamente revisado.
3. Fazer deploy Preview.
4. Rodar smoke test autenticado e webhook de teste.
5. Revisar logs e auditoria.
6. Promover para Production.
7. Registrar versão, commit, data, riscos aceitos e plano de rollback.

## Checklist de encerramento

- [ ] Código compilado.
- [ ] Lint/testes aplicáveis executados.
- [ ] UI testada no navegador quando aplicável.
- [ ] Rotas autenticadas testadas.
- [ ] RLS e escopo de usuário revisados.
- [ ] Nenhum segredo exposto.
- [ ] Migrações SQL aplicadas/documentadas.
- [ ] Git sincronizado com mensagem clara.
- [ ] ROADMAP atualizado.

## Registro de decisões

Use este formato no PR/commit ou no final da tarefa:

- **Decisão:**
- **Motivo:**
- **Alternativas descartadas:**
- **Arquivos:**
- **Risco:**
- **Validação:**
- **Rollback:**
