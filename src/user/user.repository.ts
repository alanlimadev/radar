import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class UserRepository {
  private prisma = new PrismaClient();
  user = this.prisma.user;
}
