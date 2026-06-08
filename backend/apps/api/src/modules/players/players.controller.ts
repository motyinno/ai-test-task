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

    // If this was a new registration (anonymous), establish session
    if (!principal && result.userId) {
      const user = await this.playersService['usersRepo'].findById(result.userId);
      if (user) {
        (session as Record<string, unknown>)['principal'] = {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          emailVerified: user.emailVerified,
          mustChangePassword: user.mustChangePassword,
        };
      }
    }

    return { success: true, alreadyAssociated: false, userId: result.userId };
  }
}
