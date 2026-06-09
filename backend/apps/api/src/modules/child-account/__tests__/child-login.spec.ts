/**
 * D5: ChildAccountService — child sub-login authentication.
 *
 * GENUINE tests:
 *  1. Valid child credentials → returns constrained principal (isChild=true, parentUserId set).
 *  2. Wrong password → UnauthorizedException.
 *  3. Unknown username → UnauthorizedException.
 *  4. Inactive child login → UnauthorizedException.
 *  5. Missing profile (misconfigured) → UnauthorizedException.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException } from '@nestjs/common';
import { ChildAccountService } from '../child-account.service';
import { ChildLogin } from '../entities/child-login.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { PasswordService } from '../../../shared/crypto/password.service';

const CHILD_PROFILE_ID = 'aaaaaaaa-1111-0000-0000-000000000001';
const PARENT_USER_ID = 'bbbbbbbb-2222-0000-0000-000000000002';
const CHILD_USERNAME = 'maya_smith';
const CHILD_PASSWORD = 'ChildPass123!';
const HASHED_PASSWORD = 'argon2_hash_placeholder';

function makeChildLogin(overrides: Partial<ChildLogin> = {}): ChildLogin {
  return {
    id: 'cccccccc-3333-0000-0000-000000000003',
    childProfileId: CHILD_PROFILE_ID,
    parentUserId: PARENT_USER_ID,
    childUsername: CHILD_USERNAME,
    passwordHash: HASHED_PASSWORD,
    tokenSpendAllowed: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return {
    id: CHILD_PROFILE_ID,
    userId: 'dddddddd-4444-0000-0000-000000000004',
    parentUserId: PARENT_USER_ID,
    name: 'Maya',
    dateOfBirth: '2016-03-01', // derived age ~10 (Q-01.02)
    gender: 'FEMALE',
    school: null,
    jerseyNumber: null,
    skillLevel: null,
    photoUrl: null,
    isChild: true,
    allowTokenSpendWithoutApproval: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ChildAccountService', () => {
  let service: ChildAccountService;
  let childLoginRepo: { findOne: jest.Mock };
  let playerProfileRepo: { findOne: jest.Mock };
  let passwordService: { verify: jest.Mock; hash: jest.Mock };

  beforeEach(async () => {
    childLoginRepo = { findOne: jest.fn() };
    playerProfileRepo = { findOne: jest.fn() };
    passwordService = {
      verify: jest.fn(),
      hash: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChildAccountService,
        { provide: getRepositoryToken(ChildLogin), useValue: childLoginRepo },
        { provide: getRepositoryToken(PlayerProfile), useValue: playerProfileRepo },
        { provide: PasswordService, useValue: passwordService },
      ],
    }).compile();

    service = module.get(ChildAccountService);
  });

  // ── Test 1: Valid credentials → constrained principal ────────────────────

  it('[D5] valid credentials → constrained principal with isChild=true', async () => {
    const login = makeChildLogin();
    const profile = makeProfile();

    childLoginRepo.findOne.mockResolvedValue(login);
    passwordService.verify.mockResolvedValue(true);
    playerProfileRepo.findOne.mockResolvedValue(profile);

    const result = await service.validateChildCredentials(CHILD_USERNAME, CHILD_PASSWORD);

    // GENUINE: principal must have isChild=true and correct parentUserId
    expect(result.isChild).toBe(true);
    expect(result.parentUserId).toBe(PARENT_USER_ID);
    expect(result.childProfileId).toBe(CHILD_PROFILE_ID);
    expect(result.role).toBe('PLAYER');
    // ID must be prefixed with "child:" so the session can distinguish child from parent
    expect(result.id).toMatch(/^child:/);
  });

  // ── Test 2: Wrong password → 401 ─────────────────────────────────────────

  it('[D5] wrong password → UnauthorizedException', async () => {
    const login = makeChildLogin();
    childLoginRepo.findOne.mockResolvedValue(login);
    passwordService.verify.mockResolvedValue(false); // wrong password

    await expect(
      service.validateChildCredentials(CHILD_USERNAME, 'wrongpassword'),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Test 3: Unknown username → 401 ───────────────────────────────────────

  it('[D5] unknown username → UnauthorizedException', async () => {
    childLoginRepo.findOne.mockResolvedValue(null); // not found

    await expect(
      service.validateChildCredentials('unknown_user', CHILD_PASSWORD),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Test 4: Inactive child login → 401 ───────────────────────────────────

  it('[D5] inactive child login → UnauthorizedException', async () => {
    // findOne with isActive=true returns null for an inactive login
    childLoginRepo.findOne.mockResolvedValue(null); // because we filter isActive: true

    await expect(
      service.validateChildCredentials(CHILD_USERNAME, CHILD_PASSWORD),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Test 5: Missing profile (misconfigured) → 401 ────────────────────────

  it('[D5] missing player profile (misconfigured child login) → UnauthorizedException', async () => {
    const login = makeChildLogin();
    childLoginRepo.findOne.mockResolvedValue(login);
    passwordService.verify.mockResolvedValue(true);
    playerProfileRepo.findOne.mockResolvedValue(null); // profile missing

    await expect(
      service.validateChildCredentials(CHILD_USERNAME, CHILD_PASSWORD),
    ).rejects.toThrow(UnauthorizedException);
  });

  // ── Test 6: tokenSpendAllowed reflected in principal ─────────────────────

  it('[D5] tokenSpendAllowed=true is reflected in child principal', async () => {
    const login = makeChildLogin({ tokenSpendAllowed: true });
    const profile = makeProfile();

    childLoginRepo.findOne.mockResolvedValue(login);
    passwordService.verify.mockResolvedValue(true);
    playerProfileRepo.findOne.mockResolvedValue(profile);

    const result = await service.validateChildCredentials(CHILD_USERNAME, CHILD_PASSWORD);

    expect(result.tokenSpendAllowed).toBe(true);
  });
});
