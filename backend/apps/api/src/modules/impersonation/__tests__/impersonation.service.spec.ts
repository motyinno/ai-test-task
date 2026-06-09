/**
 * ImpersonationService unit tests (F3–F5)
 *
 * Tests the service logic in isolation using mocked dependencies.
 * Covers the business-rule sanity checks required by the spec.
 */
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ImpersonationService, IMPERSONATION_CAP_MS } from '../impersonation.service';
import { ImpersonationRepository } from '../impersonation.repository';
import { SessionContextService } from '../../auth/session-context.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { User, UserRole, UserStatus } from '../../users/entities/user.entity';
import { ImpersonationLog } from '../entities/impersonation-log.entity';

const makeMockUser = (overrides: Partial<User> = {}): User => ({
  id: 'user-001',
  email: 'test@example.com',
  passwordHash: 'hash',
  role: UserRole.TRAINER,
  status: UserStatus.ACTIVE,
  emailVerified: true,
  mustChangePassword: false,
  anonymizedAt: null,
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeMockLog = (overrides: Partial<ImpersonationLog> = {}): ImpersonationLog => ({
  id: 'log-001',
  adminId: 'admin-001',
  impersonatedUserId: 'user-001',
  startAt: new Date(),
  endAt: null,
  durationSeconds: null,
  createdAt: new Date(),
  ...overrides,
});

describe('ImpersonationService', () => {
  let service: ImpersonationService;
  let userRepo: { findOne: jest.Mock };
  let impersonationRepo: jest.Mocked<Partial<ImpersonationRepository>>;
  let sessionCtx: jest.Mocked<Partial<SessionContextService>>;
  let auditService: jest.Mocked<Partial<AuditService>>;

  beforeEach(async () => {
    userRepo = { findOne: jest.fn() };
    impersonationRepo = {
      openBracket: jest.fn(),
      closeBracket: jest.fn(),
      findOpenBracket: jest.fn(),
      findPaginated: jest.fn(),
    };
    sessionCtx = {
      getImpersonation: jest.fn(),
      setImpersonation: jest.fn(),
      clearImpersonation: jest.fn(),
    };
    auditService = {
      write: jest.fn().mockResolvedValue({}),
    };

    const module = await Test.createTestingModule({
      providers: [
        ImpersonationService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: ImpersonationRepository, useValue: impersonationRepo },
        { provide: SessionContextService, useValue: sessionCtx },
        { provide: AuditService, useValue: auditService },
      ],
    }).compile();

    service = module.get(ImpersonationService);
  });

  // ─── F3: startImpersonation ───────────────────────────────────────────────

  describe('startImpersonation', () => {
    const mockReq = {} as never;
    const adminId = 'admin-001';
    const targetId = 'user-001';

    it('throws 404 USER_NOT_FOUND when target does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.startImpersonation(mockReq, adminId, targetId),
      ).rejects.toThrow(NotFoundException);

      const err = await service.startImpersonation(mockReq, adminId, targetId).catch((e) => e);
      expect(err.response?.errorCode).toBe('USER_NOT_FOUND');
    });

    /**
     * SANITY CHECK: SA→SA block (SEC-008).
     * If SUPER_ADMIN role check is removed, this must fail.
     */
    it('throws 403 CANNOT_IMPERSONATE_SUPER_ADMIN when target is SUPER_ADMIN', async () => {
      const superAdminUser = makeMockUser({ role: UserRole.SUPER_ADMIN });
      userRepo.findOne.mockResolvedValue(superAdminUser);

      const err = await service
        .startImpersonation(mockReq, adminId, superAdminUser.id)
        .catch((e) => e);

      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.response?.errorCode).toBe('CANNOT_IMPERSONATE_SUPER_ADMIN');
    });

    it('opens bracket, sets session pair, writes audit on success', async () => {
      const trainerUser = makeMockUser({ role: UserRole.TRAINER });
      userRepo.findOne.mockResolvedValue(trainerUser);

      const mockLog = makeMockLog({ adminId, impersonatedUserId: trainerUser.id });
      impersonationRepo.openBracket!.mockResolvedValue(mockLog);

      const result = await service.startImpersonation(mockReq, adminId, trainerUser.id);

      expect(impersonationRepo.openBracket).toHaveBeenCalledWith(
        expect.objectContaining({ adminId, impersonatedUserId: trainerUser.id }),
      );
      expect(sessionCtx.setImpersonation).toHaveBeenCalledWith(
        mockReq,
        expect.objectContaining({
          realAdminId: adminId,
          impersonatedSubjectId: trainerUser.id,
        }),
      );
      expect(auditService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'IMPERSONATION_START',
          actorId: adminId,
        }),
      );
      expect(result.impersonationLogId).toBe(mockLog.id);
      expect(result.actingAs.id).toBe(trainerUser.id);
      expect(result.actingAs.impersonatedBy).toBe(adminId);
    });

    it('expiresAt is approximately 1h from now', async () => {
      const trainerUser = makeMockUser({ role: UserRole.TRAINER });
      userRepo.findOne.mockResolvedValue(trainerUser);
      const mockLog = makeMockLog();
      impersonationRepo.openBracket!.mockResolvedValue(mockLog);

      const before = Date.now();
      const result = await service.startImpersonation(mockReq, adminId, trainerUser.id);
      const after = Date.now();

      const expiresAt = new Date(result.expiresAt).getTime();
      expect(expiresAt).toBeGreaterThanOrEqual(before + IMPERSONATION_CAP_MS);
      expect(expiresAt).toBeLessThanOrEqual(after + IMPERSONATION_CAP_MS + 100);
    });
  });

  // ─── F4: checkAndEnforceCapIfNeeded ───────────────────────────────────────

  describe('checkAndEnforceCapIfNeeded (1h cap)', () => {
    const mockReq = {} as never;

    it('returns false when not impersonating', async () => {
      sessionCtx.getImpersonation!.mockReturnValue(undefined);
      const result = await service.checkAndEnforceCapIfNeeded(mockReq);
      expect(result).toBe(false);
    });

    it('returns false when impersonation is within 1h', async () => {
      sessionCtx.getImpersonation!.mockReturnValue({
        realAdminId: 'admin-001',
        impersonatedSubjectId: 'user-001',
        impersonationStartedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30min ago
      });

      const result = await service.checkAndEnforceCapIfNeeded(mockReq);
      expect(result).toBe(false);
    });

    /**
     * SANITY CHECK: 1h cap lazy enforcement.
     * If cap check is removed, expired sessions would continue indefinitely.
     */
    it('returns true and triggers auto-exit when impersonation is past 1h', async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      sessionCtx.getImpersonation!.mockReturnValueOnce({
        realAdminId: 'admin-001',
        impersonatedSubjectId: 'user-001',
        impersonationStartedAt: twoHoursAgo,
      });
      // Second call from exitImpersonation
      sessionCtx.getImpersonation!.mockReturnValueOnce({
        realAdminId: 'admin-001',
        impersonatedSubjectId: 'user-001',
        impersonationStartedAt: twoHoursAgo,
      });

      const openLog = makeMockLog();
      impersonationRepo.findOpenBracket!.mockResolvedValue(openLog);
      impersonationRepo.closeBracket!.mockResolvedValue({ ...openLog, endAt: new Date() });

      const result = await service.checkAndEnforceCapIfNeeded(mockReq);

      expect(result).toBe(true);
      expect(impersonationRepo.closeBracket).toHaveBeenCalled();
      expect(auditService.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'IMPERSONATION_AUTO_EXIT_1H' }),
      );
      expect(sessionCtx.clearImpersonation).toHaveBeenCalledWith(mockReq);
    });
  });

  // ─── F5: buildDualActorContext ─────────────────────────────────────────────

  describe('buildDualActorContext (F5 dual-actor attribution)', () => {
    const mockReq = {} as never;

    it('returns actorId=principalId with nulls when not impersonating', async () => {
      sessionCtx.getImpersonation!.mockReturnValue(undefined);
      const ctx = await service.buildDualActorContext(mockReq, 'principal-001');
      expect(ctx.actorId).toBe('principal-001');
      expect(ctx.actingAdminId).toBeNull();
      expect(ctx.viaImpersonationLogId).toBeNull();
    });

    /**
     * SANITY CHECK: Dual-actor attribution context (D6).
     * Verifies that during impersonation, mutations carry both subject id AND admin id.
     */
    it('returns dual-actor context when impersonating', async () => {
      sessionCtx.getImpersonation!.mockReturnValue({
        realAdminId: 'admin-001',
        impersonatedSubjectId: 'subject-002',
        impersonationStartedAt: new Date().toISOString(),
      });
      const openLog = makeMockLog({ id: 'log-xyz', adminId: 'admin-001', impersonatedUserId: 'subject-002' });
      impersonationRepo.findOpenBracket!.mockResolvedValue(openLog);

      const ctx = await service.buildDualActorContext(mockReq, 'principal-001');

      expect(ctx.actorId).toBe('subject-002');        // apparent actor = impersonated subject
      expect(ctx.actingAdminId).toBe('admin-001');    // real SA (D6)
      expect(ctx.viaImpersonationLogId).toBe('log-xyz'); // bracket link
    });
  });

  // ─── F6: getHistory ───────────────────────────────────────────────────────

  describe('getHistory', () => {
    it('returns paginated data with meta', async () => {
      const mockLogs = [makeMockLog({ endAt: new Date(), durationSeconds: 120 })];
      impersonationRepo.findPaginated!.mockResolvedValue({ data: mockLogs, total: 1 });

      const result = await service.getHistory({ page: 1, limit: 20 });

      expect(result.data.length).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.totalPages).toBe(1);
    });

    it('calculates totalPages correctly', async () => {
      impersonationRepo.findPaginated!.mockResolvedValue({
        data: Array.from({ length: 5 }, () => makeMockLog()),
        total: 11,
      });
      const result = await service.getHistory({ page: 1, limit: 5 });
      expect(result.meta.totalPages).toBe(3); // ceil(11/5) = 3
    });
  });
});
