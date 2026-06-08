import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'trainer@example.com' })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  password!: string;
}
