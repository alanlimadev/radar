import { QuizGameDefinition, QuizConfig } from './quiz-game.definition';
import { GameContext, ActionContext } from '../core/interfaces/game-definition.interface';
import { Player } from '../core/interfaces/player.interface';

describe('QuizGameDefinition', () => {
  let quizGame: QuizGameDefinition;

  const mockConfig: QuizConfig = {
    quizId: 'q-1',
    title: 'Quiz de Teste',
    questions: [
      {
        id: 'quest-1',
        text: 'Qual a capital do Brasil?',
        order: 0,
        alternatives: [
          { id: 'alt-1', text: 'Brasília', isCorrect: true },
          { id: 'alt-2', text: 'Rio de Janeiro', isCorrect: false },
        ],
      },
      {
        id: 'quest-2',
        text: 'Quanto é 2 + 2?',
        order: 1,
        alternatives: [
          { id: 'alt-3', text: '4', isCorrect: true },
          { id: 'alt-4', text: '5', isCorrect: false },
        ],
      },
    ],
  };

  const mockContext: GameContext = {
    roomId: 'room-1',
    roomCode: '123456',
    hostId: 'host-1',
    players: [],
  };

  beforeEach(() => {
    quizGame = new QuizGameDefinition();
  });

  it('should initialize quiz state correctly', () => {
    const state = quizGame.init(mockConfig, mockContext);
    expect(state.title).toBe('Quiz de Teste');
    expect(state.status).toBe('LOBBY');
    expect(state.currentQuestionIndex).toBe(0);
  });

  it('should start game when host sends START_GAME', () => {
    const state = quizGame.init(mockConfig, mockContext);
    const hostPlayer: Player = {
      id: 'host-1',
      name: 'Host',
      socketId: 'sock-h',
      isHost: true,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      sender: hostPlayer,
    };

    const result = quizGame.onAction(
      state,
      {
        type: 'START_GAME',
        payload: {},
        senderId: hostPlayer.id,
        isHost: true,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(result.newState.status).toBe('QUESTION_ACTIVE');
    expect(result.events).toHaveLength(1);
    expect(result.events![0].event).toBe('quizStarted');
  });

  it('should compute scores when player submits correct answer', () => {
    const state = quizGame.init(mockConfig, mockContext);
    state.status = 'QUESTION_ACTIVE';

    const player: Player = {
      id: 'player-1',
      name: 'Alice',
      socketId: 'sock-a',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      score: 0,
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      players: [player],
      sender: player,
    };

    const result = quizGame.onAction(
      state,
      {
        type: 'SUBMIT_ANSWER',
        payload: {
          questionId: 'quest-1',
          alternativeId: 'alt-1',
        },
        senderId: player.id,
        isHost: false,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(result.directResponse?.isCorrect).toBe(true);
    expect(result.newState.playerScores.get(player.id)).toBe(1);
  });
});
