import { Injectable, BadRequestException } from '@nestjs/common';
import { StorageService } from '../../shared/integrations/storage/storage.service';
import { PortalBrandingRepository } from './portal-branding.repository';
import { UpdateBrandingDto } from './dto/update-branding.dto';
import { BrandingResponseDto } from './dto/branding-response.dto';
import { PortalBranding } from './entities/portal-branding.entity';

const ALLOWED_LOGO_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/svg+xml'];
const MAX_LOGO_SIZE_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * BrandingService — business logic for trainer portal branding (G1).
 *
 * GET /trainers/me/branding  → getBranding
 * PUT /trainers/me/branding  → updateBranding
 * POST /trainers/me/branding/logo → uploadLogo
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly brandingRepo: PortalBrandingRepository,
    private readonly storageService: StorageService,
  ) {}

  /**
   * GET /trainers/me/branding
   *
   * Returns the trainer's branding, or a default object if none exists.
   * Never returns null/404 — callers always get a shape.
   */
  async getBranding(trainerId: string): Promise<BrandingResponseDto> {
    const branding = await this.brandingRepo.findByTrainerId(trainerId);
    if (!branding) {
      // Return defaults — row will be created on first PUT
      return {
        id: '',
        trainerId,
        primaryColorHex: '#2563EB',
        logoUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    return this.toDto(branding);
  }

  /**
   * PUT /trainers/me/branding
   *
   * Upserts the trainer's branding. At least one field must be provided.
   * Hex format validated by DTO; this method handles persistence.
   */
  async updateBranding(trainerId: string, dto: UpdateBrandingDto): Promise<BrandingResponseDto> {
    const updates: Partial<PortalBranding> = {};
    if (dto.primaryColorHex !== undefined) updates.primaryColorHex = dto.primaryColorHex;
    if (dto.logoUrl !== undefined) updates.logoUrl = dto.logoUrl;

    const branding = await this.brandingRepo.upsert(trainerId, updates);
    return this.toDto(branding);
  }

  /**
   * POST /trainers/me/branding/logo
   *
   * Validates + uploads a logo via StorageService.
   * Accepted types: PNG, JPG/JPEG, SVG (≤2MB).
   * After upload, updates the trainer's branding.logoUrl.
   * Returns { logoUrl }.
   */
  async uploadLogo(
    trainerId: string,
    file: { originalName: string; buffer: Buffer; mimeType: string; size: number },
  ): Promise<{ logoUrl: string }> {
    // Validate MIME type
    if (!ALLOWED_LOGO_MIME_TYPES.includes(file.mimeType)) {
      throw new BadRequestException({
        message: 'Logo must be a PNG, JPEG, or SVG file',
        errorCode: 'INVALID_FILE_TYPE',
      });
    }

    // Validate file size
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      throw new BadRequestException({
        message: 'Logo file must be ≤ 2MB',
        errorCode: 'FILE_TOO_LARGE',
      });
    }

    const result = await this.storageService.put(
      {
        originalName: file.originalName,
        buffer: file.buffer,
        mimeType: file.mimeType,
        size: file.size,
      },
      `logos/${trainerId}`,
    );

    // Update the trainer's branding row with the new URL
    await this.brandingRepo.upsert(trainerId, { logoUrl: result.url });

    return { logoUrl: result.url };
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────

  private toDto(b: PortalBranding): BrandingResponseDto {
    return {
      id: b.id,
      trainerId: b.trainerId,
      primaryColorHex: b.primaryColorHex,
      logoUrl: b.logoUrl,
      createdAt: b.createdAt.toISOString(),
      updatedAt: b.updatedAt.toISOString(),
    };
  }
}
