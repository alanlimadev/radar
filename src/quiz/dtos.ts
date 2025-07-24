import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateAlternativeDto {
  @ApiProperty({ example: 'Alternativa A' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  isCorrect: boolean;
}

export class UpdateAlternativeDto {
  @ApiProperty({ example: 'Alternativa A', required: false })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isCorrect?: boolean;
}

export class CreateQuestionDto {
  @ApiProperty({ example: 'Qual a capital do Brasil?' })
  @IsString()
  @IsNotEmpty()
  text: string;

  @ApiProperty({ type: [CreateAlternativeDto] })
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CreateAlternativeDto)
  alternatives: CreateAlternativeDto[];
}

export class UpdateQuestionDto {
  @ApiProperty({ example: 'Qual a capital do Brasil?', required: false })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiProperty({ type: [CreateAlternativeDto], required: false })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(4)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => CreateAlternativeDto)
  alternatives?: CreateAlternativeDto[];
}

export class CreateQuizDto {
  @ApiProperty({ example: 'Quiz de Geografia' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'Teste seus conhecimentos de geografia',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'id-do-usuario' })
  @IsString()
  @IsNotEmpty()
  createdBy: string;

  @ApiProperty({ type: [CreateQuestionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionDto)
  questions?: CreateQuestionDto[];
}

export class UpdateQuizDto {
  @ApiProperty({ example: 'Quiz de Geografia', required: false })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({
    example: 'Teste seus conhecimentos de geografia',
    required: false,
  })
  @IsOptional()
  @IsString()
  description?: string;
}
