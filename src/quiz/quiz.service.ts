import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QuizRepository } from './quiz.repository';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuizDto,
  UpdateQuizDto,
  CreateQuestionDto,
  UpdateQuestionDto,
  CreateAlternativeDto,
  UpdateAlternativeDto,
} from './dtos';

type CreateQuizInput = CreateQuizDto & { createdBy: string };

@Injectable()
export class QuizService {
  constructor(
    private readonly repo: QuizRepository,
    private readonly prisma: PrismaService,
  ) {}

  async createQuiz(data: CreateQuizInput) {
    return this.repo.quiz.create({
      data: {
        title: data.title,
        description: data.description,
        createdBy: data.createdBy,
        questions: data.questions
          ? {
              create: data.questions.map((q, index) => ({
                text: q.text,
                order: index,
                alternatives: {
                  create: q.alternatives,
                },
              })),
            }
          : undefined,
      },
      include: {
        questions: {
          include: { alternatives: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  async findAllQuizzes(userId: string) {
    return this.repo.quiz.findMany({
      where: { createdBy: userId },
      include: {
        questions: {
          include: { alternatives: true },
          orderBy: { order: 'asc' },
        },
      },
    });
  }

  /**
   * Busca um quiz garantindo que ele pertence ao usuário informado.
   * Usado pelas rotas HTTP; o motor do jogo usa `findQuizById` (sem filtro).
   */
  async findQuizByIdForUser(id: string, userId: string) {
    const quiz = await this.findQuizById(id);
    this.assertOwnership(quiz.createdBy, userId);
    return quiz;
  }

  async findQuizById(id: string) {
    const quiz = await this.repo.quiz.findUnique({
      where: { id },
      include: {
        questions: {
          include: { alternatives: true },
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz não encontrado');
    }

    return quiz;
  }

  async updateQuiz(id: string, data: UpdateQuizDto, userId: string) {
    const quiz = await this.repo.quiz.findUnique({
      where: { id },
      select: { createdBy: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz não encontrado');
    }

    if (quiz.createdBy !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para editar este quiz',
      );
    }

    return this.repo.quiz.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
      },
    });
  }

  async deleteQuiz(id: string, userId: string) {
    const quiz = await this.repo.quiz.findUnique({
      where: { id },
      select: { createdBy: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz não encontrado');
    }

    if (quiz.createdBy !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para deletar este quiz',
      );
    }

    await this.prisma.quiz.delete({
      where: { id },
    });
  }

  async addQuestion(quizId: string, data: CreateQuestionDto, userId: string) {
    await this.assertQuizOwnership(quizId, userId);

    const lastQuestion = await this.repo.question.findFirst({
      where: { quizId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const nextOrder = lastQuestion ? lastQuestion.order + 1 : 0;

    return this.repo.question.create({
      data: {
        text: data.text,
        order: nextOrder,
        quizId,
        alternatives: data.alternatives
          ? { create: data.alternatives }
          : undefined,
      },
      include: { alternatives: true },
    });
  }

  async updateQuestion(
    questionId: string,
    data: UpdateQuestionDto,
    userId: string,
  ) {
    await this.assertQuestionOwnership(questionId, userId);

    if (!data.alternatives) {
      return this.repo.question.update({
        where: { id: questionId },
        data: { text: data.text },
      });
    }

    const alternatives = data.alternatives;
    const existing = await this.repo.alternative.findMany({
      where: { questionId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((alt) => alt.id));
    const payloadIds = alternatives.map((alt) => alt.id);

    if (
      payloadIds.length !== existingIds.size ||
      new Set(payloadIds).size !== payloadIds.length ||
      payloadIds.some((id) => !existingIds.has(id))
    ) {
      throw new BadRequestException(
        'As alternativas informadas não pertencem a esta pergunta.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: { text: data.text },
      });

      for (const alt of alternatives) {
        await tx.alternative.update({
          where: { id: alt.id },
          data: { text: alt.text, isCorrect: alt.isCorrect },
        });
      }

      return tx.question.findUnique({
        where: { id: questionId },
        include: { alternatives: true },
      });
    });
  }

  async deleteQuestion(questionId: string, userId: string) {
    await this.assertQuestionOwnership(questionId, userId);

    return this.repo.question.delete({ where: { id: questionId } });
  }

  async addAlternative(
    questionId: string,
    data: CreateAlternativeDto,
    userId: string,
  ) {
    await this.assertQuestionOwnership(questionId, userId);

    return this.repo.alternative.create({
      data: {
        text: data.text,
        isCorrect: data.isCorrect,
        questionId,
      },
    });
  }

  async updateAlternative(
    alternativeId: string,
    data: UpdateAlternativeDto,
    userId: string,
  ) {
    await this.assertAlternativeOwnership(alternativeId, userId);

    return this.repo.alternative.update({
      where: { id: alternativeId },
      data: {
        text: data.text,
        isCorrect: data.isCorrect,
      },
    });
  }

  async deleteAlternative(alternativeId: string, userId: string) {
    await this.assertAlternativeOwnership(alternativeId, userId);

    return this.repo.alternative.delete({ where: { id: alternativeId } });
  }

  async getAlternativesByQuestion(questionId: string, userId?: string) {
    if (userId) {
      await this.assertQuestionOwnership(questionId, userId);
    }
    return this.repo.alternative.findMany({ where: { questionId } });
  }

  async getAlternativeById(alternativeId: string, userId?: string) {
    const alternative = await this.repo.alternative.findUnique({
      where: { id: alternativeId },
    });

    if (!alternative) {
      throw new NotFoundException('Alternativa não encontrada');
    }

    if (userId) {
      await this.assertQuestionOwnership(alternative.questionId, userId);
    }

    return alternative;
  }

  private assertOwnership(createdBy: string, userId: string): void {
    if (createdBy !== userId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este quiz',
      );
    }
  }

  private async assertQuizOwnership(
    quizId: string,
    userId: string,
  ): Promise<void> {
    const quiz = await this.repo.quiz.findUnique({
      where: { id: quizId },
      select: { createdBy: true },
    });

    if (!quiz) {
      throw new NotFoundException('Quiz não encontrado');
    }

    this.assertOwnership(quiz.createdBy, userId);
  }

  private async assertQuestionOwnership(
    questionId: string,
    userId: string,
  ): Promise<void> {
    const question = await this.repo.question.findUnique({
      where: { id: questionId },
      select: { quiz: { select: { createdBy: true } } },
    });

    if (!question) {
      throw new NotFoundException('Pergunta não encontrada');
    }

    this.assertOwnership(question.quiz.createdBy, userId);
  }

  private async assertAlternativeOwnership(
    alternativeId: string,
    userId: string,
  ): Promise<void> {
    const alternative = await this.repo.alternative.findUnique({
      where: { id: alternativeId },
      select: {
        question: { select: { quiz: { select: { createdBy: true } } } },
      },
    });

    if (!alternative) {
      throw new NotFoundException('Alternativa não encontrada');
    }

    this.assertOwnership(alternative.question.quiz.createdBy, userId);
  }
}
