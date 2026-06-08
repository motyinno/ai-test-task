import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

/** GDPR audit reason — required for DELETE /users/:id */
export class DeleteUserDto {
  @ApiProperty({ example: 'User requested account deletion under GDPR Art.17' })
  @IsNotEmpty()
  reason!: string;
}
