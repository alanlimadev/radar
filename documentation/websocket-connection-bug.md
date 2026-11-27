# Bug: WebSocket às vezes não conecta ao abrir a página

> **Nota:** este documento registra uma investigação histórica do protocolo legado.
> O cliente atual usa `connect`, `radar:roomJoined` e `radar:stateUpdated`; os eventos
> `quizStarted`, `startQuiz` e `nextQuestion` foram removidos.

## O que acontece

Em algumas aberturas da página, o WebSocket não estabelece conexão — os eventos `connect` e `quizStarted` nunca chegam e a UI fica travada no estado "desconectado". Em outras aberturas funciona normalmente, sem mudança alguma no código.

## Por que acontece

O problema é uma **race condition entre a criação do socket e o registro dos listeners**.

Quando você faz `io('url')`, o Socket.IO inicia a conexão **imediatamente** (handshake HTTP → upgrade para WebSocket). Se o componente React ainda não terminou de montar — ou se o `useEffect` que registra `socket.on('connect', ...)` ainda não rodou — o evento `connect` dispara sem nenhum listener ouvindo.

O comportamento é intermitente porque o timing varia a cada abertura: depende de quantos recursos o browser está carregando em paralelo, se o bundle está em cache, a latência da rede naquele instante, e a velocidade do JavaScript engine no momento. Quando o timing é favorável funciona; quando não é, o evento `connect` chega "antes" dos listeners e se perde.

### Padrões que causam o problema

**Padrão 1 — socket criado fora do componente (conecta na importação do módulo)**

```js
// hooks/useGameSession.js
import { io } from 'socket.io-client';

// ❌ Isso conecta no momento em que o arquivo é importado,
//    muito antes de qualquer componente montar.
const socket = io('http://localhost:3333');

export function useGameSession() {
  useEffect(() => {
    socket.on('connect', () => setConnected(true)); // já perdeu o evento
  }, []);
}
```

**Padrão 2 — socket criado dentro do useEffect, mas sem autoConnect: false**

```js
useEffect(() => {
  // ❌ io() já inicia a conexão. O listener é adicionado logo depois,
  //    mas em redes rápidas (localhost) o 'connect' pode chegar antes.
  const socket = io('http://localhost:3333');
  socket.on('connect', () => setConnected(true));
}, []);
```

**Padrão 3 — React StrictMode (em desenvolvimento)**

Em desenvolvimento, o React com StrictMode monta → desmonta → remonta cada componente para detectar side effects. Se o `useEffect` não tiver cleanup com `socket.disconnect()`, dois sockets são criados, o primeiro fica órfão e o segundo pode não receber os eventos corretamente.

---

## Como corrigir

### Passo 1 — Criar o socket como singleton com `autoConnect: false`

Crie um arquivo separado só para a instância do socket. O `autoConnect: false` impede que a conexão seja iniciada automaticamente na criação.

```js
// src/socket.js
import { io } from 'socket.io-client';

export const socket = io('http://localhost:3333', {
  autoConnect: false,
});
```

### Passo 2 — Conectar dentro do useEffect, depois de registrar os listeners

```js
// src/hooks/useGameSession.js
import { useEffect, useState } from 'react';
import { socket } from '../socket';

export function useGameSession() {
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // ✅ Listeners registrados ANTES de conectar
    function onConnect() {
      setConnected(true);
    }

    function onDisconnect() {
      setConnected(false);
    }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // ✅ Conecta só agora — o evento 'connect' vai encontrar o listener
    socket.connect();

    // ✅ Cleanup: remove listeners e desconecta ao desmontar
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.disconnect();
    };
  }, []); // array vazio = roda uma única vez

  return { socket, connected };
}
```

### Por que essa abordagem resolve

1. **`autoConnect: false`** garante que o socket não tenta conectar na criação.
2. **`socket.on(...)` antes de `socket.connect()`** garante que o listener está registrado quando o evento `connect` chegar.
3. **`socket.off(...)` no cleanup** evita listeners duplicados no React StrictMode.
4. **`socket.disconnect()` no cleanup** garante que a conexão é encerrada quando o componente desmonta.

---

## Eventos novos que o frontend precisa ouvir

Junto com a correção da conexão, o backend passou por mudanças que adicionam novos eventos. Registre esses listeners no mesmo `useEffect`:

```js
useEffect(() => {
  // Conexão
  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);

  // ✅ NOVO — player saiu da sessão (desconectou o browser)
  socket.on('playerLeft', ({ playerId, playerName }) => {
    setPlayerList((prev) => prev.filter((p) => p.id !== playerId));
  });

  socket.connect();

  return () => {
    socket.off('connect', onConnect);
    socket.off('disconnect', onDisconnect);
    socket.off('playerLeft');
    socket.disconnect();
  };
}, []);
```

---

## Mudanças nos eventos `startQuiz` e `nextQuestion`

O backend agora controla o fluxo interno do quiz. Os payloads foram simplificados:

### startQuiz

```js
// ❌ Antes
socket.emit('startQuiz', { sessionId: 1 });

// ✅ Agora — sem payload (sessionId já foi definido no joinAsHost)
socket.emit('startQuiz');
```

### nextQuestion

```js
// ❌ Antes
socket.emit('nextQuestion', { sessionId: 1, currentQuestionIndex: 2 });

// ✅ Agora — sem payload (índice e sessionId controlados pelo servidor)
socket.emit('nextQuestion');
```

O servidor responde com os mesmos eventos de sempre (`nextQuestion`, `quizEnded`) contendo `currentQuestionIndex` e `totalQuestions`.

---

## Resumo das mudanças necessárias no frontend

| O que mudar | Como ficou |
|---|---|
| Criação do socket | `io(url, { autoConnect: false })` em arquivo separado |
| Conexão | `socket.connect()` dentro do `useEffect`, depois dos `on()` |
| Cleanup | `socket.off()` + `socket.disconnect()` no retorno do `useEffect` |
| Payload de `startQuiz` | Remover `sessionId` (enviar sem payload) |
| Payload de `nextQuestion` | Remover `sessionId` e `currentQuestionIndex` (enviar sem payload) |
| Novo evento `playerLeft` | Adicionar listener para remover player do lobby |
