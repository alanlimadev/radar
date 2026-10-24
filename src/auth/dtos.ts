import {
  IsString,
  IsNotEmpty,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/** Regra única de username: 3 a 20 caracteres, minúsculo, sem espaços. */
export const USERNAME_REGEX = /^[a-z0-9._-]{3,20}$/;
export const USERNAME_MESSAGE =
  'O usuário deve ter de 3 a 20 caracteres e conter apenas letras minúsculas, números, ponto, hífen ou underline';

export function normalizeUsername(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class RegisterDto {
  @ApiProperty({
    example: 'Alan Lima',
    description: 'Nome de exibição do host',
  })
  @Transform(
    ({ value }) => (typeof value === 'string' ? value.trim() : value) as string,
  )
  @IsString({ message: 'O nome deve ser uma string' })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  @MaxLength(80, { message: 'O nome deve ter no máximo 80 caracteres' })
  name: string;

  @ApiProperty({
    example: 'alan.lima',
    description:
      'Usuário único (3 a 20 caracteres, minúsculo, sem espaços; permite a-z, 0-9, ponto, hífen e underline)',
  })
  @Transform(({ value }) => normalizeUsername(value))
  @IsString({ message: 'O usuário deve ser uma string' })
  @IsNotEmpty({ message: 'O usuário é obrigatório' })
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username: string;

  @ApiProperty({
    example: 'senha123',
    description: 'Senha do host (mínimo 6 caracteres)',
  })
  @IsString({ message: 'A senha deve ser uma string' })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  password: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'alan.lima',
    description: 'Usuário cadastrado',
  })
  @Transform(({ value }) => normalizeUsername(value))
  @IsString({ message: 'O usuário deve ser uma string' })
  @IsNotEmpty({ message: 'O usuário é obrigatório' })
  username: string;

  @ApiProperty({
    example: 'senha123',
    description: 'Senha do host',
  })
  @IsString({ message: 'A senha deve ser uma string' })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  password: string;
}

export class AuthResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token JWT para autenticação',
  })
  access_token: string;

  @ApiProperty({
    example: 'alan.lima',
    description: 'Dados do host autenticado',
  })
  user: {
    id: string;
    name: string;
    username: string;
  };
}
