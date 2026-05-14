# Game Session API - Documentação Completa

## Visão Geral

O módulo de Game Session permite criar sessões de jogo em tempo real baseadas em quizzes, similar ao Kahoot. Os hosts podem criar sessões e os players se conectam via WebSocket para participar do jogo.

## Fluxo Básico de Uso

### 1. Criar Sessão (Host)

```bash
POST /game-session
Content-Type: application/json

{
  "quizId": "550e8400-e29b-41d4-a716-446655440001"
}
```

**Resposta:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "quizId": "550e8400-e29b-41d4-a716-446655440001",
  "status": "IN_PROGRESS",
  "startedAt": "2023-08-20T16:00:00.000Z",
  "endedAt": null
}
```

### 2. Conectar Jogadores via WebSocket

```javascript
// Conectar ao servidor WebSocket
const socket = io('ws://localhost:3333');

// Entrar na sessão
socket.emit('joinSession', {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  playerName: 'João Silva',
});

// Escutar confirmação
socket.on('playerJoined', (player) => {
  console.log('Jogador conectado:', player);
});
```

### 3. Iniciar Quiz (Host)

```javascript
// Host inicia o quiz
socket.emit('startQuiz', {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
});

// Todos recebem a primeira pergunta
socket.on('quizStarted', (data) => {
  console.log('Quiz iniciado:', data);
  // {
  //   question: {
  //     id: "...",
  //     text: "Em que ano foi proclamada a independência do Brasil?",
  //     alternatives: [
  //       { id: "...", text: "1822" },
  //       { id: "...", text: "1889" }
  //     ]
  //   },
  //   currentQuestionIndex: 0,
  //   totalQuestions: 10
  // }
});
```

### 4. Responder Perguntas (Players) - SIMPLIFICADO ✅

```javascript
// Player envia resposta (sem precisar passar sessionId/playerId!)
socket.emit('submitAnswer', {
  questionId: '550e8400-e29b-41d4-a716-446655440002',
  alternativeId: '550e8400-e29b-41d4-a716-446655440003',
});

// Receber confirmação da resposta
socket.on('answerSubmitted', (result) => {
  console.log('Resposta enviada:', result);
  // { success: true, isCorrect: true }
});
```

### 5. Avançar Perguntas (Host)

```javascript
// Host avança para próxima pergunta
socket.emit('nextQuestion', {
  sessionId: '550e8400-e29b-41d4-a716-446655440000',
  currentQuestionIndex: 0,
});

// Todos recebem a próxima pergunta
socket.on('nextQuestion', (data) => {
  console.log('Próxima pergunta:', data);
});
```

### 6. Ver Placar - SIMPLIFICADO ✅

```javascript
// Buscar placar atual (sem precisar passar sessionId!)
socket.emit('getScores');

// Receber placar atualizado
socket.on('scoresUpdate', (data) => {
  console.log('Placar:', data.scores);
  // [
  //   { playerId: "...", playerName: "João Silva", correctAnswers: 8, score: 8 },
  //   { playerId: "...", playerName: "Maria Santos", correctAnswers: 6, score: 6 }
  // ]
});
```

### 7. Final do Quiz

```javascript
// Quiz termina automaticamente quando acabam as perguntas
socket.on('quizEnded', (data) => {
  console.log('Quiz finalizado:', data.scores);
});
```

## Endpoints REST Disponíveis

### GET /game-session/:id

Busca detalhes completos da sessão, incluindo quiz, perguntas e jogadores.

### GET /game-session/:id/players

Lista todos os jogadores conectados à sessão.

### GET /game-session/:id/scores

Retorna o placar atual da sessão.

### PUT /game-session/:id/finish

Finaliza manualmente uma sessão de jogo.

## Estados da Sessão

- **IN_PROGRESS**: Sessão ativa, jogadores podem se conectar
- **FINISHED**: Sessão finalizada, não aceita mais jogadores

## Validações e Regras

1. **Quiz deve existir** para criar uma sessão
2. **Jogadores só podem se conectar** a sessões IN_PROGRESS
3. **Respostas só são aceitas** para perguntas do quiz atual
4. **Host controla o fluxo** do jogo (iniciar, avançar perguntas)
5. **Placar é calculado** automaticamente baseado em respostas corretas

## Tratamento de Erros

Todos os eventos WebSocket retornam `{ success: boolean }` para indicar se a operação foi bem-sucedida. Os endpoints REST seguem os códigos HTTP padrão:

- **200**: Sucesso
- **400**: Dados inválidos
- **404**: Recurso não encontrado
- **500**: Erro interno do servidor

## Exemplo Completo de Implementação

Veja o arquivo `websocket-events.doc.ts` para exemplos completos de interfaces TypeScript e fluxos de uso.
