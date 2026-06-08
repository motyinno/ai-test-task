import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsEmail, ValidateIf } from 'class-validator';
import { ShareLinkType } from '../entities/share-link.entity';

export class CreateShareLinkDto {
  @ApiProperty({ enum: ShareLinkType, description: 'STATIC for player registration; UNIQUE for coach invite' })
  @IsEnum(ShareLinkType)
  type!: ShareLinkType;

  @ApiPropertyOptional({ description: 'Required for UNIQUE (coach) links — the invited email address' })
  @ValidateIf((o) => o.type === ShareLinkType.UNIQUE)
  @IsEmail()
  targetEmail?: string;
}
