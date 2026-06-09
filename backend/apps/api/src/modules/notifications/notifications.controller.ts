/**
 * NotificationsController — REST endpoints for in-app notifications (Q-01.06, GR4).
 *
 * Endpoints:
 *   GET  /api/v1/notifications       — list notifications for the authenticated user
 *   POST /api/v1/notifications/:id/read — mark a notification as read
 *
 * Authentication: session-based (requires login).
 * Authorization: user can only see/modify their own notifications.
 */
import {
  Controller,
  Get,
  Post,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../shared/authz/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import type { Request } from 'express';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
}

function getPrincipal(req: Request): SessionPrincipal {
  const session = req.session as unknown as SessionRecord;
  const principal = session?.['principal'] as SessionPrincipal | undefined;
  if (!principal?.id) {
    throw new UnauthorizedException({ message: 'Not authenticated', errorCode: 'NOT_AUTHENTICATED' });
  }
  return principal;
}

@ApiTags('notifications')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * GET /api/v1/notifications — list notifications for the current user.
   */
  @Get()
  @Roles(UserRole.TRAINER, UserRole.COACH, UserRole.PLAYER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'List notifications for the authenticated user' })
  @ApiResponse({ status: 200 })
  async listNotifications(
    @Req() req: Request,
  ): Promise<{ data: Notification[] }> {
    const principal = getPrincipal(req);
    const notifications = await this.notificationsService.listForUser(principal.id);
    return { data: notifications };
  }

  /**
   * POST /api/v1/notifications/:id/read — mark a notification as read.
   */
  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TRAINER, UserRole.COACH, UserRole.PLAYER, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 200 })
  async markRead(
    @Param('id') id: string,
    @Req() req: Request,
  ): Promise<Notification> {
    const principal = getPrincipal(req);
    return this.notificationsService.markRead(id, principal.id);
  }
}
