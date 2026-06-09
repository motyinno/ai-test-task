import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';
import { DayOfWeek } from '../entities/availability.entity';

/**
 * AvailabilitySlotDto — one recurring weekly slot.
 * Shared by both Player (Best Times) and Coach (My Times) APIs.
 *
 * dayOfWeek: MON | TUE | WED | THU | FRI | SAT | SUN
 * startTime / endTime: HH:MM 24-hour format (e.g. "16:00")
 */
export class AvailabilitySlotDto {
  @ApiProperty({
    enum: DayOfWeek,
    example: 'MON',
    description: 'Day of week for this recurring slot',
  })
  @IsEnum(DayOfWeek)
  dayOfWeek!: DayOfWeek;

  @ApiProperty({ example: '16:00', description: 'Start time in HH:MM format (24-hour)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be in HH:MM format (e.g. "16:00")' })
  startTime!: string;

  @ApiProperty({ example: '20:00', description: 'End time in HH:MM format (24-hour)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be in HH:MM format (e.g. "20:00")' })
  endTime!: string;
}
