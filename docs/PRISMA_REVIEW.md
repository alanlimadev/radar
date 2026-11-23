# Prisma no RADAR — revisão, correções de baixo risco e próximos passos

**Data:** 2026-11-22
**Status:** Prisma mantido no curto prazo; correções de baixo risco aplicadas.
**Escopo:** backend `radar/` e scripts de build do instalador desktop (`qonect`).

---

## 1. Resumo da decisão

O RADAR **não precisa** de um ORM para o que faz hoje: são 6 tabelas SQLite, ~45\nqueries e um app desktop offline que nunca vai trocar de banco. O Prisma funciona,\nmas o custo (payload, codegen, migrations quebradas, schema em dois lugares) é alto\npara o benefício.

A decisão deste ciclo foi **não reescrever a persistência**. Em vez disso:

1. Corrigimos o que estava quebrando o build e o pacote.
2. Removemos a pasta de migrations inválida (PostgreSQL em um projeto SQLite).
3. Reduzimos o que é embarcado no instalador.
4. Registramos a substituição do Prisma como tarefa futura, com escopo estimado.

---

## 2. Diagnóstico: o que estava errado

### 2.1 Client do Prisma desatualizado e versões divergentes

- `node_modules/.prisma/client` havia sido gerado em **24/10/2026** (Prisma 6.11.1),
  mas o `prisma/schema.prisma` mudou em **14/11/2026** para incluir
  `Question.timeLimitSeconds`.
- O build do backend falhava com 5 erros de TypeScript:

  ```text
  TS2339: Property 'timeLimitSeconds' does not exist on type ...
  TS2353: Object literal may only specify known properties, and 'timeLimitSeconds' ...
  ```

- Além disso, o CLI `prisma` estava em **6.11.1** e o `@prisma/client` em **6.12.0**.
- O script de build do Windows não rodava `prisma generate` antes de compilar.

**Impacto:** builds intermitentes (dependendo de quando o client foi gerado por
último) e risco de erro de validação em runtime ao criar/editar perguntas.

### 2.2 Migrations inválidas

- `prisma/migrations/migration_lock.toml` declarava `provider = "postgresql"`,
  enquanto o schema usa `sqlite`.
- As migrations usavam SQL de PostgreSQL (`CREATE TYPE`, `JSONB`, `DROP TYPE`).
- `npx prisma migrate status` falhava com `P3019`.
- O `docker-compose.yml` rodava `npx prisma migrate deploy`, que também falhava.

Na prática, o projeto já não usava migrations: o build aplica o schema com
`prisma db push` e o runtime se auto-recupera copiando um template.

### 2.3 Build Linux podia empacotar o banco de desenvolvimento

- `scripts/linux-docker/build-inner.sh` copiava o workspace via `rsync` sem excluir
  `*.db`.
- Em seguida rodava `prisma db push` sobre o `prisma/radar.db` copiado do host e
  usava **esse mesmo arquivo** como template do pacote.
- Resultado possível: `.deb`/`.AppImage` com usuários/quizzes de desenvolvimento,
  além de falhas de `db push` por drift (ou prompt de perda de dados).

Os scripts Windows e Linux nativo já geravam um template limpo; o Docker era a
exceção.

### 2.4 Payload inflado no instalador

Antes das correções, o staging `qonect/src-tauri/server/` tinha **226,3 MB**, sendo
**139,4 MB** de `node_modules` — e 100% disso era Prisma:

| Item | Tamanho |
|---|---:|
| `node_modules/@prisma` (copiado inteiro) | 118,9 MB |
| `node_modules/.prisma` | 20,5 MB |
| **Total copiado** | **139,4 MB** |

Dentro de `@prisma/engines` (77,2 MB) havia:

- `query_engine-windows.dll.node` (20,1 MB);
- `schema-engine-windows.exe` (18,5 MB, usado só pela CLI);
- cache duplicado em `node_modules/.cache` (38,6 MB).

O query engine era embarcado **três vezes** (`.prisma/client`, `@prisma/engines` e
o cache). Em runtime, o servidor precisa apenas de `@prisma/client` +
`.prisma/client`.

---

## 3. O que foi feito (baixo risco)

| Mudança | Arquivo(s) | Motivo |
|---|---|---|
| `prisma` e `@prisma/client` fixados em `6.12.0` | `package.json`, `package-lock.json` | Eliminar divergência CLI/client |
| Script `prebuild: prisma generate` | `package.json` | Client nunca fica defasado do schema |
| Script `prestart:dev: prisma generate` | `package.json` | Mesma garantia no desenvolvimento local |
| `prisma generate` explícito antes do build | `scripts/build-app.sh`, `scripts/linux-docker/build-inner.sh` | Garantir engine da plataforma correta antes do `tsc` |
| Limpeza total do staging no Linux nativo | `scripts/build-app.sh` | Evitar `node.exe` de build anterior no pacote Linux |
| Copiar só `@prisma/client` + `.prisma` | `scripts/build-app.ps1`, `scripts/build-app.sh`, `scripts/linux-docker/build-inner.sh` | Remover `@prisma/engines` (CLI/schema-engine/cache) do pacote |
| `rsync` exclui `*.db` | `scripts/linux-docker/build-inner.sh` | Não levar banco do host para o container |
| Template sempre vazio em `prisma/build/radar.db` | `scripts/linux-docker/build-inner.sh` | Evitar empacotar dados de desenvolvimento e drift |
| Stage de produção usa o client gerado no builder | `Dockerfile` | Não rodar `npx prisma generate` em runtime de produção |
| `db push` em vez de `migrate deploy` | `docker-compose.yml` | O histórico de migrations não existe mais |
| Pasta `prisma/migrations/` removida | `prisma/migrations/` | Histórico PostgreSQL inválido para SQLite |
| Documentação atualizada | `AGENTS.md`, `README.md`, `docs/BUILD_EXECUTABLE.md`, `documentation/known-issues-and-regressions.md` | Refletir o fluxo real (`db push` + template) |

> As migrations antigas continuam recuperáveis pelo histórico do Git. Elas foram
> removidas apenas do working tree.

---

## 4. Resultado medido

- `npm run build`: **passa** (antes falhava com 5 erros de TypeScript).
- `npm test`: **85 testes / 9 suítes, todos passando**.
- Runtime mínimo validado: servidor sobe e responde com apenas
  `@prisma/client` + `.prisma` (sem `@prisma/engines`).
- Smoke test do servidor embutido (dot-dir, SPA, `/quizzes` 401): **OK**.
- Payload do servidor:

  | Métrica | Antes | Depois |
  |---|---:|---:|
  | `server/node_modules` | 139,4 MB | **59,7 MB** |
  | `server/` total | 226,3 MB | **146,6 MB** |

  Redução de ~79,7 MB por build (antes de compressão do instalador).

O instalador continua grande por causa do `node.exe` embutido (~79,5 MB), não do\nPrisma.

---

## 5. O que NÃO foi feito (e por quê)

- **Trocar o Prisma por outra biblioteca:** é uma refatoração de médio porte e não
  era necessária para destravar o build. Fica registrada na seção 6.
- **Criar migrations reais:** exige decidir a estratégia de upgrade do banco do
  usuário (ver P0 abaixo). `db push` + template resolve o build, não o upgrade.
- **Enxugar `@prisma/client` (39,2 MB):** o pacote inclui vários runtimes
  (`library`, `edge`, `wasm`, `react-native`). Copiar seletivamente é frágil;
  o ganho adicional não compensa o risco agora.
- **Remover `dist-bundle/radar.db`:** o `ncc` copia o `radar.db` de desenvolvimento
  para `dist-bundle/` por causa de `path.join(__dirname, 'radar.db')` em
  `PrismaService`. O build não empacota esse arquivo (copia só o `index.js`), mas é
  um footgun. Ver P2.

---

## 6. Próximos passos

### P0 — Preservar dados em upgrades de versão

**Problema:** `PrismaService.recoverFromIncompatibleDatabase()` faz backup do banco
antigo (`radar.db.bak-<timestamp>`) e recria a partir do template quando
`REQUIRED_SCHEMA` não bate. Isso evita o erro 500, mas **o usuário perde quizzes e
relatórios** (ficam só no backup). A adição de `timeLimitSeconds` é exatamente esse
caso para quem atualizar de uma versão anterior.

**Tarefa:** implementar um caminho de upgrade aditivo antes do self-heal
destrutivo. Opções:

- runner próprio com `PRAGMA user_version` + lista ordenada de `ALTER TABLE ... ADD
  COLUMN ... DEFAULT ...`;
- ou adotar migrations SQLite de verdade (Prisma `migrate` rebaselinado, ou
  `drizzle-kit`, ou SQL puro).

**Critério de aceite:** abrir um banco da versão anterior (sem `timeLimitSeconds`)
e manter usuários/quizzes/relatórios após o upgrade.

### P1 — Definir a estratégia oficial de schema

Escolher uma das opções e documentar:

1. **Migrations versionadas em runtime** (recomendado para desktop): leves,
   preservam dados, sem depender da CLI do Prisma.
2. **Prisma Migrate rebaselinado para SQLite:** criar um baseline novo, remover a
   dependência de `db push` e rodar `migrate deploy` no startup.
3. **Manter `db push` + template:** aceitável só se o upgrade destrutivo for
   explicitamente aceito e comunicado.

Manter `REQUIRED_SCHEMA` como guarda de sanidade, mas não como única estratégia.

### P1 — Reduzir o runtime do Prisma (opcional)

Avaliar `engineType`/copiar seletivamente apenas os arquivos de runtime usados
(`library.js`). Ganho potencial: parte dos 39,2 MB de `@prisma/client`. Exige smoke
test em Windows e Linux.

### P2 — Substituir o Prisma por SQLite leve

Se o objetivo for remover a dependência:

- **Opção A (recomendada):** `better-sqlite3` com SQL puro (sem codegen, sem
  engine de 20 MB, sem Kysely). Para o tamanho do RADAR (6 tabelas, ~45 queries),
  SQL puro fica mais limpo e não vale adicionar um query builder extra.
- **Opção B:** `node:sqlite` (zero dependências), mas ainda experimental no Node 22
  e a API pode mudar; exigiria fixar a versão do Node embutido.

**Por que não usar Kysely:** com 6 tabelas o ganho de type safety nos nomes de
coluna não compensa a dependência extra e o boilerplate de montar relações
manual no JavaScript. Se houver necessidade futura de type safety, pode-se criar
um arquivo de interfaces à mão e usá-lo com `better-sqlite3`.

**Escopo estimado:**

- 3 repositórios/serviços (`RoomRepository`, `QuizService/Repository`,
  `AuthService`);
- 6 tabelas e ~45 queries;
- `src/core/persistence/room.repository.spec.ts` (528 linhas) mocka o formato do
  Prisma e precisaria ser reescrito;
- ~1 a 2 dias de trabalho.

**Critério de aceite:** 85 testes passando, smoke test OK e `server/node_modules`
abaixo de ~20 MB.

### P2 — Higiene de build

- Remover `dist-bundle/radar.db` após o `ncc` (ou evitar o caminho estático em
  `PrismaService`).
- Validar o `Dockerfile` de produção em CI (o stage agora copia `.prisma` do
  builder).
- Documentar a versão do Node usada no bundle (hoje é o `node` da máquina de build).

---

## 7. Como validar

```bash
# Backend (o prebuild roda prisma generate)
cd radar
npm run build

# Testes
npm test

# Aplicar schema no banco local
npx prisma db push

# Build completo do instalador (Windows)
npm run build:app

# Build Linux via Docker
npm run build:app:linux:docker
```

Conferir o payload do staging:

```powershell
$t = "..\qonect\src-tauri\server"
(Get-ChildItem -Recurse "$t\node_modules" -File | Measure-Object Length -Sum).Sum / 1MB
```

Esperado: ~60 MB (não ~139 MB). O smoke test roda automaticamente ao final dos
builds.

---

## 8. Referências

- `AGENTS.md` — comandos e invariantes do projeto.
- `docs/BUILD_EXECUTABLE.md` — arquitetura do servidor embutido.
- `documentation/known-issues-and-regressions.md` — regressões #6 e #7.
- `documentation/release-checklist.md` — checklist antes de publicar.