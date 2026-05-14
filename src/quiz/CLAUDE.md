# CLAUDE.md — módulo quiz

Gerencia quizzes, perguntas e alternativas. Todas as rotas exigem JWT (`JwtAuthGuard` aplicado no controller inteiro).

## Regras de negócio

**Alternativas:**
- Cada pergunta deve ter **exatamente 4** alternativas.
- Deve haver **exatamente 1** alternativa correta por pergunta.
- Essas regras são validadas no controller via `validateAlternatives()` antes de chamar o service. O service não valida — assumir que os dados chegam corretos ao `QuizService`.

**Ownership:**
- `createdBy` é sempre extraído de `req.user.id` (JWT) — nunca vem do body do cliente.
- `updateQuiz` e `deleteQuiz` lançam `ForbiddenException` se `req.user.id !== quiz.createdBy`.
- Perguntas e alternativas **não** validam ownership individualmente — o controle é feito no nível do quiz.

## Endpoints

```
POST   /quizzes                              — criar quiz (com perguntas opcionais)
GET    /quizzes                              — listar todos
GET    /quizzes/:id                          — buscar por ID
PUT    /quizzes/:id                          — atualizar título/descrição (só owner)
DELETE /quizzes/:id                          — deletar quiz (só owner)

POST   /quizzes/:quizId/questions            — adicionar pergunta
PUT    /quizzes/questions/:questionId        — atualizar pergunta
DELETE /quizzes/questions/:questionId        — deletar pergunta

POST   /quizzes/questions/:questionId/alternatives   — adicionar alternativa
PUT    /quizzes/alternatives/:alternativeId          — atualizar alternativa
DELETE /quizzes/alternatives/:alternativeId          — deletar alternativa
```

## Atenção: QuizRepository

`QuizRepository` cria sua própria instância de `PrismaClient` em vez de injetar `PrismaService`. Isso significa que opera numa conexão separada do restante da aplicação. Consistente com `UserRepository`, mas diferente do `GameSessionService` que injeta `PrismaService`.
