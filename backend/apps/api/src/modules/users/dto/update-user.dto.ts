import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  MaxLength,
  IsPhoneNumber,
  IsEnum,
} from 'class-validator';
import { UserStatus } from '../entities/user.entity';

/**
 * UpdateUserDto — email and role are intentionally omitted (immutable via this endpoint).
 */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: '+12025551234' })
  @IsOptional()
  @IsPhoneNumber()
  phone?: string;

  @ApiPropertyOptional({ enum: UserStatus })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}
