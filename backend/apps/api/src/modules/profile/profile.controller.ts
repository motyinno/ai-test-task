import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
  UnauthorizedException,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiCookieAuth, ApiConsumes } from '@nestjs/swagger';
import type { Request } from 'express';
import { ProfileService } from './profile.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponseDto } from './dto/profile-response.dto';

type SessionRecord = Record<string, unknown>;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB for profile photos

@ApiTags('profile')
@ApiCookieAuth('session')
@Controller('me/profile')
@UseGuards(SessionAuthGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  private getPrincipalId(req: Request): string {
    const session = req.session as unknown as SessionRecord;
    const principal = session['principal'] as { id: string } | undefined;
    if (!principal?.id) throw new UnauthorizedException();
    return principal.id;
  }

  /**
   * GET /me/profile — get own role-specific profile.
   */
  @Get()
  async getProfile(@Req() req: Request): Promise<ProfileResponseDto> {
    return this.profileService.getProfile(this.getPrincipalId(req));
  }

  /**
   * PATCH /me/profile — update own profile (email/role read-only).
   */
  @Patch()
  @HttpCode(200)
  async updateProfile(
    @Req() req: Request,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.profileService.updateProfile(this.getPrincipalId(req), dto);
  }

  /**
   * POST /me/profile/photo — upload photo (multipart/form-data).
   * Returns { photoUrl, thumbnailUrl }.
   * 400 on invalid type/size.
   */
  @Post('photo')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('photo', {
      limits: { fileSize: MAX_FILE_SIZE_BYTES },
    }),
  )
  async uploadPhoto(
    @Req() req: Request,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<{ photoUrl: string; thumbnailUrl?: string }> {
    if (!file) {
      throw new BadRequestException({ message: 'File is required', errorCode: 'FILE_REQUIRED' });
    }
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        message: 'Only JPEG and PNG files are allowed',
        errorCode: 'INVALID_FILE_TYPE',
      });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException({
        message: 'File too large (max 5MB)',
        errorCode: 'FILE_TOO_LARGE',
      });
    }

    return this.profileService.uploadPhoto(this.getPrincipalId(req), {
      originalName: file.originalname,
      buffer: file.buffer,
      mimeType: file.mimetype,
      size: file.size,
    });
  }
}
