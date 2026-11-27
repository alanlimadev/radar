import { QuizGameDefinition, QuizConfig } from './quiz-game.definition';
import {
  GameContext,
  ActionContext,
} from '../core/interfaces/game-definition.interface';
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
        timeLimitSeconds: 20,
        alternatives: [
          { id: 'alt-1', text: 'Brasília', isCorrect: true },
          { id: 'alt-2', text: 'Rio de Janeiro', isCorrect: false },
        ],
      },
      {
        id: 'quest-2',
        text: 'Quanto é 2 + 2?',
        order: 1,
        timeLimitSeconds: 45,
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
        createdBy: 'host-1',
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
    const state = await gameWithService.init(
      { quizId: 'quiz-db-1' },
      mockContext,
    );

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

  it('should throw ForbiddenException when host tries to start another host quiz', async () => {
    const mockQuizService = {
      findQuizById: jest.fn().mockResolvedValue({
        id: 'quiz-other',
        title: 'Quiz de outro professor',
        createdBy: 'host-2',
        questions: [
          {
            id: 'q1',
            text: 'Pergunta',
            order: 0,
            alternatives: [{ id: 'a1', text: 'A', isCorrect: true }],
          },
        ],
      }),
    };

    const gameWithService = new QuizGameDefinition(mockQuizService as any);
    await expect(
      gameWithService.init({ quizId: 'quiz-other' }, mockContext),
    ).rejects.toThrow(
      'Você não tem permissão para iniciar uma sala com este quiz',
    );
  });

  it('should throw BadRequestException if quiz has no questions', async () => {
    const mockQuizService = {
      findQuizById: jest.fn().mockResolvedValue({
        id: 'quiz-empty',
        title: 'Vazio',
        createdBy: 'host-1',
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
    expect(result.events).toBeUndefined();

    const clientState = quizGame.getClientState(
      result.newState,
      undefined,
      true,
    );
    expect(clientState.currentQuestion.id).toBe('quest-1');
    expect(clientState.totalQuestions).toBe(2);
  });

  it('should expose the configured time limit for the current question in the client state', async () => {
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

    quizGame.onAction(
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

    expect(
      quizGame.getClientState(state, undefined, true).currentQuestion
        .timeLimitSeconds,
    ).toBe(20);

    state.status = 'QUESTION_LEADERBOARD';

    quizGame.onAction(
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

    expect(
      quizGame.getClientState(state, undefined, true).currentQuestion
        .timeLimitSeconds,
    ).toBe(45);
  });

  it('should not expose questions before the game starts', async () => {
    const state = await quizGame.init(mockConfig, mockContext);

    const clientState = quizGame.getClientState(state, undefined, true);

    expect(clientState.currentQuestion).toBeNull();
    expect(clientState.totalQuestions).toBe(2);
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
    expect(result.events).toBeUndefined();

    const clientState = quizGame.getClientState(result.newState, player, false);
    expect(clientState.isLeaderboard).toBe(true);
    expect(clientState.correctAlternativeId).toBe('alt-1');
    expect(clientState.myAnswer).toEqual({
      questionId: 'quest-1',
      alternativeId: 'alt-1',
      isCorrect: true,
      pointsAwarded: 1000,
    });
    expect(clientState.scores[0]).toMatchObject({
      playerId: player.id,
      score: 1000,
      correctAnswers: 1,
    });
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
    expect(step1.events).toBeUndefined();

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
    expect(step2.events).toBeUndefined();
    expect(
      quizGame.getClientState(step2.newState, undefined, true).currentQuestion
        .id,
    ).toBe('quest-2');
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
    expect(
      activeState.currentQuestion.alternatives[0].isCorrect,
    ).toBeUndefined();
    expect(activeState.isLeaderboard).toBe(false);

    state.status = 'QUESTION_LEADERBOARD';
    const leaderboardState = quizGame.getClientState(state, player, false);
    expect(leaderboardState.currentQuestion.alternatives[0].isCorrect).toBe(
      true,
    );
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

    const finalResults = quizGame.getFinalResults(res2.newState, [
      player1,
      player2,
    ]);
    expect(finalResults[0].playerId).toBe(player1.id);
    expect(finalResults[0].score).toBe(1000);
    expect(finalResults[0].correctAnswers).toBe(1);
    expect(finalResults[1].playerId).toBe(player2.id);
    expect(finalResults[1].score).toBe(950);
    expect(finalResults[1].correctAnswers).toBe(1);
  });

  it('should transition directly to GAME_OVER when all players answer the last question', async () => {
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
    expect(res.events).toBeUndefined();
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
    expect(res.events).toBeUndefined();
    expect(quizGame.isFinished(res.newState)).toBe(true);
  });

  it('should finish the game through a universal host action', async () => {
    const state = await quizGame.init(mockConfig, mockContext);
    const hostPlayer: Player = {
      id: 'host-1',
      name: 'Professor',
      socketId: 'host-s1',
      isHost: true,
      connected: true,
      joinedAt: new Date(),
      metadata: {},
    };

    const result = quizGame.onAction(
      state,
      {
        type: 'FINISH_GAME',
        payload: {},
        senderId: hostPlayer.id,
        isHost: true,
        timestamp: new Date(),
      },
      { ...mockContext, sender: hostPlayer },
    );

    expect(result.newState.status).toBe('GAME_OVER');
    expect(result.events).toBeUndefined();
    expect(quizGame.isFinished(result.newState)).toBe(true);
  });

  describe('getResultsReport', () => {
    const context = {
      roomId: 'room-1',
      roomCode: '123456',
      hostId: 'host-1',
      createdAt: new Date('2026-10-29T18:01:40.000Z'),
      gameStartedAt: new Date('2026-10-29T18:02:11.000Z'),
      endedAt: new Date('2026-10-29T18:11:43.000Z'),
    };

    const makePlayer = (
      id: string,
      name: string,
      connected = true,
    ): Player => ({
      id,
      name,
      socketId: `sock-${id}`,
      isHost: false,
      connected,
      joinedAt: new Date(),
      score: 0,
      metadata: {},
    });

    it('should build an empty report when nobody joined', async () => {
      const state = await quizGame.init(mockConfig, mockContext);
      const report = quizGame.getResultsReport(state, [], context);

      expect(report.schemaVersion).toBe(1);
      expect(report.totals.players).toBe(0);
      expect(report.totals.questions).toBe(2);
      expect(report.totals.accuracy).toBe(0);
      expect(report.players).toHaveLength(0);
      expect(report.questions[0].unanswered).toBe(0);
    });

    it('should count unanswered questions and keep alternative percentages at 0', async () => {
      const state = await quizGame.init(mockConfig, mockContext);
      const player = makePlayer('p1', 'Ana');
      state.playerNames.set(player.id, player.name);
      state.playerScores.set(player.id, 0);
      state.playerCorrectAnswers.set(player.id, 0);

      const report = quizGame.getResultsReport(state, [player], context);

      expect(report.totals.players).toBe(1);
      expect(report.totals.unanswered).toBe(2);
      expect(report.questions[0].answered).toBe(0);
      expect(
        report.questions[0].alternatives.every(
          (alternative: any) => alternative.percentage === 0,
        ),
      ).toBe(true);
    });

    it('should compute per-question distribution and percentages summing to 1', async () => {
      const state = await quizGame.init(mockConfig, mockContext);
      const players = [
        makePlayer('p1', 'Ana'),
        makePlayer('p2', 'Bob'),
        makePlayer('p3', 'Caio'),
        makePlayer('p4', 'Duda'),
      ];

      for (const player of players) {
        state.playerNames.set(player.id, player.name);
        state.playerScores.set(player.id, 0);
        state.playerCorrectAnswers.set(player.id, 0);
      }

      state.answers.set('quest-1', [
        {
          playerId: 'p1',
          questionId: 'quest-1',
          alternativeId: 'alt-1',
          isCorrect: true,
          pointsAwarded: 1000,
          answeredAt: new Date('2026-10-29T18:02:31.000Z'),
        },
        {
          playerId: 'p2',
          questionId: 'quest-1',
          alternativeId: 'alt-1',
          isCorrect: true,
          pointsAwarded: 950,
          answeredAt: new Date('2026-10-29T18:02:32.000Z'),
        },
        {
          playerId: 'p3',
          questionId: 'quest-1',
          alternativeId: 'alt-2',
          isCorrect: false,
          pointsAwarded: 0,
          answeredAt: new Date('2026-10-29T18:02:33.000Z'),
        },
      ]);

      const report = quizGame.getResultsReport(state, players, context);
      const question = report.questions[0];

      expect(question.answered).toBe(3);
      expect(question.correct).toBe(2);
      expect(question.incorrect).toBe(1);
      expect(question.unanswered).toBe(1);
      expect(question.accuracy).toBeCloseTo(2 / 3);
      expect(
        question.alternatives.reduce(
          (sum: number, alternative: any) => sum + alternative.percentage,
          0,
        ),
      ).toBeCloseTo(1);
      expect(report.totals.answers).toBe(3);
    });

    it('should mark players that left early and compute session duration', async () => {
      const state = await quizGame.init(mockConfig, mockContext);
      const player = makePlayer('p1', 'Ana', false);
      state.playerNames.set(player.id, player.name);
      state.playerScores.set(player.id, 500);
      state.playerCorrectAnswers.set(player.id, 1);

      const report = quizGame.getResultsReport(state, [player], context);

      expect(report.players[0].leftEarly).toBe(true);
      expect(report.players[0].rank).toBe(1);
      expect(report.session.durationMs).toBe(572000);
      expect(report.session.code).toBe('123456');
    });
  });
});
