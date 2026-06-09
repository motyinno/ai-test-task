import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsString } from 'class-validator';

export class AddChildTrainerDto {
  @ApiPropertyOptional({ description: 'Share link code (option A)' })
  @IsOptional()
  @IsString()
  shareLinkCode?: string;

  @ApiPropertyOptional({ description: 'Trainer UUID (option B — direct add)' })
  @IsOptional()
  @IsUUID()
  trainerId?: string;
}
