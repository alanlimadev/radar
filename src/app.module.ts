import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { RadarCoreModule } from './core/radar.module';
import { QuizModule } from './quiz/quiz.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

const clientPath = join(process.cwd(), 'client');

@Module({
  imports: [
    ...(existsSync(clientPath)
      ? [
          ServeStaticModule.forRoot({
            rootPath: clientPath,
          }),
        ]
      : []),
    PrismaModule,
    RadarCoreModule,
    QuizModule,
    UserModule,
    AuthModule,
  ],
})
export class AppModule {}

