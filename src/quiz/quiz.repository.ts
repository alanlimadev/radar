import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class QuizRepository {
  private prisma = new PrismaClient();

  quiz = this.prisma.quiz;
  question = this.prisma.question;
  alternative = this.prisma.alternative;
}
