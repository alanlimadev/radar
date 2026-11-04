# AGENTS.md — módulo quiz

Gerencia quizzes, perguntas e alternativas. Todas as rotas exigem JWT (`JwtAuthGuard` aplicado no controller inteiro).

## Regras de negócio

**Alternativas:**
- Cada pergunta deve ter **exatamente 4** alternativas.
- Deve haver **exatamente 1** alternativa correta por pergunta.
- Essas regras são validadas no controller via `validateAlternatives()` antes de chamar o service. O service não valida — assumir que os dados chegam corretos ao `QuizService`.

**Tempo de resposta:**
- Cada pergunta tem `timeLimitSeconds` (inteiro, entre 5 e 300), com padrão **30** para quizzes antigos.
- O valor é persistido no banco e propagado nos eventos `quizStarted` / `nextQuestion` e em `getClientState`, para o frontend usar no countdown.

**Ownership (isolamento completo por usuário):**
- `createdBy` é sempre extraído de `req.user.id` (JWT) — nunca vem do body do cliente.
- `findAllQuizzes(userId)` filtra com `where: { createdBy: userId }`.
- `findQuizByIdForUser(id, userId)` é a versão usada pelas rotas HTTP: lança `ForbiddenException` se o quiz for de outro usuário. `findQuizById(id)` continua sem filtro para uso interno do motor.
- Todas as operações de pergunta e alternativa validam o dono do quiz:
  - `addQuestion(quizId, data, userId)`
  - `updateQuestion/deleteQuestion(questionId, data?, userId)`
  - `addAlternative/updateAlternative/deleteAlternative(..., userId)`
  - `getAlternativesByQuestion(questionId, userId?)` e `getAlternativeById(alternativeId, userId?)` validam quando `userId` é informado.
- O não-dono recebe `403 ForbiddenException`; recurso inexistente recebe `404 NotFoundException`.
- `QuizGameDefinition.init()` valida `quiz.createdBy === context.hostId` antes de iniciar a sala (regra mantida no módulo quiz para o core continuar agnóstico).

## Endpoints

```
POST   /quizzes                              — criar quiz (com perguntas opcionais)
GET    /quizzes                              — listar apenas os quizzes do usuário logado
GET    /quizzes/:id                          — buscar por ID (só owner)
PUT    /quizzes/:id                          — atualizar título/descrição (só owner)
DELETE /quizzes/:id                          — deletar quiz (só owner)

POST   /quizzes/:quizId/questions            — adicionar pergunta (só owner)
PUT    /quizzes/questions/:questionId        — atualizar pergunta (só owner)
DELETE /quizzes/questions/:questionId        — deletar pergunta (só owner)

POST   /quizzes/questions/:questionId/alternatives   — adicionar alternativa (só owner)
PUT    /quizzes/alternatives/:alternativeId          — atualizar alternativa (só owner)
DELETE /quizzes/alternatives/:alternativeId          — deletar alternativa (só owner)

GET    /quizzes/:id/export                   — exportar quiz como JSON (só owner)
POST   /quizzes/import                       — importar quiz a partir de JSON (cria novo quiz do usuário)
```

## Atenção: QuizRepository

`QuizRepository` cria sua própria instância de `PrismaClient` em vez de injetar `PrismaService`. Isso significa que opera numa conexão separada do restante da aplicação. Consistente com `UserRepository`, mas diferente do `GameSessionService` que injeta `PrismaService`.
