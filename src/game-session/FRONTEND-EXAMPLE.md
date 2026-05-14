# 🎮 Exemplo Prático Simplificado - Frontend

## ✅ **NOVIDADE: SessionId Automático!**

Após conectar com `joinSession`, você **NÃO precisa mais** passar `sessionId` e `playerId` nos eventos. O servidor armazena essas informações automaticamente no socket!

## 📱 **Exemplo React Atualizado**

```jsx
// hooks/useGameSession.js - VERSÃO SIMPLIFICADA
import { useState, useEffect } from 'react';
import io from 'socket.io-client';

export const useGameSession = () => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [gameStatus, setGameStatus] = useState('disconnected');

  useEffect(() => {
    const newSocket = io('http://localhost:3333');
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('🟢 Conectado ao servidor');
      setConnected(true);
    });

    newSocket.on('playerJoined', (player) => {
      console.log(`✅ ${player.name} entrou no jogo!`);
      setGameStatus('waiting');
    });

    newSocket.on('quizStarted', (data) => {
      console.log('🚀 Quiz iniciado!', data);
      setCurrentQuestion(data.question);
      setGameStatus('playing');
    });

    newSocket.on('nextQuestion', (data) => {
      console.log('➡️ Próxima pergunta:', data);
      setCurrentQuestion(data.question);
    });

    newSocket.on('answerSubmitted', (result) => {
      console.log('📝 Resposta enviada:', result);
      if (result.isCorrect) {
        alert('✅ Resposta correta!');
      } else {
        alert('❌ Resposta incorreta!');
      }
    });

    newSocket.on('scoresUpdate', (data) => {
      console.log('🏆 Placar atualizado:', data.scores);
    });

    newSocket.on('quizEnded', (data) => {
      console.log('🏁 Quiz finalizado!', data);
      setGameStatus('finished');
    });

    newSocket.on('error', (error) => {
      console.error('❌ Erro:', error);
      alert(error.message);
    });

    return () => newSocket.close();
  }, []);

  // FUNÇÕES SIMPLIFICADAS
  const joinGame = (sessionId, playerName) => {
    socket.emit('joinSession', { sessionId, playerName });
  };

  const submitAnswer = (questionId, alternativeId) => {
    // NÃO PRECISA MAIS de sessionId e playerId!
    socket.emit('submitAnswer', { questionId, alternativeId });
  };

  const getScores = () => {
    // NÃO PRECISA MAIS de sessionId!
    socket.emit('getScores');
  };

  const startQuiz = (sessionId) => {
    // Host ainda precisa informar sessionId (não está conectado como player)
    socket.emit('startQuiz', { sessionId });
  };

  return {
    connected,
    currentQuestion,
    gameStatus,
    joinGame,
    submitAnswer,
    getScores,
    startQuiz,
  };
};
```

## 🎯 **Componente Player Atualizado**

```jsx
// components/PlayerGame.jsx
import { useState } from 'react';
import { useGameSession } from '../hooks/useGameSession';

export const PlayerGame = ({ sessionId }) => {
  const [playerName, setPlayerName] = useState('');
  const [joined, setJoined] = useState(false);

  const {
    connected,
    currentQuestion,
    gameStatus,
    joinGame,
    submitAnswer,
    getScores,
  } = useGameSession();

  const handleJoinGame = () => {
    joinGame(sessionId, playerName);
    setJoined(true);
  };

  const handleAnswer = (alternativeId) => {
    // SUPER SIMPLES! Só precisa da alternativa escolhida
    submitAnswer(currentQuestion.id, alternativeId);
  };

  const handleShowScores = () => {
    // SUPER SIMPLES! Não precisa de parâmetros
    getScores();
  };

  if (!connected) {
    return <div>🔄 Conectando ao servidor...</div>;
  }

  if (!joined) {
    return (
      <div className="join-screen">
        <h2>🎮 Entrar no Jogo</h2>
        <input
          type="text"
          placeholder="Seu nome"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
        />
        <button onClick={handleJoinGame} disabled={!playerName.trim()}>
          Entrar
        </button>
      </div>
    );
  }

  return (
    <div className="game-screen">
      {gameStatus === 'waiting' && (
        <div className="waiting">
          <h3>⏳ Aguardando o host iniciar...</h3>
          <button onClick={handleShowScores}>Ver Placar</button>
        </div>
      )}

      {gameStatus === 'playing' && currentQuestion && (
        <div className="question">
          <h3>❓ {currentQuestion.text}</h3>
          <div className="alternatives">
            {currentQuestion.alternatives.map((alt) => (
              <button
                key={alt.id}
                onClick={() => handleAnswer(alt.id)}
                className="alternative-btn"
              >
                {alt.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {gameStatus === 'finished' && (
        <div className="results">
          <h3>🏁 Jogo Finalizado!</h3>
          <button onClick={handleShowScores}>Ver Placar Final</button>
        </div>
      )}
    </div>
  );
};
```

## 🧪 **Teste Rápido no Browser**

Abra o console do navegador e cole:

```javascript
// Conectar
const socket = io('http://localhost:3333');

// Entrar em uma sessão (substitua pelos IDs reais)
socket.emit('joinSession', {
  sessionId: 'cole-session-id-aqui',
  playerName: 'Teste Player',
});

// Responder pergunta (SUPER SIMPLES!)
socket.on('quizStarted', (data) => {
  console.log('Pergunta:', data.question.text);

  // Responder a primeira alternativa
  socket.emit('submitAnswer', {
    questionId: data.question.id,
    alternativeId: data.question.alternatives[0].id,
  });
});

// Ver placar (SEM PARÂMETROS!)
socket.emit('getScores');
```

## 🎉 **Vantagens da Nova Implementação:**

1. **Menos código** - Não precisa gerenciar sessionId/playerId
2. **Menos erros** - Servidor controla automaticamente
3. **Mais simples** - Focus na lógica do jogo, não na infraestrutura
4. **Mais seguro** - IDs ficam no servidor, não expostos no frontend

Agora é muito mais fácil integrar no frontend! 🚀
