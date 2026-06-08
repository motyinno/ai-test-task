import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { ShareLinksService } from './sharelinks.service';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { ShareLinkResponseDto, PaginatedShareLinksDto } from './dto/share-link-response.dto';
import { ShareLinkListQueryDto } from './dto/share-link-list-query.dto';
import { ShareLinkPreviewDto } from './dto/share-link-preview.dto';
import { ShareLink } from './entities/share-link.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TrainerProfile } from '../users/entities/trainer-profile.entity';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  trainerId?: string;
}

@ApiTags('ShareLinks')
@Controller('sharelinks')
export class ShareLinksController {
  constructor(
    private readonly shareLinksService: ShareLinksService,
    @InjectRepository(TrainerProfile)
    private readonly trainerProfileRepo: Repository<TrainerProfile>,
  ) {}

  // ─── POST /sharelinks — trainer creates a link ─────────────────────────────

  @Post()
  @Roles('TRAINER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a share link (STATIC or UNIQUE)' })
  async create(
    @Body() dto: CreateShareLinkDto,
    @Req() req: Request,
  ): Promise<ShareLinkResponseDto> {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal;
    const link = await this.shareLinksService.generate(dto, {
      trainerId: principal.trainerId!,
      userId: principal.id,
    });
    return this.toResponseDto(link);
  }

  // ─── GET /sharelinks — list trainer's links ────────────────────────────────

  @Get()
  @Roles('TRAINER')
  @ApiOperation({ summary: 'List share links for the authenticated trainer' })
  async list(@Query() query: ShareLinkListQueryDto): Promise<PaginatedShareLinksDto> {
    const { data, total } = await this.shareLinksService.list(query.page, query.limit);
    return {
      data: data.map((l) => this.toResponseDto(l)),
      meta: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    };
  }

  // ─── POST /sharelinks/:id/revoke — revoke a link ──────────────────────────

  @Post(':id/revoke')
  @Roles('TRAINER')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a share link' })
  async revoke(@Param('id', ParseUUIDPipe) id: string): Promise<ShareLinkResponseDto> {
    const link = await this.shareLinksService.revoke(id);
    return this.toResponseDto(link);
  }

  // ─── GET /sharelinks/:code/validate — public validation ───────────────────

  @Get(':code/validate')
  // No @Roles — public endpoint; visitor has no trainer context
  @ApiOperation({ summary: 'Validate a share link (public, no auth required)' })
  async validate(@Param('code') code: string): Promise<ShareLinkPreviewDto> {
    // resolveLink throws the appropriate HTTP exception if link is invalid
    const link = await this.shareLinksService.resolveLink(code);

    // Look up trainer name for the preview (advisory display only)
    const trainerProfile = await this.trainerProfileRepo.findOne({
      where: { userId: link.trainerId },
    });

    // SECURITY (C-1): targetEmail is intentionally NOT returned here.
    // This is a public unauthenticated endpoint; including the invited coach's
    // email would expose PII to any holder of the code.
    return {
      valid: true,
      type: link.type,
      trainerName: trainerProfile?.trainerName,
    };
  }

  // ─── Mapper ───────────────────────────────────────────────────────────────

  private toResponseDto(link: ShareLink): ShareLinkResponseDto {
    return {
      id: link.id,
      code: link.code,
      url: `/api/v1/join/${link.code}`,
      type: link.type,
      trainerId: link.trainerId,
      targetEmail: link.targetEmail,
      expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
      maxUses: link.maxUses,
      useCount: link.useCount,
      active: link.active,
      createdAt: link.createdAt.toISOString(),
    };
  }
}
