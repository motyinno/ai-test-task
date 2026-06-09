import {
  Controller,
  Post,
  Get,
  Put,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { CoachesService } from './coaches.service';
import { InviteCoachDto } from './dto/invite-coach.dto';
import { CoachInvitationDto } from './dto/coach-invitation.dto';
import { ShareLink } from '../sharelinks/entities/share-link.entity';
import { AvailabilityService } from '../availability/availability.service';
import { SetAvailabilityDto } from '../availability/dto/set-availability.dto';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  trainerId?: string;
}

@ApiTags('Coaches')
@Controller('coaches')
export class CoachesController {
  constructor(
    private readonly coachesService: CoachesService,
    private readonly availabilityService: AvailabilityService,
  ) {}

  // ─── POST /coaches/invite — send coach invitation ─────────────────────────

  @Post('invite')
  @Roles('TRAINER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Invite a coach via email' })
  async invite(
    @Body() dto: InviteCoachDto,
    @Req() req: Request,
  ): Promise<{ id: string; code: string; targetEmail: string }> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;

    const link = await this.coachesService.inviteCoach(dto, {
      trainerId: principal.trainerId!,
      userId: principal.id,
    });

    return {
      id: link.id,
      code: link.code,
      targetEmail: link.targetEmail!,
    };
  }

  // ─── GET /coaches/invitations — list invitations ──────────────────────────

  @Get('invitations')
  @Roles('TRAINER')
  @ApiOperation({ summary: 'List coach invitations for the trainer' })
  async listInvitations(@Req() req: Request): Promise<CoachInvitationDto[]> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    return this.coachesService.listInvitations(principal.trainerId!);
  }

  // ─── POST /coaches/invitations/:id/resend — resend invitation ─────────────

  @Post('invitations/:id/resend')
  @Roles('TRAINER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resend (refresh) a coach invitation' })
  async resend(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<CoachInvitationDto> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    return this.coachesService.resendInvitation(id, principal.trainerId!);
  }

  // ─── E3: Coach My Times ───────────────────────────────────────────────────

  /**
   * GET /coaches/me/availability — get the calling coach's recurring availability slots.
   * Role: COACH only.
   * Advisory data (BR-015); multiple slots per day allowed.
   */
  @Get('me/availability')
  @Roles('COACH')
  @ApiOperation({ summary: "Get coach's own availability (My Times)" })
  async getMyAvailability(@Req() req: Request) {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.availabilityService.getCoachAvailability(principal.id);
  }

  /**
   * PUT /coaches/me/availability — set (replace) the calling coach's availability.
   * Role: COACH only.
   * Full replacement: existing slots are deleted and replaced atomically.
   * Multiple slots per day allowed (e.g. morning + evening sessions).
   */
  @Put('me/availability')
  @Roles('COACH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Set coach's own availability (My Times, full replace)" })
  async setMyAvailability(@Req() req: Request, @Body() dto: SetAvailabilityDto) {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.availabilityService.setCoachAvailability(principal.id, dto);
  }
}
