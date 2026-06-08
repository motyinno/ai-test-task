import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { UserRole, UserStatus } from '../entities/user.entity';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  /** "Deleted User" when anonymized */
  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({ description: 'ISO timestamp; presence implies irreversible anonymization' })
  anonymizedAt?: string;

  @ApiPropertyOptional()
  lastLoginAt?: string;

  @ApiProperty()
  createdAt!: string;

  @Exclude()
  passwordHash?: string;
}

export class PageMetaDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class PaginatedUsersDto {
  @ApiProperty({ type: [UserResponseDto] })
  data!: UserResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta!: PageMetaDto;
}
