import {
  Controller,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PlayersService } from './players.service';
import { JoinViaLinkDto } from './dto/join-via-link.dto';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  isChild?: boolean;
  parentUserId?: string;
}

@ApiTags('Players')
@Controller()
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  /**
   * POST /join/:code — join via a share link.
   *
   * Public endpoint: no @Roles decorator.
   * Handles both anonymous registration (STATIC link + no session) and
   * logged-in player association (any link + active session).
   *
   * M-3 fix: session is established from newPrincipal returned by PlayersService,
   * eliminating bracket-access to the service's private usersRepo dependency.
   */
  @Post('join/:code')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join via share link (register or associate)' })
  async joinViaLink(
    @Param('code') code: string,
    @Body() dto: JoinViaLinkDto,
    @Req() req: Request,
  ): Promise<{ success: boolean; alreadyAssociated?: boolean; userId?: string }> {
    const session = req.session as unknown as SessionRecord;
    const principal = session?.['principal'] as SessionPrincipal | undefined;

    const result = await this.playersService.joinViaLink(code, dto, {
      principalId: principal?.id,
      principalRole: principal?.role,
      isChild: principal?.isChild ?? false,
      parentUserId: principal?.parentUserId,
    });

    if (result.alreadyAssociated) {
      return { success: true, alreadyAssociated: true };
    }

    // If this was a new anonymous registration, establish a session using the
    // newPrincipal data returned by the service (M-3: no bracket-access to private deps).
    if (!principal && result.newPrincipal) {
      (session as Record<string, unknown>)['principal'] = result.newPrincipal;
    }

    return { success: true, alreadyAssociated: false, userId: result.userId };
  }
}
