import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShareLinkType } from '../entities/share-link.entity';

export class ShareLinkResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() code!: string;
  @ApiProperty({ description: 'Full, shareable join URL (frontend page, e.g. https://app/join/:code)' }) url!: string;
  @ApiProperty({ enum: ShareLinkType }) type!: ShareLinkType;
  @ApiProperty() trainerId!: string;
  @ApiPropertyOptional() targetEmail: string | null = null;
  @ApiPropertyOptional() expiresAt: string | null = null;
  @ApiPropertyOptional() maxUses: number | null = null;
  @ApiProperty() useCount!: number;
  @ApiProperty() active!: boolean;
  @ApiProperty() createdAt!: string;
}

export class PaginatedShareLinksDto {
  data!: ShareLinkResponseDto[];
  meta!: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
