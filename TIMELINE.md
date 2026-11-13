# Linha do tempo do Vertix

**Última revisão:** 2026-11-13
**Fonte:** histórico Git do `main` (commit `6f26ecd`). Os números de PR das fases 1 e 2 são de repositórios anteriores (`luiz1819/…` e `luiz1900/…`); a partir da fase 3 são de `Lcarlos1919/dms-to-utm`.

Documentos irmãos: `ROADMAP.md` (visão e fases) e `ACTION-PLAN.md` (o que falta fazer).

---

## Resumo

| Período | Fase | Principal resultado |
| --- | --- | --- |
| 01–05/out | Fundação | App Next.js + Clerk + Supabase, motor TopoCAD, upload e edição de vértices |
| 07–15/out | Motor e admin | Detecção de datum/fuso, exportação DXF R12, painel admin, RBAC de staff |
| 25–29/out | Segurança e KML | Admin finalizado, limites de uso, exclusão com permissão, exportação KML |
| 03–12/nov | Azimute | Tipo de memorial azimute, Vertix Core, acesso por plano, leitura dos PDFs (D1) |
| 13/nov | Regressão | Restauração do v0 apagou a entrega D1 |

---

## Outubro de 2026

### 01/out — Projeto criado

- `8396851` Commit inicial gerado pelo v0.
- `46856aa`, `a038d4c` Configuração do Clerk e do Supabase, rotas de API, layout do dashboard e primeiras páginas admin.
- `55ad690`, `a5a5fe6`, `ae9d535` Páginas de login/cadastro e middleware do Clerk.

### 02/out — Ajustes de deploy

- `0095caa` … `15a428d` Correções do proxy/middleware do Clerk no Next.js 16 e na Vercel.
- `5c2f28e` Redução de memória no build.

### 03/out — Motor TopoCAD e banco

- `470fada`, `0c980ed`, `81094ba` Admin restrito a e-mails aprovados; APIs administrativas.
- `e8280b4` Criação de projeto e lógica de processamento do memorial.
- `f457ac4` Upload real de PDFs. `b736610` Edição e persistência de vértices.
- `72946ca`, `54458de` Parser de memoriais em PDF (`unpdf`).
- `f341089`, `872919b`, `7833b1a` Schema Supabase, motor TopoCAD e exportações.

### 04–05/out — Autenticação e processamento

- `8410345` Webhook Clerk verificado.
- `f77034d`, `dbe3360` Clerk restaurado; landing e auth públicas.
- `b4b7edd` Cards com BorderGlow no dashboard.
- `f3bcf4c` Backend de conversão TopoCAD.
- `5146b6a` Permissões premium e processamento dos memoriais enviados.

### 07–09/out — Detecção de parâmetros

- `8f96c4b`, `2f89898`, `84aefbd` Detecção de datum, fuso e CRS do memorial; mapa melhorado.
- `9c1d412` Conversão automática de memoriais aprimorada.
- `b96c873` Exportações ligadas, card de fechamento, datum padrão, cota e processamentos travados.
- `24ad6a9` Leitura de vértices no servidor com chave secreta.

### 10–15/out — DXF e painel administrativo

- `6a9b200`, `4faef45` Exportação DXF R12 e exclusão completa de projetos.
- `906fe1f` … `5f06194` Autenticação segura do admin e auditoria de login.
- `cdf160d` Rota pública do webhook Clerk.
- `7bde630`, `73e265e`, `a38d81f` RBAC de staff via organização Clerk, convites e membros.
- `b8a6e6b` Migrações SQL manuais e numeradas.
- `4ff76b8`, `46dac67` Primeiros documentos de continuidade (roadmap e plano de ação).
- `8090426` Autorização do admin endurecida e `supabase/verify.sql`.

### 25–27/out — Segurança, limites e KML

- `ad9a63d` Acesso admin e ciclo de vida do projeto protegidos.
- `98b87d7`, `9629847` Aliases das variáveis do Supabase.
- `e671866` RBAC de staff e log de auditoria. **PR #5**
- `48962b7`, `360ed7d` Limite mensal gratuito configurável e fluxos do admin. **PR #6**
- `e064456`, `a2916ed` Exibição de planos, filtros de auditoria e marca Vertix no Clerk. **PR #7**
- `78a657a`, `d4ae616` Marca da autenticação e permissão para excluir projetos. **PR #8**
- `f5e026c` Exportação KML 2.2 com testes. **PR #9**

### 29/out — Validação local do KML

- `25fda3d` Documentação atualizada. `tsc`, build e 8 testes KML passaram; o teste no navegador parou na tela de login.

## Novembro de 2026

### 03–04/nov — Tipo de memorial

- `3fddf5e` Campo `memorial_type`, upload de memorial + planta (`app/api/projetos/azimute`), SQL `005_project-type.sql`, badge "Azimute" no dashboard e no admin.
- `a3fe9d3` Chaves do `.env.example` atualizadas. **PR #10**

### 10/nov — Versão consolidada

- `4952bd2` Versão completa do Vertix integrada ao `main` (admin, APIs, docs). **PR #11**

### 12/nov — Vertix Core e azimute D1

- `28815b8` `lib/vertix-core` (ângulos, poligonal, âncora, lote, memorial, base fundiária) e acesso por ferramenta/plano no admin. **PR #12**
- `518906a`, `442af81` Ajustes do Vertix Core conforme arquivos anexados. **PR #13**
- `255657b` **Azimute D1:** leitura dos PDFs, tela de revisão da tabela de segmentos, SQL `006`–`008`. **PR #14**

### 13/nov — Regressão

- `6f26ecd` "Restored: Merge pull request #13" (v0). **Apagou os 11 arquivos do PR #14.** A entrega D1 continua recuperável a partir do commit `255657b`.

---

## Próximos marcos

As datas não são estimadas. Ordem prevista em `ACTION-PLAN.md`:

1. Restaurar D1 e corrigir os SQL.
2. Confirmar banco e segurança no ambiente remoto e fazer o teste com login.
3. Azimute D2 a D5.
4. Testes do motor e validação com memoriais reais.
5. Metadados, admin e cobrança.
