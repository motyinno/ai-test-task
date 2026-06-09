import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum, IsString, Matches } from 'class-validator';
import { Type } from 'class-transformer';
import { IsInt, Min, Max } from 'class-validator';
import { DayOfWeek } from '../entities/availability.entity';

/**
 * PlayerAvailabilityQueryDto — query params for the trainer player-availability view (E4).
 * Extends PaginationQueryDto inline (re-declared here to avoid circular deps from shared).
 */
export class PlayerAvailabilityQueryDto {
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

  @ApiPropertyOptional({ enum: DayOfWeek, description: 'Filter by day of week' })
  @IsOptional()
  @IsEnum(DayOfWeek)
  day?: DayOfWeek;

  @ApiPropertyOptional({ example: '17:00', description: 'Filter: slots starting at or after this time (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'fromTime must be in HH:MM format' })
  fromTime?: string;

  @ApiPropertyOptional({ example: '20:00', description: 'Filter: slots ending at or before this time (HH:MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'toTime must be in HH:MM format' })
  toTime?: string;
}
