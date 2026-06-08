import { ApiProperty } from '@nestjs/swagger';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

export class CoachInvitationDto {
  @ApiProperty() id!: string;              // ShareLink id
  @ApiProperty() targetEmail!: string;
  @ApiProperty({ enum: ['PENDING', 'ACCEPTED', 'EXPIRED'] })
  status!: InvitationStatus;
  @ApiProperty() expiresAt!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty() useCount!: number;
  @ApiProperty() active!: boolean;
}
