import { Test } from '@nestjs/testing';
import { PasswordService } from '../password.service';

describe('PasswordService', () => {
  let service: PasswordService;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [PasswordService],
    }).compile();
    service = mod.get(PasswordService);
  });

  it('hash returns an argon2 hash string', async () => {
    const hash = await service.hash('mypassword');
    expect(hash).toBeDefined();
    expect(hash).not.toEqual('mypassword');
    // argon2 hashes start with $argon2
    expect(hash).toMatch(/^\$argon2/);
  });

  it('verify returns true for correct password', async () => {
    const pw = 'correct-password';
    const hash = await service.hash(pw);
    const result = await service.verify(hash, pw);
    expect(result).toBe(true);
  });

  it('verify returns false for wrong password', async () => {
    const hash = await service.hash('correct-password');
    const result = await service.verify(hash, 'wrong-password');
    expect(result).toBe(false);
  });

  it('produces different hashes for same password (unique salts)', async () => {
    const pw = 'same-password';
    const hash1 = await service.hash(pw);
    const hash2 = await service.hash(pw);
    expect(hash1).not.toEqual(hash2);
    // Both should verify
    expect(await service.verify(hash1, pw)).toBe(true);
    expect(await service.verify(hash2, pw)).toBe(true);
  });
});
