import { IsString, Matches, IsOptional, IsUrl, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * UpdateBrandingDto — payload for PUT /trainers/me/branding (G1).
 *
 * Validation:
 *   - primaryColorHex: must match /^#[0-9A-Fa-f]{6}$/ (full 6-digit CSS hex)
 *   - logoUrl: optional valid URL (set via the separate logo-upload endpoint)
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({
    description: 'CSS hex colour code for the trainer portal (e.g. "#FF5A1F")',
    example: '#FF5A1F',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColorHex must be a valid 6-digit CSS hex colour (e.g. "#FF5A1F")',
  })
  primaryColorHex?: string;

  @ApiPropertyOptional({
    description: 'Logo URL (set automatically after a logo upload)',
    example: 'https://storage.example.com/logos/abc123.png',
  })
  @IsOptional()
  @IsUrl({}, { message: 'logoUrl must be a valid URL' })
  @MaxLength(2048)
  logoUrl?: string;
}
