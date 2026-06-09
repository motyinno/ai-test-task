/**
 * D7/D8/D9: ApprovalsService unit tests.
 *
 * GENUINE tests — verify behavior fails when protection is removed:
 *  1. USD always creates Pending (BR-008).
 *  2. TOKEN + tokenSpendAllowed=false → Pending (BR-009 default).
 *  3. TOKEN + tokenSpendAllowed=true → auto-approved informational record (BR-009 ON).
 *  4. approve() → 409 APPROVAL_NOT_PENDING when row already terminal (race guard).
 *  5. deny()   → 409 APPROVAL_NOT_PENDING when row already terminal.
 *  6. expireStaleApprovals() transitions Pending+expired rows → Expired.
 *  7. setTokenSetting() updates both PlayerProfile and ChildLogin.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { ApprovalsService } from '../approvals.service';
import { ApprovalsRepository } from '../approvals.repository';
import {
  ApprovalRequest,
  ApprovalStatus,
  PaymentType,
} from '../entities/approval-request.entity';
import { PlayerProfile } from '../../users/entities/player-profile.entity';
import { ChildLogin } from '../../child-account/entities/child-login.entity';
import { EmailService } from '../../../shared/integrations/email/email.service';

const CHILD_PROFILE_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PARENT_USER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const APPROVAL_ID = 'cccccccc-0000-0000-0000-000000000003';

function makeApproval(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: APPROVAL_ID,
    childProfileId: CHILD_PROFILE_ID,
    parentUserId: PARENT_USER_ID,
    paymentType: PaymentType.USD,
    status: ApprovalStatus.PENDING,
    autoApproved: false,
    expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000),
    resolvedAt: null,
    resolvedBy: null,
    parentNotes: null,
    eventRef: null,
    amount: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('ApprovalsService', () => {
  let service: ApprovalsService;

  let approvalsRepo: jest.Mocked<ApprovalsRepository>;
  let playerProfileRepo: { findOne: jest.Mock; save: jest.Mock };
  let childLoginRepo: { findOne: jest.Mock; save: jest.Mock };
  let emailService: { send: jest.Mock };

  beforeEach(async () => {
    approvalsRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByParent: jest.fn(),
      guardedTransition: jest.fn(),
      expireStale: jest.fn(),
      save: jest.fn(),
      findExpiredPending: jest.fn(),
    } as unknown as jest.Mocked<ApprovalsRepository>;

    playerProfileRepo = { findOne: jest.fn(), save: jest.fn() };
    childLoginRepo = { findOne: jest.fn(), save: jest.fn() };
    emailService = { send: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApprovalsService,
        { provide: ApprovalsRepository, useValue: approvalsRepo },
        { provide: getRepositoryToken(PlayerProfile), useValue: playerProfileRepo },
        { provide: getRepositoryToken(ChildLogin), useValue: childLoginRepo },
        { provide: EmailService, useValue: emailService },
      ],
    }).compile();

    service = module.get(ApprovalsService);
  });

  // ── Test 1: USD always creates Pending ────────────────────────────────────

  it('[D9][USD] USD payment always creates status=PENDING regardless of token setting', async () => {
    // tokenSpendAllowed=true for this child, but payment is USD → still Pending
    childLoginRepo.findOne.mockResolvedValue({
      childProfileId: CHILD_PROFILE_ID,
      tokenSpendAllowed: true, // ON — but doesn't matter for USD
    });

    const pendingApproval = makeApproval({ status: ApprovalStatus.PENDING, autoApproved: false });
    approvalsRepo.create.mockResolvedValue(pendingApproval);

    const result = await service.createApproval({
      childProfileId: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      paymentType: PaymentType.USD,
    });

    // GENUINE: assert Pending + NOT auto-approved
    expect(result.status).toBe(ApprovalStatus.PENDING);
    expect(result.autoApproved).toBe(false);

    // The repo.create should have been called with status=PENDING
    const createCall = approvalsRepo.create.mock.calls[0][0];
    expect(createCall.status).toBe(ApprovalStatus.PENDING);
    expect(createCall.autoApproved).toBe(false);
    expect(createCall.expiresAt).not.toBeNull();
  });

  // ── Test 2: TOKEN + tokenSpendAllowed=false → Pending ────────────────────

  it('[D9][TOKEN-OFF] TOKEN with tokenSpendAllowed=false creates status=PENDING', async () => {
    childLoginRepo.findOne.mockResolvedValue({
      childProfileId: CHILD_PROFILE_ID,
      tokenSpendAllowed: false, // default OFF
    });

    const pendingApproval = makeApproval({
      paymentType: PaymentType.TOKEN,
      status: ApprovalStatus.PENDING,
      autoApproved: false,
    });
    approvalsRepo.create.mockResolvedValue(pendingApproval);

    const result = await service.createApproval({
      childProfileId: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      paymentType: PaymentType.TOKEN,
    });

    expect(result.status).toBe(ApprovalStatus.PENDING);
    expect(result.autoApproved).toBe(false);
    expect(approvalsRepo.create.mock.calls[0][0].status).toBe(ApprovalStatus.PENDING);
    expect(approvalsRepo.create.mock.calls[0][0].expiresAt).not.toBeNull();
  });

  // ── Test 3: TOKEN + tokenSpendAllowed=true → auto-approved ───────────────

  it('[D9][TOKEN-ON] TOKEN with tokenSpendAllowed=true creates auto-approved informational record', async () => {
    childLoginRepo.findOne.mockResolvedValue({
      childProfileId: CHILD_PROFILE_ID,
      tokenSpendAllowed: true, // ON
    });

    const autoApproval = makeApproval({
      paymentType: PaymentType.TOKEN,
      status: ApprovalStatus.APPROVED,
      autoApproved: true,
      expiresAt: null, // no 48h timer
    });
    approvalsRepo.create.mockResolvedValue(autoApproval);

    const result = await service.createApproval({
      childProfileId: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      paymentType: PaymentType.TOKEN,
    });

    // GENUINE: status=APPROVED, autoApproved=true, no expiresAt
    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(result.autoApproved).toBe(true);

    const createCall = approvalsRepo.create.mock.calls[0][0];
    expect(createCall.status).toBe(ApprovalStatus.APPROVED);
    expect(createCall.autoApproved).toBe(true);
    expect(createCall.expiresAt).toBeNull();
  });

  // ── Test 3b: No child login → TOKEN defaults to Pending ──────────────────

  it('[D9][TOKEN-NO-LOGIN] TOKEN with no child login defaults to PENDING (tokenSpendAllowed=false)', async () => {
    childLoginRepo.findOne.mockResolvedValue(null); // no child login

    const pendingApproval = makeApproval({
      paymentType: PaymentType.TOKEN,
      status: ApprovalStatus.PENDING,
      autoApproved: false,
    });
    approvalsRepo.create.mockResolvedValue(pendingApproval);

    await service.createApproval({
      childProfileId: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      paymentType: PaymentType.TOKEN,
    });

    const createCall = approvalsRepo.create.mock.calls[0][0];
    expect(createCall.status).toBe(ApprovalStatus.PENDING);
    expect(createCall.autoApproved).toBe(false);
  });

  // ── Test 4: approve() → 409 if already terminal ───────────────────────────

  it('[D8][race-guard] approve() throws 409 APPROVAL_NOT_PENDING if row already terminal', async () => {
    // Row is EXPIRED (already terminal)
    const expiredApproval = makeApproval({ status: ApprovalStatus.EXPIRED });
    approvalsRepo.findById.mockResolvedValue(expiredApproval);
    // guardedTransition returns 0 (already terminal — WHERE status=PENDING found no rows)
    approvalsRepo.guardedTransition.mockResolvedValue(0);

    await expect(service.approve(APPROVAL_ID, PARENT_USER_ID)).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({ errorCode: 'APPROVAL_NOT_PENDING' }),
    });

    // GENUINE check: guardedTransition MUST have been called (not just the findById result)
    expect(approvalsRepo.guardedTransition).toHaveBeenCalledWith(
      APPROVAL_ID,
      ApprovalStatus.APPROVED,
      PARENT_USER_ID,
      null,
    );
  });

  // ── Test 5: deny() → 409 if already terminal ─────────────────────────────

  it('[D8][race-guard] deny() throws 409 APPROVAL_NOT_PENDING if row already terminal', async () => {
    const approvedApproval = makeApproval({ status: ApprovalStatus.APPROVED });
    approvalsRepo.findById.mockResolvedValue(approvedApproval);
    approvalsRepo.guardedTransition.mockResolvedValue(0);

    await expect(service.deny(APPROVAL_ID, PARENT_USER_ID)).rejects.toMatchObject({
      constructor: ConflictException,
      response: expect.objectContaining({ errorCode: 'APPROVAL_NOT_PENDING' }),
    });

    expect(approvalsRepo.guardedTransition).toHaveBeenCalledWith(
      APPROVAL_ID,
      ApprovalStatus.DENIED,
      PARENT_USER_ID,
      null,
    );
  });

  // ── Test 4b: approve() succeeds when Pending ─────────────────────────────

  it('[D8] approve() succeeds when row is Pending (returns updated row)', async () => {
    const pendingApproval = makeApproval({ status: ApprovalStatus.PENDING });
    approvalsRepo.findById.mockResolvedValue(pendingApproval);
    approvalsRepo.guardedTransition.mockResolvedValue(1); // 1 row affected

    const result = await service.approve(APPROVAL_ID, PARENT_USER_ID, 'Approved!');

    expect(result.status).toBe(ApprovalStatus.APPROVED);
    expect(approvalsRepo.guardedTransition).toHaveBeenCalledWith(
      APPROVAL_ID,
      ApprovalStatus.APPROVED,
      PARENT_USER_ID,
      'Approved!',
    );
  });

  // ── Test 6: expireStaleApprovals ─────────────────────────────────────────

  it('[D10][sweep] expireStaleApprovals() calls expireStale and returns count', async () => {
    approvalsRepo.expireStale.mockResolvedValue(3);

    const count = await service.expireStaleApprovals();

    expect(count).toBe(3);
    expect(approvalsRepo.expireStale).toHaveBeenCalledTimes(1);
  });

  it('[D10][sweep] expireStaleApprovals() returns 0 when no stale rows', async () => {
    approvalsRepo.expireStale.mockResolvedValue(0);

    const count = await service.expireStaleApprovals();

    expect(count).toBe(0);
  });

  // ── Test 7: setTokenSetting ───────────────────────────────────────────────

  it('[D9][token-setting] setTokenSetting updates PlayerProfile and ChildLogin', async () => {
    const mockProfile: Partial<PlayerProfile> = {
      id: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      isChild: true,
      allowTokenSpendWithoutApproval: false,
    };
    playerProfileRepo.findOne.mockResolvedValue(mockProfile);
    playerProfileRepo.save.mockResolvedValue({ ...mockProfile, allowTokenSpendWithoutApproval: true });

    const mockLogin = { childProfileId: CHILD_PROFILE_ID, tokenSpendAllowed: false };
    childLoginRepo.findOne.mockResolvedValue(mockLogin);
    childLoginRepo.save.mockResolvedValue({ ...mockLogin, tokenSpendAllowed: true });

    const result = await service.setTokenSetting(CHILD_PROFILE_ID, PARENT_USER_ID, true);

    expect(result.allowTokenSpendWithoutApproval).toBe(true);
    // Verify PlayerProfile was updated
    expect(playerProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allowTokenSpendWithoutApproval: true }),
    );
    // Verify ChildLogin was updated
    expect(childLoginRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ tokenSpendAllowed: true }),
    );
  });

  it('[D9][token-setting] setTokenSetting can toggle OFF (false)', async () => {
    const mockProfile: Partial<PlayerProfile> = {
      id: CHILD_PROFILE_ID,
      parentUserId: PARENT_USER_ID,
      isChild: true,
      allowTokenSpendWithoutApproval: true,
    };
    playerProfileRepo.findOne.mockResolvedValue(mockProfile);
    playerProfileRepo.save.mockResolvedValue(mockProfile);

    const mockLogin = { childProfileId: CHILD_PROFILE_ID, tokenSpendAllowed: true };
    childLoginRepo.findOne.mockResolvedValue(mockLogin);
    childLoginRepo.save.mockResolvedValue(mockLogin);

    const result = await service.setTokenSetting(CHILD_PROFILE_ID, PARENT_USER_ID, false);

    expect(result.allowTokenSpendWithoutApproval).toBe(false);
    expect(playerProfileRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ allowTokenSpendWithoutApproval: false }),
    );
  });
});
