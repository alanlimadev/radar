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
    expect(result.directResponse?.pointsAwarded).toBe(1000);
    expect(result.newState.playerScores.get(player.id)).toBe(1000);
    expect(result.newState.playerCorrectAnswers?.get(player.id)).toBe(1);
    // Como era o único jogador, já deve transicionar para QUESTION_LEADERBOARD
    expect(result.newState.status).toBe('QUESTION_LEADERBOARD');
    expect(result.events?.some((e) => e.event === 'questionEnded')).toBe(true);
    expect(result.events?.some((e) => e.event === 'scoresUpdate')).toBe(true);
  });

  it('should remain in QUESTION_ACTIVE when only some players have answered', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    state.status = 'QUESTION_ACTIVE';

    const player1: Player = {
      id: 'p1',
      name: 'Alice',
      socketId: 's1',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };
    const player2: Player = {
      id: 'p2',
      name: 'Bob',
      socketId: 's2',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      players: [player1, player2],
      sender: player1,
    };

    const result = quizGame.onAction(
      state,
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'quest-1', alternativeId: 'alt-1' },
        senderId: player1.id,
        isHost: false,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(result.newState.status).toBe('QUESTION_ACTIVE');
    expect(result.events).toBeUndefined();
  });

  it('should transition to QUESTION_LEADERBOARD if host advances during QUESTION_ACTIVE', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    state.status = 'QUESTION_ACTIVE';

    const hostPlayer: Player = {
      id: 'host-1',
      name: 'Prof',
      socketId: 'sh',
      isHost: true,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      sender: hostPlayer,
    };

    // 1st click: Host encerra a pergunta ativa antes do tempo
    const step1 = quizGame.onAction(
      state,
      {
        type: 'NEXT_QUESTION',
        payload: {},
        senderId: hostPlayer.id,
        isHost: true,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(step1.newState.status).toBe('QUESTION_LEADERBOARD');
    expect(step1.events?.some((e) => e.event === 'questionEnded')).toBe(true);

    // 2nd click: Host avança da tela de Leaderboard para a próxima questão
    const step2 = quizGame.onAction(
      step1.newState,
      {
        type: 'NEXT_QUESTION',
        payload: {},
        senderId: hostPlayer.id,
        isHost: true,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(step2.newState.status).toBe('QUESTION_ACTIVE');
    expect(step2.newState.currentQuestionIndex).toBe(1);
    expect(step2.events?.some((e) => e.event === 'nextQuestion')).toBe(true);
  });

  it('should reveal isCorrect to players only on QUESTION_LEADERBOARD or GAME_OVER', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    const player: Player = {
      id: 'p1',
      name: 'Alice',
      socketId: 's1',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    state.status = 'QUESTION_ACTIVE';
    const activeState = quizGame.getClientState(state, player, false);
    expect(activeState.currentQuestion.alternatives[0].isCorrect).toBeUndefined();
    expect(activeState.isLeaderboard).toBe(false);

    state.status = 'QUESTION_LEADERBOARD';
    const leaderboardState = quizGame.getClientState(state, player, false);
    expect(leaderboardState.currentQuestion.alternatives[0].isCorrect).toBe(true);
    expect(leaderboardState.isLeaderboard).toBe(true);
  });

  it('should award more points to earlier correct answers avoiding ties', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    state.status = 'QUESTION_ACTIVE';

    const player1: Player = {
      id: 'p1',
      name: 'Alice',
      socketId: 's1',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };
    const player2: Player = {
      id: 'p2',
      name: 'Bob',
      socketId: 's2',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      players: [player1, player2],
      sender: player1,
    };

    // Alice responds first and correctly
    const res1 = quizGame.onAction(
      state,
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'quest-1', alternativeId: 'alt-1' },
        senderId: player1.id,
        isHost: false,
        timestamp: new Date(),
      },
      actionContext,
    );

    // Bob responds second and correctly
    const res2 = quizGame.onAction(
      res1.newState,
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'quest-1', alternativeId: 'alt-1' },
        senderId: player2.id,
        isHost: false,
        timestamp: new Date(),
      },
      { ...actionContext, sender: player2 },
    );

    expect(res1.directResponse?.pointsAwarded).toBe(1000);
    expect(res2.directResponse?.pointsAwarded).toBe(950);
    expect(res2.newState.playerScores.get(player1.id)).toBe(1000);
    expect(res2.newState.playerScores.get(player2.id)).toBe(950);

    const finalResults = quizGame.getFinalResults(res2.newState, [player1, player2]);
    expect(finalResults[0].playerId).toBe(player1.id);
    expect(finalResults[0].score).toBe(1000);
    expect(finalResults[0].correctAnswers).toBe(1);
    expect(finalResults[1].playerId).toBe(player2.id);
    expect(finalResults[1].score).toBe(950);
    expect(finalResults[1].correctAnswers).toBe(1);
  });

  it('should transition directly to GAME_OVER and emit quizEnded when all players answer the last question', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    // Config has 2 questions: quest-1 (idx 0), quest-2 (idx 1). Move to quest-2 (last question)
    state.currentQuestionIndex = 1;
    state.status = 'QUESTION_ACTIVE';

    const player1: Player = {
      id: 'p1',
      name: 'Alice',
      socketId: 's1',
      isHost: false,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      players: [player1],
      sender: player1,
    };

    const res = quizGame.onAction(
      state,
      {
        type: 'SUBMIT_ANSWER',
        payload: { questionId: 'quest-2', alternativeId: 'alt-3' },
        senderId: player1.id,
        isHost: false,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(res.newState.status).toBe('GAME_OVER');
    expect(res.events?.some((e) => e.event === 'quizEnded')).toBe(true);
    expect(quizGame.isFinished(res.newState)).toBe(true);
  });

  it('should transition directly to GAME_OVER when host skips/ends the last question while active', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    state.currentQuestionIndex = 1; // Last question
    state.status = 'QUESTION_ACTIVE';

    const hostPlayer: Player = {
      id: 'host-1',
      name: 'Professor',
      socketId: 'host-s1',
      isHost: true,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const actionContext: ActionContext = {
      ...mockContext,
      players: [hostPlayer],
      sender: hostPlayer,
    };

    const res = quizGame.onAction(
      state,
      {
        type: 'NEXT_QUESTION',
        payload: {},
        senderId: hostPlayer.id,
        isHost: true,
        timestamp: new Date(),
      },
      actionContext,
    );

    expect(res.newState.status).toBe('GAME_OVER');
    expect(res.events?.some((e) => e.event === 'quizEnded')).toBe(true);
    expect(quizGame.isFinished(res.newState)).toBe(true);
  });
});
