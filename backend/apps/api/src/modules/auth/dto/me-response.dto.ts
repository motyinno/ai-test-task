import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../users/entities/user.entity';

export class ActiveContextDto {
  @ApiProperty()
  profileId?: string;

  @ApiPropertyOptional()
  trainerId?: string;

  @ApiProperty()
  label?: string;
}

export class MeResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  isChild!: boolean;

  @ApiPropertyOptional()
  parentUserId?: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiProperty()
  mustChangePassword!: boolean;

  @ApiPropertyOptional()
  impersonatedBy?: string;

  @ApiPropertyOptional({ type: () => ActiveContextDto })
  activeContext?: ActiveContextDto;
}
