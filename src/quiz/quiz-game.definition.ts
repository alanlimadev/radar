import { Injectable } from '@nestjs/common';
import {
  IGameDefinition,
  GameContext,
  ActionContext,
} from '../core/interfaces/game-definition.interface';
import { GameAction, ActionResult } from '../core/interfaces/game-action.interface';
import { Player } from '../core/interfaces/player.interface';

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
  playerScores: Map<string, number>;          // playerId -> score
  status: 'LOBBY' | 'QUESTION_ACTIVE' | 'QUESTION_LEADERBOARD' | 'GAME_OVER';
}

@Injectable()
export class QuizGameDefinition implements IGameDefinition<QuizState, QuizConfig> {
  readonly gameType = 'quiz';
  readonly name = 'Quiz Educacional';
  readonly description = 'Quiz interativo de perguntas e respostas com ranking em tempo real';
  readonly version = '1.0.0';
  readonly minPlayers = 1;
  readonly maxPlayers = 200;

  init(config: QuizConfig, _context: GameContext): QuizState {
    return {
      quizId: config.quizId,
      title: config.title || 'Quiz',
      questions: config.questions || [],
      currentQuestionIndex: 0,
      answers: new Map<string, PlayerAnswerRecord[]>(),
      playerScores: new Map<string, number>(),
      status: 'LOBBY',
    };
  }

  onPlayerJoin(state: QuizState, player: Player, _context: GameContext): ActionResult<QuizState> {
    if (!state.playerScores.has(player.id)) {
      state.playerScores.set(player.id, 0);
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
        const targetQuestion = state.questions.find((q) => q.id === questionId) || currentQ;
        const chosenAlt = targetQuestion.alternatives.find((a) => a.id === alternativeId);

        if (!chosenAlt) {
          throw new Error('Alternativa inválida');
        }

        const isCorrect = Boolean(chosenAlt.isCorrect);

        // Registra resposta
        const qAnswers = state.answers.get(targetQuestion.id) || [];
        // Impede responder duas vezes a mesma pergunta
        const existingAns = qAnswers.find((a) => a.playerId === senderId);
        if (!existingAns) {
          qAnswers.push({
            playerId: senderId,
            questionId: targetQuestion.id,
            alternativeId,
            isCorrect,
            answeredAt: new Date(),
          });
          state.answers.set(targetQuestion.id, qAnswers);

          // Atualiza pontuação se estiver correta
          if (isCorrect) {
            const currentScore = state.playerScores.get(senderId) || 0;
            state.playerScores.set(senderId, currentScore + 1);
            // Atualiza também no player model do contexto
            const p = context.players.find((item) => item.id === senderId);
            if (p) {
              p.score = currentScore + 1;
            }
          }
        }

        return {
          newState: state,
          directResponse: {
            success: true,
            isCorrect,
          },
        };
      }

      case 'NEXT_QUESTION': {
        if (!isHost) {
          throw new Error('Apenas o host pode avançar as perguntas');
        }

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

    const sanitizedQuestion = currentQ
      ? {
          id: currentQ.id,
          text: currentQ.text,
          order: currentQ.order,
          alternatives: currentQ.alternatives.map((alt) => ({
            id: alt.id,
            text: alt.text,
            // Revela isCorrect somente para o Host
            isCorrect: isHost ? alt.isCorrect : undefined,
          })),
        }
      : null;

    return {
      title: state.title,
      status: state.status,
      currentQuestionIndex: state.currentQuestionIndex,
      totalQuestions: state.questions.length,
      currentQuestion: sanitizedQuestion,
      isFinished: state.status === 'GAME_OVER',
      myScore: forPlayer ? state.playerScores.get(forPlayer.id) || 0 : undefined,
    };
  }

  isFinished(state: QuizState): boolean {
    return state.status === 'GAME_OVER';
  }

  getFinalResults(state: QuizState, playersList?: Player[]): any[] {
    const results: Array<{
      playerId: string;
      playerName: string;
      score: number;
      correctAnswers: number;
    }> = [];

    // Se temos a lista de players, usamos ela para preencher nomes
    if (playersList && playersList.length > 0) {
      for (const p of playersList) {
        if (p.isHost) continue;
        const score = state.playerScores.get(p.id) || 0;
        results.push({
          playerId: p.id,
          playerName: p.name,
          score,
          correctAnswers: score,
        });
      }
    } else {
      for (const [playerId, score] of state.playerScores.entries()) {
        results.push({
          playerId,
          playerName: 'Jogador',
          score,
          correctAnswers: score,
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }
}
