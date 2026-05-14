# CLAUDE.md — módulo prisma

Fornece `PrismaService` como singleton compartilhado para toda a aplicação. `PrismaModule` é global — não precisa ser importado em cada módulo.

## Uso correto

Injete `PrismaService` diretamente no service:

```ts
constructor(private prisma: PrismaService) {}

await this.prisma.host.findUnique(...)
await this.prisma.gameSession.create(...)
```

## Inconsistência existente

`QuizRepository` e `UserRepository` criam sua própria instância de `new PrismaClient()` em vez de injetar `PrismaService`. Isso funciona mas significa conexões separadas ao banco. Novos módulos devem injetar `PrismaService`.
