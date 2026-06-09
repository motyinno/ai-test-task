import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class TokenSettingDto {
  @ApiProperty({ description: 'When true, token purchases for this child skip parent approval (FR-029)' })
  @IsBoolean()
  allowTokenSpendWithoutApproval!: boolean;
}
