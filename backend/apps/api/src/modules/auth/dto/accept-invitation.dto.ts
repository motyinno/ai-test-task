import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsStrongPassword } from 'class-validator';

export class AcceptInvitationDto {
  @ApiProperty()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8 })
  @IsStrongPassword()
  password!: string;
}
