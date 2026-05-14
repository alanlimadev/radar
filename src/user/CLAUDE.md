# CLAUDE.md — módulo user (host)

Módulo responsável pelo gerenciamento de perfil dos hosts. O controller (`/users`) existe mas não tem rotas implementadas ainda — é o local correto para adicionar perfil, atualização de dados, etc.

## Estrutura

`UserRepository` expõe `host = this.prisma.host` (Prisma client próprio, não injeta `PrismaService`). Padrão herdado do `QuizRepository` — ambos criam sua própria instância de `PrismaClient`.

`UserService` injeta `UserRepository` e é onde a lógica de negócio do host vai ficar.

## Relação com auth

Registro e login ficam em `src/auth/`. Este módulo é para operações pós-autenticação sobre o perfil do host.
