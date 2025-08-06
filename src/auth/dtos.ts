import { IsString, IsNotEmpty, IsEmail, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({
    example: 'Alan Lima',
    description: 'Nome completo do professor',
  })
  @IsString({ message: 'O nome deve ser uma string' })
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  name: string;

  @ApiProperty({
    example: 'alan@email.com',
    description: 'Email do professor',
  })
  @IsEmail({}, { message: 'O e-mail deve ser válido' })
  email: string;

  @ApiProperty({
    example: 'senha123',
    description: 'Senha do professor (mínimo 6 caracteres)',
  })
  @IsString({ message: 'A senha deve ser uma string' })
  @IsNotEmpty({ message: 'A senha é obrigatória' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres' })
  password: string;
}

export class LoginDto {
  @ApiProperty({
    example: 'alan@email.com',
    description: 'Email do professor',
  })
  @IsEmail({}, { message: 'O e-mail deve ser válido' })
  email: string;

  @ApiProperty({
    example: 'senha123',
    description: 'Senha do professor',
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
    example: 'Alan Lima',
    description: 'Nome do professor',
  })
  user: {
    id: string;
    name: string;
    email: string;
  };
}
