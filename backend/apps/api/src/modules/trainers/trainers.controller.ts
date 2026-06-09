import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Query,
  Req,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags, ApiCookieAuth, ApiConsumes } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../../shared/authz/roles.decorator';
import { AvailabilityService } from '../availability/availability.service';
import { PlayerAvailabilityQueryDto } from '../availability/dto/player-availability-query.dto';
import { BrandingService } from './branding.service';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { BrandingResponseDto } from './dto/branding-response.dto';

type SessionRecord = Record<string, unknown>;
interface SessionPrincipal {
  id: string;
  role: string;
  trainerId?: string;
}

const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * TrainersController — trainer-facing endpoints.
 *
 * All routes require TRAINER role and are tenant-scoped to the caller's org.
 *
 * Phase E endpoints:
 *   GET /trainers/me/players/availability — player availability view + filter (FR-051, E4)
 *
 * Phase G endpoints (G1):
 *   GET  /trainers/me/branding              — get portal branding
 *   PUT  /trainers/me/branding              — update portal branding (hex + logoUrl)
 *   POST /trainers/me/branding/logo         — upload logo (PNG/JPG/SVG ≤ 2MB)
 */
@ApiTags('Trainers')
@ApiCookieAuth('session')
@Controller('trainers')
export class TrainersController {
  constructor(
    private readonly availabilityService: AvailabilityService,
    private readonly brandingService: BrandingService,
  ) {}

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private getPrincipal(req: Request): SessionPrincipal {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as SessionPrincipal | undefined;
    if (!principal?.id) throw new UnauthorizedException('Not authenticated');
    return principal;
  }

  private getTrainerId(req: Request): string {
    const principal = this.getPrincipal(req);
    if (!principal.trainerId) throw new UnauthorizedException('Trainer context required');
    return principal.trainerId;
  }

  // ─── E4: Trainer player availability view ─────────────────────────────────

  /**
   * GET /trainers/me/players/availability — view player availability for the trainer's org.
   */
  @Get('me/players/availability')
  @Roles('TRAINER')
  @ApiOperation({
    summary: 'View player availability summary for the trainer org (FR-051)',
    description:
      'Returns paginated availability slots for all players in the trainer org. ' +
      'Optionally filter by day of week and/or time window. ' +
      "Tenant-scoped: only the calling trainer's org players are returned.",
  })
  async getPlayerAvailability(
    @Req() req: Request,
    @Query() query: PlayerAvailabilityQueryDto,
  ) {
    const trainerId = this.getTrainerId(req);
    return this.availabilityService.getTrainerPlayerAvailability(trainerId, query);
  }

  // ─── G1: Branding ─────────────────────────────────────────────────────────

  /**
   * GET /trainers/me/branding — fetch trainer portal branding.
   *
   * Returns the trainer's current branding (or defaults if none has been set).
   * Tenant-scoped: a trainer can only read their own branding.
   */
  @Get('me/branding')
  @Roles('TRAINER')
  @ApiOperation({
    summary: "Get trainer portal branding (G1)",
    description:
      "Returns the trainer's portal branding: primary colour + logo URL. " +
      'Defaults are returned if no branding has been set yet. ' +
      'Tenant-scoped.',
  })
  async getBranding(@Req() req: Request): Promise<BrandingResponseDto> {
    const trainerId = this.getTrainerId(req);
    return this.brandingService.getBranding(trainerId);
  }

  /**
   * PUT /trainers/me/branding — update trainer portal branding.
   *
   * Accepts primaryColorHex (validated hex) and/or logoUrl.
   * Creates the branding row on first call (upsert).
   * Tenant isolation: a trainer can only update their own branding (400 if another trainer
   * tries to manipulate via doctored session is prevented at the service layer via trainerId).
   */
  @Put('me/branding')
  @Roles('TRAINER')
  @HttpCode(200)
  @ApiOperation({
    summary: "Update trainer portal branding (G1)",
    description:
      'Upserts the trainer branding: primaryColorHex (must match /^#[0-9A-Fa-f]{6}$/) ' +
      'and/or logoUrl. Returns the updated branding object.',
  })
  async updateBranding(
    @Req() req: Request,
    @Body() dto: UpdateBrandingDto,
  ): Promise<BrandingResponseDto> {
    const trainerId = this.getTrainerId(req);
    return this.brandingService.updateBranding(trainerId, dto);
  }

  /**
   * POST /trainers/me/branding/logo — upload portal logo.
   *
   * Accepts multipart/form-data with field name `logo`.
   * Allowed types: PNG, JPEG, SVG. Max size: 2MB.
   * Returns { logoUrl } — the URL stored via StorageService.
   */
  @Post('me/branding/logo')
  @Roles('TRAINER')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: "Upload trainer portal logo (G1)",
    description:
      'Uploads a logo for the trainer portal. ' +
      'Accepted types: PNG, JPEG, SVG. Maximum size: 2MB. ' +
      'Returns { logoUrl } and updates the branding row.',
  })
  @UseInterceptors(
    // No multer fileSize limit here — size validation done in controller to return 400 (not 413).
    // A generous limit prevents OOM on truly huge uploads while still letting the controller
    // reject > 2MB with the proper errorCode.
    FileInterceptor('logo', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB hard cap at transport level
    }),
  )
  async uploadLogo(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ logoUrl: string }> {
    if (!file) {
      throw new BadRequestException({ message: 'File is required', errorCode: 'FILE_REQUIRED' });
    }
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        message: 'Logo must be a PNG, JPEG, or SVG file',
        errorCode: 'INVALID_FILE_TYPE',
      });
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException({
        message: 'Logo file must be ≤ 2MB',
        errorCode: 'FILE_TOO_LARGE',
      });
    }

    const trainerId = this.getTrainerId(req);
    return this.brandingService.uploadLogo(trainerId, {
      originalName: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      size: file.size,
    });
  }
}
