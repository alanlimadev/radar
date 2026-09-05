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

  it('should initialize quiz state correctly', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    expect(state.title).toBe('Quiz de Teste');
    expect(state.status).toBe('LOBBY');
    expect(state.currentQuestionIndex).toBe(0);
  });

  it('should load quiz questions from QuizService when only quizId is provided', async () => {
    const mockQuizService = {
      findQuizById: jest.fn().mockResolvedValue({
        id: 'quiz-db-1',
        title: 'Quiz do Banco',
        questions: [
          {
            id: 'q1',
            text: 'Qual o framework?',
            order: 0,
            alternatives: [{ id: 'a1', text: 'NestJS', isCorrect: true }],
          },
        ],
      }),
    };

    const gameWithService = new QuizGameDefinition(mockQuizService as any);
    const state = await gameWithService.init({ quizId: 'quiz-db-1' }, mockContext);

    expect(state.title).toBe('Quiz do Banco');
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0].text).toBe('Qual o framework?');
    expect(mockQuizService.findQuizById).toHaveBeenCalledWith('quiz-db-1');
  });

  it('should throw NotFoundException if quizId does not exist', async () => {
    const mockQuizService = {
      findQuizById: jest.fn().mockResolvedValue(null),
    };

    const gameWithService = new QuizGameDefinition(mockQuizService as any);
    await expect(
      gameWithService.init({ quizId: 'inexistent' }, mockContext),
    ).rejects.toThrow('Quiz "inexistent" não encontrado');
  });

  it('should throw BadRequestException if quiz has no questions', async () => {
    const mockQuizService = {
      findQuizById: jest.fn().mockResolvedValue({
        id: 'quiz-empty',
        title: 'Vazio',
        questions: [],
      }),
    };

    const gameWithService = new QuizGameDefinition(mockQuizService as any);
    await expect(
      gameWithService.init({ quizId: 'quiz-empty' }, mockContext),
    ).rejects.toThrow('O quiz selecionado não possui perguntas configuradas');
  });

  it('should start game when host sends START_GAME', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
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

  it('should compute scores when player submits correct answer', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
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
