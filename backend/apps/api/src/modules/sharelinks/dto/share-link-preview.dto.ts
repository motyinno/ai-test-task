import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareLinkType } from '../entities/share-link.entity';

/**
 * Public preview DTO for the GET /sharelinks/:code/validate endpoint.
 * SECURITY: targetEmail is intentionally omitted — this is a public (unauthenticated)
 * endpoint; returning the invited coach's email would expose PII to any code holder.
 * Spec advisory display: { valid, type, trainerName } only.
 */
export class ShareLinkPreviewDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ enum: ShareLinkType }) type!: ShareLinkType;
  @ApiPropertyOptional() trainerName?: string;
}
