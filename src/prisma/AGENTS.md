# AGENTS.md — módulo prisma

Fornece `PrismaService` como singleton compartilhado para toda a aplicação. `PrismaModule` é global — não precisa ser importado em cada módulo.

## Uso correto

Injete `PrismaService` diretamente no service:

```ts
constructor(private prisma: PrismaService) {}

await this.prisma.host.findUnique(...)
await this.prisma.gameRoom.create(...)
```

## Convenção de acesso

`QuizRepository` e `UserRepository` injetam `PrismaService` e apenas expõem delegates tipados (`get quiz() { return this.prisma.quiz; }`). Siga esse padrão: nenhuma classe deve instanciar `new PrismaClient()` — isso abriria uma conexão separada ao banco.
