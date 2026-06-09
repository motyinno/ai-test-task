import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, MaxLength, Matches } from 'class-validator';

/**
 * LoginDto — accepts both standard email and child sub-login credentials.
 *
 * For child sub-login (D5): email field carries "child:<childUsername>" prefix.
 * The Passport LocalStrategy routes based on this prefix.
 *
 * Pattern accepts:
 *   - Standard email: foo@bar.com
 *   - Child username: child:<alphanumeric + underscore/hyphen>
 */
export class LoginDto {
  @ApiProperty({
    example: 'trainer@example.com',
    description: 'User email OR "child:<childUsername>" for child sub-login',
  })
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^(child:[a-zA-Z0-9_.-]{1,50}|[^@\s]+@[^@\s]+\.[^@\s]+)$/, {
    message: 'email must be a valid email address or child login in format child:<username>',
  })
  email!: string;

  @ApiProperty()
  @IsNotEmpty()
  password!: string;
}
