import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  MaxLength,
  IsEmail,
  IsOptional,
  Matches,
  IsEnum,
} from 'class-validator';

export class CreateTrainerDto {
  @ApiProperty({ example: 'Elite Soccer Academy' })
  @IsNotEmpty()
  @MaxLength(200)
  businessName!: string;

  @ApiProperty({ example: 'Coach Mike' })
  @IsNotEmpty()
  @MaxLength(100)
  trainerName!: string;

  @ApiProperty({ example: 'trainer@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '+12025551234' })
  @IsOptional()
  @Matches(/^[+\d][\d\s().-]{6,19}$/, {
    message: 'phone must be a valid phone number',
  })
  phone?: string;

  @ApiProperty({
    enum: ['TEMP_PASSWORD', 'INVITE_LINK'],
    default: 'INVITE_LINK',
  })
  @IsEnum(['TEMP_PASSWORD', 'INVITE_LINK'])
  onboardingMode: 'TEMP_PASSWORD' | 'INVITE_LINK' = 'INVITE_LINK';
}
