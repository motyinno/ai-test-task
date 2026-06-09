import {
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateChildDto {
  @ApiProperty({ description: 'Child display name', maxLength: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  @IsString()
  name!: string;

  @ApiProperty({ minimum: 1, maximum: 18, description: 'Age in years (BR-017)' })
  @IsInt()
  @Min(1)
  @Max(18)
  @Type(() => Number)
  age!: number;

  @ApiProperty({ enum: ['MALE', 'FEMALE', 'OTHER'] })
  @IsEnum(['MALE', 'FEMALE', 'OTHER'])
  gender!: 'MALE' | 'FEMALE' | 'OTHER';

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(200)
  @IsString()
  school?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Trainer UUIDs to associate child with immediately',
  })
  @IsOptional()
  @IsUUID('4', { each: true })
  trainerIds?: string[];

  @ApiPropertyOptional({
    description: 'When true, create a constrained child sub-login credential',
  })
  @IsOptional()
  @IsBoolean()
  createLogin?: boolean;

  @ApiPropertyOptional({
    description: 'Username for child sub-login (required when createLogin=true)',
    maxLength: 50,
  })
  @IsOptional()
  @MaxLength(50)
  @IsString()
  childUsername?: string;

  @ApiPropertyOptional({
    description: 'Password for child sub-login (required when createLogin=true, min 8 chars)',
  })
  @IsOptional()
  @IsString()
  childPassword?: string;
}
