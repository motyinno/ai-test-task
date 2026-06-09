import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID, IsOptional } from 'class-validator';

export class SwitchContextDto {
  @ApiProperty({ description: 'PlayerProfile UUID to switch to (Me or child profile)' })
  @IsUUID()
  profileId!: string;

  @ApiPropertyOptional({ description: 'TrainerPlayerAssociation trainerId to activate' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;
}
