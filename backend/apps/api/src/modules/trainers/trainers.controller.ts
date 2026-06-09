import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { AvailabilityService } from '../availability/availability.service';
import { PlayerAvailabilityQueryDto } from '../availability/dto/player-availability-query.dto';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  trainerId?: string;
}

/**
 * TrainersController — trainer-facing endpoints.
 *
 * All routes require TRAINER role and are tenant-scoped to the caller's org.
 *
 * Current Phase E endpoints:
 *   GET /trainers/me/players/availability — player availability view + filter (FR-051, E4)
 *
 * Phase G: branding endpoints (GET/PUT /trainers/me/branding) are out of scope for Phase E.
 */
@ApiTags('Trainers')
@Controller('trainers')
export class TrainersController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  // ─── E4: Trainer player availability view ─────────────────────────────────

  /**
   * GET /trainers/me/players/availability — view player availability for the trainer's org.
   *
   * Returns paginated availability slots for ALL players in the trainer's org,
   * with optional filter by day and time window.
   *
   * Tenant isolation: results are strictly scoped to the caller's trainerId.
   * A trainer CANNOT see another trainer's players' availability.
   *
   * Filter params (all optional):
   *   - day: MON | TUE | WED | THU | FRI | SAT | SUN
   *   - fromTime: HH:MM — only slots starting at or after this time
   *   - toTime: HH:MM — only slots ending at or before this time
   */
  @Get('me/players/availability')
  @Roles('TRAINER')
  @ApiOperation({
    summary: 'View player availability summary for the trainer org (FR-051)',
    description:
      'Returns paginated availability slots for all players in the trainer org. ' +
      'Optionally filter by day of week and/or time window. ' +
      'Tenant-scoped: only the calling trainer\'s org players are returned.',
  })
  async getPlayerAvailability(
    @Req() req: Request,
    @Query() query: PlayerAvailabilityQueryDto,
  ) {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    if (!principal.trainerId) throw new UnauthorizedException('Trainer context required');

    return this.availabilityService.getTrainerPlayerAvailability(principal.trainerId, query);
  }
}
