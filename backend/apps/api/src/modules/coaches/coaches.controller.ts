import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { CoachesService } from './coaches.service';
import { InviteCoachDto } from './dto/invite-coach.dto';
import { CoachInvitationDto } from './dto/coach-invitation.dto';
import { ShareLink } from '../sharelinks/entities/share-link.entity';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  trainerId?: string;
}

@ApiTags('Coaches')
@Controller('coaches')
export class CoachesController {
  constructor(private readonly coachesService: CoachesService) {}

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
}
