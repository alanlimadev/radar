import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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
