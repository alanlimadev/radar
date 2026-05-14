import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { QuizRepository } from './quiz.repository';
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
  constructor(private readonly repo: QuizRepository) {}

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

  async findAllQuizzes() {
    return this.repo.quiz.findMany({
      include: {
        questions: {
          include: { alternatives: true },
          orderBy: { order: 'asc' },
        },
      },
    });
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

    try {
      return await this.repo.quiz.delete({ where: { id } });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2003'
      ) {
        throw new ConflictException(
          'Quiz possui sessões vinculadas e não pode ser deletado.',
        );
      }
      throw e;
    }
  }

  async addQuestion(quizId: string, data: CreateQuestionDto) {
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

  async updateQuestion(questionId: string, data: UpdateQuestionDto) {
    return this.repo.question.update({
      where: { id: questionId },
      data: { text: data.text },
    });
  }

  async deleteQuestion(questionId: string) {
    return this.repo.question.delete({ where: { id: questionId } });
  }

  async addAlternative(questionId: string, data: CreateAlternativeDto) {
    return this.repo.alternative.create({
      data: {
        text: data.text,
        isCorrect: data.isCorrect,
        questionId,
      },
    });
  }

  async updateAlternative(alternativeId: string, data: UpdateAlternativeDto) {
    return this.repo.alternative.update({
      where: { id: alternativeId },
      data: {
        text: data.text,
        isCorrect: data.isCorrect,
      },
    });
  }

  async deleteAlternative(alternativeId: string) {
    return this.repo.alternative.delete({ where: { id: alternativeId } });
  }

  async getAlternativesByQuestion(questionId: string) {
    return this.repo.alternative.findMany({ where: { questionId } });
  }

  async getAlternativeById(alternativeId: string) {
    return this.repo.alternative.findUnique({ where: { id: alternativeId } });
  }
}
