import { IsString, IsNotEmpty, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  USERNAME_MESSAGE,
  USERNAME_REGEX,
  normalizeUsername,
} from '../auth/dtos';

export class CreateUserDto {
  @ApiProperty({ example: 'Alan Lima' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiProperty({ example: 'alan.lima' })
  @Transform(({ value }) => normalizeUsername(value))
  @IsString()
  @IsNotEmpty()
  @Matches(USERNAME_REGEX, { message: USERNAME_MESSAGE })
  username: string;

  @ApiProperty({ example: 'senha123' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
