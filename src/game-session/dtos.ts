import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateGameSessionDto {
  @ApiProperty({
    description: 'ID do quiz que será usado na sessão de jogo',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  quizId: string;
}

export class JoinSessionDto {
  @ApiProperty({
    description: 'ID da sessão de jogo para conectar',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  sessionId: string;

  @ApiProperty({
    description: 'Nome do jogador que está se conectando',
    example: 'João Silva',
    minLength: 2,
    maxLength: 50,
  })
  @IsNotEmpty()
  @IsString()
  playerName: string;
}

export class SubmitAnswerDto {
  @ApiProperty({
    description: 'ID da pergunta sendo respondida',
    example: '550e8400-e29b-41d4-a716-446655440003',
    format: 'uuid',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  questionId: string;

  @ApiProperty({
    description: 'ID da alternativa escolhida como resposta',
    example: '550e8400-e29b-41d4-a716-446655440004',
    format: 'uuid',
  })
  @IsNotEmpty()
  @IsString()
  @IsUUID()
  alternativeId: string;
}
