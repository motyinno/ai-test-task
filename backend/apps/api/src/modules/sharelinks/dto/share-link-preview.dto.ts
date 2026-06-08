import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareLinkType } from '../entities/share-link.entity';

export class ShareLinkPreviewDto {
  @ApiProperty() valid!: boolean;
  @ApiProperty({ enum: ShareLinkType }) type!: ShareLinkType;
  @ApiPropertyOptional() trainerName?: string;
  @ApiPropertyOptional() targetEmail: string | null = null;
}
