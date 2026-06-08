import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

/**
 * Password hashing service using argon2 (SEC-001).
 * Wraps argon2.hash / argon2.verify with sensible defaults.
 */
@Injectable()
export class PasswordService {
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MiB
      timeCost: 3,
      parallelism: 1,
    });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }
}
