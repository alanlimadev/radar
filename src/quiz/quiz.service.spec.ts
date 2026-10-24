import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { QuizService } from './quiz.service';

describe('QuizService — isolamento por usuário', () => {
  const USER_A = 'user-a';
  const USER_B = 'user-b';

  let repo: any;
  let prisma: any;
  let service: QuizService;

  beforeEach(() => {
    repo = {
      quiz: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      question: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      alternative: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma = { quiz: { delete: jest.fn() } };
    service = new QuizService(repo, prisma);
  });

  it('findAllQuizzes filtra pelo usuário logado', async () => {
    repo.quiz.findMany.mockResolvedValue([]);

    await service.findAllQuizzes(USER_A);

    expect(repo.quiz.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { createdBy: USER_A } }),
    );
  });

  it('findQuizByIdForUser retorna o quiz do próprio usuário', async () => {
    const quiz = { id: 'quiz-1', createdBy: USER_A, questions: [] };
    repo.quiz.findUnique.mockResolvedValue(quiz);

    await expect(service.findQuizByIdForUser('quiz-1', USER_A)).resolves.toBe(
      quiz,
    );
  });

  it('findQuizByIdForUser lança 403 para quiz de outro usuário', async () => {
    repo.quiz.findUnique.mockResolvedValue({
      id: 'quiz-1',
      createdBy: USER_A,
      questions: [],
    });

    await expect(
      service.findQuizByIdForUser('quiz-1', USER_B),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findQuizByIdForUser lança 404 quando o quiz não existe', async () => {
    repo.quiz.findUnique.mockResolvedValue(null);

    await expect(
      service.findQuizByIdForUser('missing', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('addQuestion exige dono do quiz', async () => {
    repo.quiz.findUnique.mockResolvedValue({ createdBy: USER_A });

    await expect(
      service.addQuestion(
        'quiz-1',
        { text: 'Pergunta', alternatives: [] },
        USER_B,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.question.create).not.toHaveBeenCalled();
  });

  it('updateQuestion exige dono do quiz da pergunta', async () => {
    repo.question.findUnique.mockResolvedValue({
      quiz: { createdBy: USER_A },
    });

    await expect(
      service.updateQuestion('question-1', { text: 'Nova' }, USER_B),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.question.update).not.toHaveBeenCalled();
  });

  it('deleteQuestion exige dono do quiz da pergunta', async () => {
    repo.question.findUnique.mockResolvedValue({
      quiz: { createdBy: USER_A },
    });

    await expect(
      service.deleteQuestion('question-1', USER_B),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.question.delete).not.toHaveBeenCalled();
  });

  it('addAlternative exige dono do quiz da pergunta', async () => {
    repo.question.findUnique.mockResolvedValue({
      quiz: { createdBy: USER_A },
    });

    await expect(
      service.addAlternative(
        'question-1',
        { text: 'Alternativa', isCorrect: false },
        USER_B,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.alternative.create).not.toHaveBeenCalled();
  });

  it('updateAlternative exige dono do quiz da alternativa', async () => {
    repo.alternative.findUnique.mockResolvedValue({
      question: { quiz: { createdBy: USER_A } },
    });

    await expect(
      service.updateAlternative(
        'alt-1',
        { text: 'Nova', isCorrect: true },
        USER_B,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.alternative.update).not.toHaveBeenCalled();
  });

  it('deleteAlternative exige dono do quiz da alternativa', async () => {
    repo.alternative.findUnique.mockResolvedValue({
      question: { quiz: { createdBy: USER_A } },
    });

    await expect(
      service.deleteAlternative('alt-1', USER_B),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.alternative.delete).not.toHaveBeenCalled();
  });

  it('getAlternativesByQuestion valida dono quando userId é informado', async () => {
    repo.question.findUnique.mockResolvedValue({
      quiz: { createdBy: USER_A },
    });

    await expect(
      service.getAlternativesByQuestion('question-1', USER_B),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.alternative.findMany).not.toHaveBeenCalled();
  });

  it('getAlternativesByQuestion mantém leitura interna sem userId', async () => {
    repo.alternative.findMany.mockResolvedValue([]);

    await expect(
      service.getAlternativesByQuestion('question-1'),
    ).resolves.toEqual([]);

    expect(repo.question.findUnique).not.toHaveBeenCalled();
  });

  it('getAlternativeById lança 404 quando não existe', async () => {
    repo.alternative.findUnique.mockResolvedValue(null);

    await expect(
      service.getAlternativeById('missing', USER_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('permite que o dono crie perguntas', async () => {
    repo.quiz.findUnique.mockResolvedValue({ createdBy: USER_A });
    repo.question.findFirst.mockResolvedValue({ order: 2 });
    repo.question.create.mockResolvedValue({ id: 'new-question' });

    await expect(
      service.addQuestion(
        'quiz-1',
        { text: 'Pergunta', alternatives: [] },
        USER_A,
      ),
    ).resolves.toEqual({ id: 'new-question' });

    expect(repo.question.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ order: 3, quizId: 'quiz-1' }),
      }),
    );
  });
});
