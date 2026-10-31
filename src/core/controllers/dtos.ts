import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRoomDto {
  @ApiProperty({
    description: 'Tipo do jogo registrado no RADAR Framework (ex: quiz, dice, poll)',
    example: 'quiz',
  })
  @IsNotEmpty({ message: 'gameType é obrigatório' })
  @IsString({ message: 'gameType deve ser uma string' })
  gameType: string;

  @ApiProperty({
    description: 'Configurações específicas do jogo (dados da partida, perguntas, etc.)',
    example: { quizId: '550e8400-e29b-41d4-a716-446655440000' },
  })
  @IsOptional()
  config?: any;
}

export class ListReportsQueryDto {
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit deve ser um número inteiro' })
  @Min(1, { message: 'limit deve ser maior ou igual a 1' })
  @Max(100, { message: 'limit deve ser menor ou igual a 100' })
  limit?: number;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset deve ser um número inteiro' })
  @Min(0, { message: 'offset deve ser maior ou igual a 0' })
  offset?: number;

  @ApiPropertyOptional({ example: 'b2a1...' })
  @IsOptional()
  @IsString({ message: 'quizId deve ser uma string' })
  quizId?: string;
}
