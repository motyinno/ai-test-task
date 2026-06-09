import {
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsUUID,
  MaxLength,
  IsString,
  IsDateString,
  ValidationArguments,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { deriveAge } from '../../../shared/utils/age.util';

/**
 * Custom validator: derived age from dateOfBirth must be between min and max (BR-017).
 */
function IsAgeInRange(min: number, max: number, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isAgeInRange',
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          const age = deriveAge(value);
          if (age === null) return false;
          return age >= min && age <= max;
        },
        defaultMessage(args: ValidationArguments) {
          const age = deriveAge(args.value as string);
          return `dateOfBirth implies age ${age ?? 'unknown'} which is outside the allowed range ${min}–${max} (BR-017)`;
        },
      },
    });
  };
}

export class CreateChildDto {
  @ApiProperty({ description: 'Child display name', maxLength: 100 })
  @IsNotEmpty()
  @MaxLength(100)
  @IsString()
  name!: string;

  /**
   * Date of birth in ISO 8601 date format (YYYY-MM-DD).
   * BR-017: derived age must be 1–18 years.
   * Replaces the deprecated `age` integer field.
   */
  @ApiProperty({
    description: 'Date of birth (ISO date, YYYY-MM-DD). Derived age must be 1–18 (BR-017).',
    example: '2012-05-15',
  })
  @IsDateString()
  @IsAgeInRange(1, 18, { message: 'Derived age from dateOfBirth must be between 1 and 18 (BR-017)' })
  dateOfBirth!: string;

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
