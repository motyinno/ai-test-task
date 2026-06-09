import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Req,
  ParseUUIDPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { PlayersService } from './players.service';
import { PlayersChildService } from './players-child.service';
import { JoinViaLinkDto } from './dto/join-via-link.dto';
import { CreateChildDto } from './dto/create-child.dto';
import { SwitchContextDto } from './dto/switch-context.dto';
import { AddChildTrainerDto } from './dto/add-child-trainer.dto';
import { TokenSettingDto } from './dto/token-setting.dto';
import { Roles } from '../../shared/authz/roles.decorator';
import { ApprovalsService } from '../approvals/approvals.service';
import { AvailabilityService } from '../availability/availability.service';
import { SetAvailabilityDto } from '../availability/dto/set-availability.dto';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  isChild?: boolean;
  parentUserId?: string;
  childProfileId?: string;
}

function getPrincipal(req: Request): SessionPrincipal | undefined {
  const session = req.session as unknown as SessionRecord;
  return session?.['principal'] as SessionPrincipal | undefined;
}

function requireParent(req: Request): SessionPrincipal {
  const p = getPrincipal(req);
  if (!p?.id) throw new UnauthorizedException('Not authenticated');
  if (p.isChild) {
    throw new UnauthorizedException({
      message: 'Child principals cannot perform this action',
      errorCode: 'CHILD_FORBIDDEN',
    });
  }
  return p;
}

@ApiTags('Players')
@Controller()
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly playersChildService: PlayersChildService,
    private readonly approvalsService: ApprovalsService,
    private readonly availabilityService: AvailabilityService,
  ) {}

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

    if (!principal && result.newPrincipal) {
      (session as Record<string, unknown>)['principal'] = result.newPrincipal;
    }

    return { success: true, alreadyAssociated: false, userId: result.userId };
  }

  // ─── D2: Child management ────────────────────────────────────────────────────

  /**
   * GET /players/me/children — list children of the current parent.
   */
  @Get('players/me/children')
  @Roles('PLAYER')
  @ApiOperation({ summary: 'List children under this parent account' })
  async listChildren(@Req() req: Request) {
    const principal = requireParent(req);
    return this.playersChildService.listChildren(principal.id);
  }

  /**
   * POST /players/me/children — create a child profile (FR-023).
   * BR-017: age 1–18 enforced.
   */
  @Post('players/me/children')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a child profile (BR-017: age 1–18)' })
  async createChild(@Req() req: Request, @Body() dto: CreateChildDto) {
    const principal = requireParent(req);
    return this.playersChildService.createChild(principal.id, dto);
  }

  // ─── D3: Child↔trainer management ───────────────────────────────────────────

  /**
   * POST /players/me/children/:childId/trainers — add a trainer to a child (FR-024).
   */
  @Post('players/me/children/:childId/trainers')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add trainer to child profile (FR-024)' })
  async addChildTrainer(
    @Req() req: Request,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() dto: AddChildTrainerDto,
  ) {
    const principal = requireParent(req);
    return this.playersChildService.addChildTrainer(principal.id, childId, {
      shareLinkCode: dto.shareLinkCode,
      trainerId: dto.trainerId,
    });
  }

  /**
   * DELETE /players/me/children/:childId/trainers/:trainerId — remove trainer from child.
   */
  @Delete('players/me/children/:childId/trainers/:trainerId')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove trainer from child profile' })
  async removeChildTrainer(
    @Req() req: Request,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('trainerId', ParseUUIDPipe) trainerId: string,
  ) {
    const principal = requireParent(req);
    return this.playersChildService.removeChildTrainer(principal.id, childId, trainerId);
  }

  // ─── D4: Context switching ───────────────────────────────────────────────────

  /**
   * GET /players/me/contexts — list all accessible contexts.
   */
  @Get('players/me/contexts')
  @Roles('PLAYER')
  @ApiOperation({ summary: 'List accessible contexts (Me + children × trainers)' })
  async listContexts(@Req() req: Request) {
    const principal = getPrincipal(req);
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.playersChildService.listContexts(
      principal.id,
      principal.isChild ?? false,
      principal.childProfileId,
    );
  }

  /**
   * POST /players/me/context — switch active context (FR-025).
   */
  @Post('players/me/context')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Switch active context (profile + trainer)' })
  async switchContext(@Req() req: Request, @Body() dto: SwitchContextDto) {
    const principal = getPrincipal(req);
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.playersChildService.switchContext(
      req,
      principal.id,
      principal.isChild ?? false,
      principal.childProfileId,
      dto,
    );
  }

  // ─── D9: Token setting ───────────────────────────────────────────────────────

  /**
   * PATCH /players/me/children/:childId/token-setting — toggle token-spend approval (FR-029).
   */
  @Patch('players/me/children/:childId/token-setting')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Toggle per-child token spend approval setting (FR-029)' })
  async setTokenSetting(
    @Req() req: Request,
    @Param('childId', ParseUUIDPipe) childId: string,
    @Body() dto: TokenSettingDto,
  ) {
    const principal = requireParent(req);
    return this.approvalsService.setTokenSetting(
      childId,
      principal.id,
      dto.allowTokenSpendWithoutApproval,
    );
  }

  // ─── E2: Player Best Times availability ────────────────────────────────────

  /**
   * GET /players/:profileId/availability — get availability slots for a player profile.
   *
   * Caller must own the profile (direct owner or parent of the child profile).
   * Advisory (BR-015): read-only view of best times — no enforcement side effects.
   */
  @Get('players/:profileId/availability')
  @Roles('PLAYER')
  @ApiOperation({ summary: 'Get player availability (Best Times, BR-015 advisory)' })
  async getPlayerAvailability(
    @Req() req: Request,
    @Param('profileId', ParseUUIDPipe) profileId: string,
  ) {
    const principal = getPrincipal(req);
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.availabilityService.getPlayerAvailability(
      profileId,
      principal.id,
      (principal as SessionPrincipal & { trainerId?: string }).trainerId ?? '',
    );
  }

  /**
   * PUT /players/:profileId/availability — set (replace) availability slots for a profile.
   *
   * Full replacement: existing slots are deleted and replaced with the new list.
   * Caller must own the profile (or be the parent of the child profile).
   * A parent CANNOT edit another parent's child profile (403 AVAILABILITY_ACCESS_DENIED).
   * Advisory (BR-015): setting availability does not hard-block scheduling.
   */
  @Put('players/:profileId/availability')
  @Roles('PLAYER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set player availability slots (BR-015 advisory, full replace)' })
  async setPlayerAvailability(
    @Req() req: Request,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    const principal = getPrincipal(req);
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return this.availabilityService.setPlayerAvailability(
      profileId,
      principal.id,
      (principal as SessionPrincipal & { trainerId?: string }).trainerId ?? '',
      dto,
    );
  }
}
