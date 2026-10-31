import {
  Injectable,
  Optional,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  IGameDefinition,
  GameContext,
  ActionContext,
  ResultsReportContext,
} from '../core/interfaces/game-definition.interface';
import {
  GameAction,
  ActionResult,
} from '../core/interfaces/game-action.interface';
import { Player } from '../core/interfaces/player.interface';
import { QuizService } from './quiz.service';

export interface QuizQuestion {
  id: string;
  text: string;
  order: number;
  alternatives: Array<{
    id: string;
    text: string;
    isCorrect: boolean;
  }>;
}

export interface QuizConfig {
  quizId?: string;
  title?: string;
  questions?: QuizQuestion[];
}

export interface PlayerAnswerRecord {
  playerId: string;
  questionId: string;
  alternativeId: string;
  isCorrect: boolean;
  answeredAt: Date;
}

export interface QuizState {
  quizId?: string;
  title?: string;
  questions: QuizQuestion[];
  currentQuestionIndex: number;
  answers: Map<string, PlayerAnswerRecord[]>; // questionId -> list of answers
  playerScores: Map<string, number>; // playerId -> score
  playerCorrectAnswers: Map<string, number>; // playerId -> correct answers count
  playerNames: Map<string, string>; // playerId -> player name
  status: 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_LEADERBOARD' | 'GAME_OVER';
}

@Injectable()
export class QuizGameDefinition
  implements IGameDefinition<QuizState, QuizConfig>
{
  readonly gameType = 'quiz';
  readonly name = 'Quiz Educacional';
  readonly description =
    'Quiz interativo de perguntas e respostas com ranking em tempo real';
  readonly version = '1.0.0';
  readonly minPlayers = 1;
  readonly maxPlayers = 200;

  constructor(
    @Optional()
    private readonly quizService?: QuizService,
  ) {}

  async init(config: QuizConfig, context: GameContext): Promise<QuizState> {
    let questions = config.questions;
    let title = config.title;

    if ((!questions || questions.length === 0) && config.quizId) {
      if (!this.quizService) {
        throw new Error(
          'QuizService não disponível para carregar perguntas do quiz',
        );
      }

      const quiz = await this.quizService.findQuizById(config.quizId);
      if (!quiz) {
        throw new NotFoundException(`Quiz "${config.quizId}" não encontrado`);
      }

      // Garante que o host só inicie salas com quizzes que ele mesmo criou.
      // A regra fica no módulo quiz para manter o core agnóstico.
      if (quiz.createdBy !== context.hostId) {
        throw new ForbiddenException(
          'Você não tem permissão para iniciar uma sala com este quiz',
        );
      }

      if (!quiz.questions || quiz.questions.length === 0) {
        throw new BadRequestException(
          'O quiz selecionado não possui perguntas configuradas',
        );
      }

      title = quiz.title;
      questions = quiz.questions.map((q) => ({
        id: q.id,
        text: q.text,
        order: q.order,
        alternatives: q.alternatives.map((a) => ({
          id: a.id,
          text: a.text,
          isCorrect: a.isCorrect,
        })),
      }));
    }

    return {
      quizId: config.quizId,
      title: title || 'Quiz',
      questions: questions || [],
      currentQuestionIndex: 0,
      answers: new Map(),
      playerScores: new Map(),
      playerCorrectAnswers: new Map(),
      playerNames: new Map(),
      status: 'LOBBY',
    };
  }

  onPlayerJoin(
    state: QuizState,
    player: Player,
    _context: GameContext,
  ): ActionResult<QuizState> {
    if (!state.playerScores.has(player.id)) {
      state.playerScores.set(player.id, 0);
    }
    if (!state.playerNames) {
      state.playerNames = new Map<string, string>();
    }
    if (player.name) {
      state.playerNames.set(player.id, player.name);
    }
    return { newState: state };
  }

  onAction(
    state: QuizState,
    action: GameAction,
    context: ActionContext,
  ): ActionResult<QuizState> {
    const { type, payload, senderId, isHost } = action;

    switch (type.toUpperCase()) {
      case 'START_GAME':
      case 'START_QUIZ': {
        if (!isHost) {
          throw new Error('Apenas o host pode iniciar o quiz');
        }
        if (!state.questions || state.questions.length === 0) {
          throw new Error('O quiz não possui perguntas configuradas');
        }

        state.status = 'QUESTION_ACTIVE';
        state.currentQuestionIndex = 0;

        const currentQ = state.questions[0];

        return {
          newState: state,
          events: [
            {
              event: 'quizStarted',
              payload: {
                question: {
                  id: currentQ.id,
                  text: currentQ.text,
                  alternatives: currentQ.alternatives.map((a) => ({
                    id: a.id,
                    text: a.text,
                  })),
                },
                currentQuestionIndex: 0,
                totalQuestions: state.questions.length,
              },
            },
          ],
        };
      }

      case 'SUBMIT_ANSWER': {
        if (isHost) {
          throw new Error('Apenas jogadores podem enviar respostas');
        }

        const currentQ = state.questions[state.currentQuestionIndex];
        if (!currentQ) {
          throw new Error('Nenhuma pergunta ativa no momento');
        }

        const { questionId, alternativeId } = payload;
        const targetQuestion =
          state.questions.find((q) => q.id === questionId) || currentQ;
        const chosenAlt = targetQuestion.alternatives.find(
          (a) => a.id === alternativeId,
        );

        if (!chosenAlt) {
          throw new Error('Alternativa inválida');
        }

        const isCorrect = Boolean(chosenAlt.isCorrect);

        // Registra resposta
        const qAnswers = state.answers.get(targetQuestion.id) || [];
        // Impede responder duas vezes a mesma pergunta
        const existingAns = qAnswers.find((a) => a.playerId === senderId);
        let pointsAwarded = 0;

        if (!existingAns) {
          if (isCorrect) {
            // Ordem de acertos para esta pergunta: quem responde primeiro ganha mais pontos
            const priorCorrectCount = qAnswers.filter(
              (a) => a.isCorrect,
            ).length;
            // 1º acerto ganha 1000, 2º 950, 3º 900... piso de 100 pontos
            pointsAwarded = Math.max(100, 1000 - priorCorrectCount * 50);
          }

          qAnswers.push({
            playerId: senderId,
            questionId: targetQuestion.id,
            alternativeId,
            isCorrect,
            answeredAt: new Date(),
          });
          state.answers.set(targetQuestion.id, qAnswers);

          // Atualiza pontuação e acertos se estiver correta
          if (isCorrect) {
            const currentScore = state.playerScores.get(senderId) || 0;
            const currentCorrect =
              state.playerCorrectAnswers?.get(senderId) || 0;
            const newScore = currentScore + pointsAwarded;

            state.playerScores.set(senderId, newScore);
            state.playerCorrectAnswers?.set(senderId, currentCorrect + 1);

            // Atualiza também no player model do contexto
            const p = context.players.find((item) => item.id === senderId);
            if (p) {
              p.score = newScore;
            }
          }
        }

        const events: any[] = [];
        const activePlayers = context.players.filter((p) => !p.isHost);
        const allAnswered =
          activePlayers.length > 0 && qAnswers.length >= activePlayers.length;

        // Se todos os jogadores ativos responderam:
        // Se for a última pergunta, finaliza direto para GAME_OVER (ranking final / pódio)
        // Caso contrário, transiciona para QUESTION_LEADERBOARD
        if (allAnswered) {
          const isLastQuestion =
            state.currentQuestionIndex >= state.questions.length - 1;
          const scores = this.getFinalResults(state, context.players);
          const correctAlt = targetQuestion.alternatives.find(
            (a) => a.isCorrect,
          );

          events.push({
            event: 'scoresUpdate',
            payload: { scores },
          });

          events.push({
            event: 'questionEnded',
            payload: {
              questionId: targetQuestion.id,
              correctAlternativeId: correctAlt?.id,
              scores,
              currentQuestionIndex: state.currentQuestionIndex,
              totalQuestions: state.questions.length,
              totalAnswers: qAnswers.length,
              totalPlayers: activePlayers.length,
            },
          });

          if (isLastQuestion) {
            state.status = 'GAME_OVER';
            events.push({
              event: 'quizEnded',
              payload: { scores },
            });
          } else {
            state.status = 'QUESTION_LEADERBOARD';
          }
        }

        return {
          newState: state,
          events: events.length > 0 ? events : undefined,
          directResponse: {
            success: true,
            isCorrect,
            pointsAwarded: isCorrect ? pointsAwarded : 0,
          },
        };
      }

      case 'NEXT_QUESTION': {
        if (!isHost) {
          throw new Error('Apenas o host pode avançar as perguntas');
        }

        const currentQ = state.questions[state.currentQuestionIndex];
        const activePlayers = context.players.filter((p) => !p.isHost);
        const qAnswers = currentQ ? state.answers.get(currentQ.id) || [] : [];

        // Se a pergunta ainda está ativa, o host está encerrando a pergunta
        if (state.status === 'QUESTION_ACTIVE') {
          const isLastQuestion =
            state.currentQuestionIndex >= state.questions.length - 1;
          const scores = this.getFinalResults(state, context.players);
          const correctAlt = currentQ?.alternatives.find((a) => a.isCorrect);

          if (isLastQuestion) {
            state.status = 'GAME_OVER';
            return {
              newState: state,
              events: [
                {
                  event: 'scoresUpdate',
                  payload: { scores },
                },
                {
                  event: 'questionEnded',
                  payload: {
                    questionId: currentQ?.id,
                    correctAlternativeId: correctAlt?.id,
                    scores,
                    currentQuestionIndex: state.currentQuestionIndex,
                    totalQuestions: state.questions.length,
                    totalAnswers: qAnswers.length,
                    totalPlayers: activePlayers.length,
                  },
                },
                {
                  event: 'quizEnded',
                  payload: { scores },
                },
              ],
            };
          }

          state.status = 'QUESTION_LEADERBOARD';

          return {
            newState: state,
            events: [
              {
                event: 'scoresUpdate',
                payload: { scores },
              },
              {
                event: 'questionEnded',
                payload: {
                  questionId: currentQ?.id,
                  correctAlternativeId: correctAlt?.id,
                  scores,
                  currentQuestionIndex: state.currentQuestionIndex,
                  totalQuestions: state.questions.length,
                  totalAnswers: qAnswers.length,
                  totalPlayers: activePlayers.length,
                },
              },
            ],
          };
        }

        // Se já está no Leaderboard, avança para a próxima pergunta ou encerra o quiz
        if (state.currentQuestionIndex < state.questions.length - 1) {
          state.currentQuestionIndex += 1;
          state.status = 'QUESTION_ACTIVE';

          const nextQ = state.questions[state.currentQuestionIndex];

          return {
            newState: state,
            events: [
              {
                event: 'nextQuestion',
                payload: {
                  question: {
                    id: nextQ.id,
                    text: nextQ.text,
                    alternatives: nextQ.alternatives.map((a) => ({
                      id: a.id,
                      text: a.text,
                    })),
                  },
                  currentQuestionIndex: state.currentQuestionIndex,
                  totalQuestions: state.questions.length,
                },
              },
            ],
          };
        } else {
          // Última pergunta -> Finaliza o jogo
          state.status = 'GAME_OVER';
          const finalScores = this.getFinalResults(state, context.players);

          return {
            newState: state,
            events: [
              {
                event: 'quizEnded',
                payload: { scores: finalScores },
              },
            ],
          };
        }
      }

      case 'GET_SCORES': {
        const scores = this.getFinalResults(state, context.players);
        return {
          newState: state,
          directResponse: scores,
          events: [
            {
              event: 'scoresUpdate',
              payload: { scores },
            },
          ],
        };
      }

      default:
        throw new Error(`Ação não reconhecida no Quiz: "${type}"`);
    }
  }

  getClientState(state: QuizState, forPlayer?: Player, isHost?: boolean): any {
    const currentQ = state.questions[state.currentQuestionIndex];
    const isLeaderboardOrOver =
      state.status === 'QUESTION_LEADERBOARD' || state.status === 'GAME_OVER';

    const sanitizedQuestion = currentQ
      ? {
          id: currentQ.id,
          text: currentQ.text,
          order: currentQ.order,
          alternatives: currentQ.alternatives.map((alt) => ({
            id: alt.id,
            text: alt.text,
            // Revela isCorrect para o Host OU quando a rodada encerrou (Leaderboard / Game Over)
            isCorrect:
              isHost || isLeaderboardOrOver ? alt.isCorrect : undefined,
          })),
        }
      : null;

    const qAnswers = currentQ ? state.answers.get(currentQ.id) || [] : [];

    return {
      title: state.title,
      status: state.status,
      isLeaderboard: state.status === 'QUESTION_LEADERBOARD',
      currentQuestionIndex: state.currentQuestionIndex,
      totalQuestions: state.questions.length,
      currentQuestion: sanitizedQuestion,
      totalAnswers: qAnswers.length,
      isFinished: state.status === 'GAME_OVER',
      myScore: forPlayer
        ? state.playerScores.get(forPlayer.id) || 0
        : undefined,
    };
  }

  isFinished(state: QuizState): boolean {
    return state.status === 'GAME_OVER';
  }

  getFinalResults(state: QuizState, playersList?: Player[]): any[] {
    const results: Array<{
      id: string;
      playerId: string;
      name: string;
      playerName: string;
      score: number;
      correctAnswers: number;
    }> = [];

    const playerMap = new Map<string, Player>();
    if (playersList && playersList.length > 0) {
      for (const p of playersList) {
        if (!p.isHost) {
          playerMap.set(p.id, p);
        }
      }
    }

    // Processa pontuações registradas
    for (const [playerId, score] of state.playerScores.entries()) {
      const p = playerMap.get(playerId);
      const name = p?.name || state.playerNames?.get(playerId) || 'Jogador';
      const correctAnswers = state.playerCorrectAnswers?.get(playerId) || 0;
      results.push({
        id: playerId,
        playerId,
        name,
        playerName: name,
        score,
        correctAnswers,
      });
    }

    // Inclui jogadores conectados que possam ter ficado com 0 pontos e não estavam no map
    if (playersList && playersList.length > 0) {
      for (const p of playersList) {
        if (p.isHost) continue;
        if (!state.playerScores.has(p.id)) {
          results.push({
            id: p.id,
            playerId: p.id,
            name: p.name,
            playerName: p.name,
            score: 0,
            correctAnswers: 0,
          });
        }
      }
    }

    return results.sort(
      (a, b) => b.score - a.score || a.name.localeCompare(b.name),
    );
  }

  /**
   * Monta o snapshot imutável da sessão (schemaVersion 1).
   * O core persiste este objeto em `game_rooms.results` sem conhecer o quiz.
   */
  getResultsReport(
    state: QuizState,
    playersList: Player[] = [],
    context?: ResultsReportContext,
  ): any {
    const questions = state.questions ?? [];

    // Participantes: todo jogador que entrou na sala. O mapa de players é a
    // fonte da verdade; os mapas do estado cobrem chamadas sem lista.
    const participantMap = new Map<
      string,
      { id: string; name: string; score: number; correct: number; connected: boolean }
    >();

    for (const [playerId, name] of state.playerNames?.entries() ?? []) {
      participantMap.set(playerId, {
        id: playerId,
        name,
        score: state.playerScores.get(playerId) ?? 0,
        correct: state.playerCorrectAnswers?.get(playerId) ?? 0,
        connected: true,
      });
    }

    for (const [playerId, score] of state.playerScores.entries()) {
      const current = participantMap.get(playerId);
      participantMap.set(playerId, {
        id: playerId,
        name: current?.name || state.playerNames?.get(playerId) || 'Jogador',
        score,
        correct: state.playerCorrectAnswers?.get(playerId) ?? 0,
        connected: current?.connected ?? true,
      });
    }

    for (const player of playersList) {
      if (player.isHost) continue;
      const current = participantMap.get(player.id);
      participantMap.set(player.id, {
        id: player.id,
        name: player.name || current?.name || 'Jogador',
        score: state.playerScores.get(player.id) ?? current?.score ?? 0,
        correct:
          state.playerCorrectAnswers?.get(player.id) ?? current?.correct ?? 0,
        connected: player.connected,
      });
    }

    const participants = Array.from(participantMap.values());
    const playerCount = participants.length;

    // Respostas por pergunta
    const reportQuestions = questions.map((question, order) => {
      const answers = state.answers.get(question.id) ?? [];
      const answered = answers.length;
      const correct = answers.filter((answer) => answer.isCorrect).length;
      const incorrect = answered - correct;
      const unanswered = Math.max(0, playerCount - answered);
      const correctAlternative = question.alternatives.find(
        (alternative) => alternative.isCorrect,
      );

      return {
        id: question.id,
        order,
        text: question.text,
        correctAlternativeId: correctAlternative?.id ?? null,
        correctAlternativeText: correctAlternative?.text ?? null,
        answered,
        correct,
        incorrect,
        unanswered,
        accuracy: answered > 0 ? correct / answered : 0,
        alternatives: question.alternatives.map((alternative) => {
          const selected = answers.filter(
            (answer) => answer.alternativeId === alternative.id,
          ).length;
          return {
            id: alternative.id,
            text: alternative.text,
            isCorrect: Boolean(alternative.isCorrect),
            selected,
            percentage: answered > 0 ? selected / answered : 0,
          };
        }),
      };
    });

    const answersByPlayer = new Map<
      string,
      Array<{
        questionId: string;
        alternativeId: string;
        isCorrect: boolean;
        answeredAt: string;
      }>
    >();

    for (const question of questions) {
      for (const answer of state.answers.get(question.id) ?? []) {
        const list = answersByPlayer.get(answer.playerId) ?? [];
        list.push({
          questionId: answer.questionId,
          alternativeId: answer.alternativeId,
          isCorrect: Boolean(answer.isCorrect),
          answeredAt: new Date(answer.answeredAt).toISOString(),
        });
        answersByPlayer.set(answer.playerId, list);
      }
    }

    const ranked = participants
      .slice()
      .sort(
        (a, b) => b.score - a.score || a.name.localeCompare(b.name),
      );

    const reportPlayers = ranked.map((player, index) => {
      const answers = answersByPlayer.get(player.id) ?? [];
      const answered = answers.length;
      const correct = answers.filter((answer) => answer.isCorrect).length;
      const incorrect = answered - correct;
      const unanswered = Math.max(0, questions.length - answered);

      return {
        id: player.id,
        name: player.name,
        rank: index + 1,
        score: player.score,
        correct,
        incorrect,
        unanswered,
        accuracy: questions.length > 0 ? correct / questions.length : 0,
        leftEarly: player.connected === false,
        answers,
      };
    });

    const totalAnswers = reportQuestions.reduce(
      (sum, question) => sum + question.answered,
      0,
    );
    const totalCorrect = reportQuestions.reduce(
      (sum, question) => sum + question.correct,
      0,
    );
    const totalIncorrect = reportQuestions.reduce(
      (sum, question) => sum + question.incorrect,
      0,
    );
    const totalUnanswered = reportQuestions.reduce(
      (sum, question) => sum + question.unanswered,
      0,
    );
    const possibleAnswers = playerCount * questions.length;

    const createdAt = context?.createdAt ?? new Date();
    const gameStartedAt = context?.gameStartedAt;
    const endedAt = context?.endedAt ?? new Date();
    const durationBase = gameStartedAt ?? createdAt;
    const durationMs = Math.max(0, endedAt.getTime() - durationBase.getTime());

    return {
      schemaVersion: 1,
      session: {
        roomId: context?.roomId ?? '',
        code: context?.roomCode ?? '',
        quizId: state.quizId ?? null,
        quizTitle: state.title ?? 'Quiz',
        createdAt: createdAt.toISOString(),
        gameStartedAt: gameStartedAt ? gameStartedAt.toISOString() : null,
        endedAt: endedAt.toISOString(),
        durationMs,
      },
      totals: {
        players: playerCount,
        questions: questions.length,
        answers: totalAnswers,
        correct: totalCorrect,
        incorrect: totalIncorrect,
        unanswered: totalUnanswered,
        accuracy: possibleAnswers > 0 ? totalCorrect / possibleAnswers : 0,
        answerRate: possibleAnswers > 0 ? totalAnswers / possibleAnswers : 0,
      },
      questions: reportQuestions,
      players: reportPlayers,
    };
  }
}
