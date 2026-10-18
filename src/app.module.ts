import { Module } from '@nestjs/common';
import { RadarCoreModule } from './core/radar.module';
import { QuizModule } from './quiz/quiz.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';

// A entrega dos arquivos do client (e o fallback do SPA) e feita em `main.ts`,
// via `useStaticAssets` + `SpaFallbackFilter`. Nao usar `@nestjs/serve-static`:
// o fallback dele quebra quando o caminho do app tem um diretorio comecando com
// "." (caso do AppImage em /tmp/.mount_XXXX).

@Module({
  imports: [
    PrismaModule,
    RadarCoreModule,
    QuizModule,
    UserModule,
    AuthModule,
  ],
})
export class AppModule {}

