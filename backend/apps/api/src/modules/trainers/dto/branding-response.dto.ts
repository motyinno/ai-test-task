/**
 * BrandingResponseDto — response shape for GET/PUT /trainers/me/branding (G1).
 */
export class BrandingResponseDto {
  id!: string;
  trainerId!: string;
  primaryColorHex!: string;
  logoUrl: string | null = null;
  createdAt!: string;
  updatedAt!: string;
}
