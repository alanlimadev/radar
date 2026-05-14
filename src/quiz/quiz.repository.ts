import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class QuizRepository {
  constructor(private prisma: PrismaService) {}

  get quiz() {
    return this.prisma.quiz;
  }
  get question() {
    return this.prisma.question;
  }
  get alternative() {
    return this.prisma.alternative;
  }
}
