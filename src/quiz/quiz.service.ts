import { Injectable } from '@nestjs/common';
import { QuizRepository } from './quiz.repository';

@Injectable()
export class QuizService {
  constructor(private readonly repo: QuizRepository) {}

  async createQuiz(data: any) {
    return this.repo.quiz.create({
      data: {
        title: data.title,
        description: data.description,
        createdBy: data.createdBy,
        questions: data.questions
          ? {
              create: data.questions.map((q) => ({
                text: q.text,
                alternatives: {
                  create: q.alternatives,
                },
              })),
            }
          : undefined,
      },
      include: { questions: { include: { alternatives: true } } },
    });
  }

  async findAllQuizzes() {
    return this.repo.quiz.findMany({
      include: { questions: { include: { alternatives: true } } },
    });
  }

  async findQuizById(id: string) {
    return this.repo.quiz.findUnique({
      where: { id },
      include: { questions: { include: { alternatives: true } } },
    });
  }

  async updateQuiz(id: string, data: any) {
    return this.repo.quiz.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
      },
    });
  }

  async deleteQuiz(id: string) {
    return this.repo.quiz.delete({ where: { id } });
  }

  async addQuestion(quizId: string, data: any) {
    return this.repo.question.create({
      data: {
        text: data.text,
        quizId,
        alternatives: data.alternatives
          ? { create: data.alternatives }
          : undefined,
      },
      include: { alternatives: true },
    });
  }

  async updateQuestion(questionId: string, data: any) {
    return this.repo.question.update({
      where: { id: questionId },
      data: { text: data.text },
    });
  }

  async deleteQuestion(questionId: string) {
    return this.repo.question.delete({ where: { id: questionId } });
  }

  async addAlternative(questionId: string, data: any) {
    return this.repo.alternative.create({
      data: {
        text: data.text,
        isCorrect: data.isCorrect,
        questionId,
      },
    });
  }

  async updateAlternative(alternativeId: string, data: any) {
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
