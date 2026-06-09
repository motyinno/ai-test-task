import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, MaxLength, IsString } from 'class-validator';

export class ResolveApprovalDto {
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @MaxLength(500)
  @IsString()
  parentNotes?: string;
}
