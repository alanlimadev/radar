# Mudanças na API — Guia para o Frontend

> **Documento histórico:** o protocolo legado descrito abaixo foi removido. O contrato
> atual usa exclusivamente `radar:*`: entre na sala com `radar:joinAsHost` ou
> `radar:joinRoom`, envie ações com `radar:dispatchAction` (`START_GAME`,
> `NEXT_QUESTION`, `SUBMIT_ANSWER`, `GET_SCORES`) e atualize a UI a partir de
> `radar:roomJoined` e `radar:stateUpdated`. Os eventos `quizStarted`,
> `questionEnded`, `scoresUpdate`, `quizEnded` e `answerSubmitted` não existem mais.

Este documento descreve todas as alterações feitas na API que impactam o frontend, os bugs corrigidos e os ajustes necessários no cliente.

---

## 1. Host não deve mais chamar `joinSession`

### Problema corrigido
O host estava sendo registrado como player no banco ao chamar `joinSession`, o que fazia seu nome aparecer no ranking final.

### O que mudar
O host agora deve usar o evento **`joinAsHost`** para conectar ao WebSocket da sessão. Esse evento entra na sala sem criar um registro de player.

**Antes (errado):**
```js
// HOST conectando — NÃO FAZER MAIS ISSO
socket.emit('joinSession', {
  sessionId: 1,
  playerName: 'Prof. Alan',
});
```

**Depois (correto):**
```js
// HOST conectando
socket.emit('joinAsHost', {
  sessionId: 1,
});

// Confirmação de sucesso
socket.on('existingPlayers', (players) => {
  console.log('Conectado como host. Players na sala:', players);
});
```

### Resposta de `joinAsHost`
- **`existingPlayers`** — array com todos os players já conectados à sessão (igual ao que os players recebem).
- **`error`** — se a sessão não for encontrada.

---

## 2. Novo comportamento de `joinSession` para players

### Problema corrigido
Players que entravam depois do primeiro não conseguiam ver quem já estava na sessão.

### O que mudar
Ao chamar `joinSession`, o player agora recebe dois eventos de resposta:

| Evento | Descrição |
|---|---|
| `existingPlayers` | Array com **todos** os players da sessão (incluindo o próprio) — use para montar a lista inicial. |
| `playerJoined` | Recebido pelos **outros** players para notificar a nova entrada. |

**Implementação recomendada:**
```js
socket.emit('joinSession', {
  sessionId: 1,
  playerName: 'João Silva',
});

// Recebido só pelo player que acabou de entrar — monta a lista completa
socket.on('existingPlayers', (players) => {
  setPlayerList(players); // substitui, não adiciona
});

// Recebido pelos outros players já na sala — adiciona o novo à lista
socket.on('playerJoined', (newPlayer) => {
  setPlayerList((prev) => [...prev, newPlayer]);
});
```

> **Atenção:** `existingPlayers` é agora o evento correto para inicializar a tela de lobby. O evento `playerJoined` é apenas para atualizações incrementais nos clientes já conectados.

---

## 3. `joinSession` agora valida o status da sessão

### O que mudou
Se a sessão estiver com status `FINISHED`, o evento retorna erro e o player não entra.

```js
socket.on('error', (err) => {
  // err.message === 'Sessão não está disponível para entrada'
  alert(err.message);
});
```

---

## 4. `startQuiz` e `nextQuestion` exigem que seja o host

### Problema corrigido
Qualquer socket conectado podia iniciar ou avançar o quiz.

### O que mudou
Esses eventos agora só funcionam se o socket tiver se conectado via `joinAsHost`. Se um player tentar emitir, recebe erro:

```js
socket.on('error', (err) => {
  // 'Apenas o host pode iniciar o quiz'
  // 'Apenas o host pode avançar as perguntas'
});
```

Não há mudança na estrutura dos eventos em si — apenas garanta que o host usa `joinAsHost` antes de chamar `startQuiz` ou `nextQuestion`.

---

## 5. `submitAnswer` bloqueado para o host

### O que mudou
Se o socket conectado via `joinAsHost` tentar emitir `submitAnswer`, recebe erro:

```js
socket.on('error', (err) => {
  // 'Apenas players podem enviar respostas'
});
```

---

## 6. `POST /game-session` agora exige autenticação

### Problema corrigido
Qualquer pessoa podia criar uma sessão sem estar logada.

### O que mudar
O endpoint agora exige o header `Authorization: Bearer <token>`. O `hostId` não deve mais ser enviado no body — ele é derivado automaticamente do token.

**Antes (errado):**
```js
fetch('/game-session', {
  method: 'POST',
  body: JSON.stringify({
    quizId: 'uuid-do-quiz',
    hostId: 'uuid-do-host', // REMOVER
  }),
});
```

**Depois (correto):**
```js
fetch('/game-session', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    quizId: 'uuid-do-quiz',
    // hostId não existe mais no body
  }),
});
```

---

## 7. Ordem das perguntas agora é definida pelo host

### Problema corrigido
As perguntas eram ordenadas alfabeticamente pelo texto — a ordem que o host definiu ao criar o quiz não era respeitada.

### O que mudou
As perguntas agora retornam na ordem em que foram criadas (campo `order` no banco). Nenhuma mudança necessária no frontend — as perguntas já chegarão na ordem correta via `quizStarted` e `nextQuestion`.

---

## 8. Erro ao deletar quiz com sessões vinculadas

### Problema corrigido
Ao tentar deletar um quiz que possuía sessões de jogo associadas, a API retornava erro 500 genérico.

### Novo comportamento
A API agora retorna **409 Conflict** com mensagem clara:

```json
{
  "statusCode": 409,
  "message": "Quiz possui sessões vinculadas e não pode ser deletado."
}
```

Trate esse caso na UI:
```js
if (response.status === 409) {
  alert('Este quiz possui sessões e não pode ser deletado.');
}
```

---

## Resumo dos eventos WebSocket

### Eventos que o HOST emite
| Evento | Payload | Descrição |
|---|---|---|
| `joinAsHost` | `{ sessionId }` | Conectar à sessão como host |
| `startQuiz` | _(nenhum)_ | Iniciar o quiz — sessionId vem do joinAsHost |
| `nextQuestion` | _(nenhum)_ | Avançar pergunta — índice controlado pelo servidor |
| `getScores` | _(nenhum)_ | Solicitar placar atual |

### Eventos que o PLAYER emite
| Evento | Payload | Descrição |
|---|---|---|
| `joinSession` | `{ sessionId, playerName }` | Entrar na sessão como player |
| `submitAnswer` | `{ questionId, alternativeId }` | Enviar resposta |
| `getScores` | _(nenhum)_ | Solicitar placar atual |

### Eventos recebidos (host e players)
| Evento | Descrição |
|---|---|
| `existingPlayers` | Lista completa de players ao conectar (host e player recebem) |
| `playerJoined` | Novo player entrou (recebido pelos já conectados) |
| `playerLeft` | Player desconectou — `{ playerId, playerName }` |
| `quizStarted` | Quiz iniciado, contém a primeira pergunta |
| `nextQuestion` | Próxima pergunta |
| `quizEnded` | Quiz finalizado, contém o ranking final |
| `scoresUpdate` | Placar atualizado (broadcast para todos) |
| `answerSubmitted` | Confirmação de resposta (só para quem enviou) |
| `error` | Erro em qualquer operação |
