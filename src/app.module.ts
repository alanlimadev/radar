import { Module } from '@nestjs/common';
import { RadarCoreModule } from './core/radar.module';
import { QuizModule } from './quiz/quiz.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { GameSessionModule } from './game-session/game-session.module';

@Module({
  imports: [
    PrismaModule,
    RadarCoreModule,
    QuizModule,
    UserModule,
    AuthModule,
    GameSessionModule,
  ],
})
export class AppModule {}
