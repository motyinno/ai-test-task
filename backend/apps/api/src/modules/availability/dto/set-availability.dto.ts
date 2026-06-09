import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AvailabilitySlotDto } from './availability-slot.dto';

/**
 * SetAvailabilityDto — full replacement of all availability slots.
 * Used by both PUT /players/:profileId/availability and PUT /coaches/me/availability.
 *
 * Semantics: the entire set of slots is replaced atomically (delete-all-then-insert).
 * An empty slots array means "no recurring availability set".
 */
export class SetAvailabilityDto {
  @ApiProperty({
    type: [AvailabilitySlotDto],
    description:
      'Full replacement list of recurring weekly availability slots. ' +
      'An empty array clears all availability. Multiple slots per day are allowed.',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AvailabilitySlotDto)
  slots!: AvailabilitySlotDto[];
}
