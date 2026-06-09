import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { MeResponseDto } from '../../auth/dto/me-response.dto';

/**
 * Response DTO for POST /impersonation/:userId (F3).
 *
 * actingAs: the impersonated user's MeResponseDto (what the SA now sees as subject).
 * expiresAt: start + 1h hard cap (ISO string).
 */
export class StartImpersonationResponseDto {
  @ApiProperty({ description: 'Open ImpersonationLog bracket id' })
  impersonationLogId!: string;

  @ApiProperty({ type: () => MeResponseDto, description: 'Subject view (impersonated user)' })
  actingAs!: MeResponseDto;

  @ApiProperty({ description: 'Expiry time (start + 1h), ISO 8601' })
  expiresAt!: string;
}

/**
 * Single ImpersonationLog row shape for GET /impersonation/history items.
 */
export class ImpersonationLogDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  adminId!: string;

  @ApiProperty()
  impersonatedUserId!: string;

  @ApiProperty()
  startAt!: string;

  @ApiPropertyOptional()
  endAt?: string;

  @ApiPropertyOptional()
  durationSeconds?: number;

  @ApiProperty()
  createdAt!: string;
}

/**
 * Query parameters for GET /impersonation/history (F6).
 */
export class ImpersonationHistoryQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Filter by Super Admin UUID' })
  @IsOptional()
  @IsUUID()
  adminId?: string;

  @ApiPropertyOptional({ description: 'Filter by impersonated user UUID' })
  @IsOptional()
  @IsUUID()
  impersonatedUserId?: string;
}

export class PaginatedImpersonationHistoryDto {
  @ApiProperty({ type: () => [ImpersonationLogDto] })
  data!: ImpersonationLogDto[];

  @ApiProperty()
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
