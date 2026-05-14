# CLAUDE.md — módulo game-session

Núcleo do Radar. Combina REST (criação/consulta de sessões) com WebSocket via Socket.IO (fluxo do jogo em tempo real). Ambos rodam na porta 3333.

## Modelo de dados

`GameSession` usa `id` inteiro (auto-increment), diferente dos outros modelos que usam UUID. `hostId` referencia o host que criou a sessão. `status`: `IN_PROGRESS` → `FINISHED`.

## REST endpoints

```
POST /game-session               — criar sessão (requer quizId + hostId no body)
GET  /game-session/:id           — detalhes completos (quiz + perguntas + players)
GET  /game-session/:id/players   — listar players da sessão
GET  /game-session/:id/scores    — placar ordenado por score decrescente
PUT  /game-session/:id/finish    — finalizar sessão manualmente
```

## Fluxo WebSocket

O estado do player (`sessionId`, `playerId`) é armazenado em `client.data` no momento do `joinSession`. Eventos subsequentes do player não precisam repassar esses IDs.

```
1. [Host]   POST /game-session           → recebe sessionId (inteiro)
2. [Player] emit joinSession             → { sessionId, playerName }
            ← playerJoined               → { id, name, gameSessionId }
3. [Host]   emit startQuiz               → { sessionId }
            ← quizStarted (broadcast)    → { question, currentQuestionIndex, totalQuestions }
4. [Player] emit submitAnswer            → { questionId, alternativeId }  (sem sessionId/playerId)
            ← answerSubmitted            → { success, isCorrect }
5. [Host]   emit nextQuestion            → { sessionId, currentQuestionIndex }
            ← nextQuestion (broadcast)   → próxima pergunta
            ← quizEnded (broadcast)      → { scores } quando acabam as perguntas
6. [Player] emit getScores               → (sem parâmetros)
            ← scoresUpdate (broadcast)   → { scores }
```

## Regras importantes

- `joinSession` só deve ser aceito em sessões com status `IN_PROGRESS` (validação ainda não implementada no gateway — oportunidade de melhoria).
- O host controla o fluxo (`startQuiz`, `nextQuestion`). O gateway não valida se quem emite é de fato o host da sessão — outra oportunidade de melhoria.
- Score = número de respostas corretas (sem peso por tempo).
- Quando `nextQuestion` é chamado na última pergunta, a sessão é finalizada automaticamente e o evento `quizEnded` é emitido para todos.
