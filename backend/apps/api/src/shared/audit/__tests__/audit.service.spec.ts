import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from '../audit.service';
import { AuditLog } from '../audit-log.entity';

const mockAuditRepo = () => ({
  create: jest.fn(),
  save: jest.fn(),
});

describe('AuditService', () => {
  let service: AuditService;
  let repo: ReturnType<typeof mockAuditRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: getRepositoryToken(AuditLog), useFactory: mockAuditRepo },
      ],
    }).compile();

    service = module.get<AuditService>(AuditService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  it('writes a basic audit entry without impersonation context', async () => {
    const saved: Partial<AuditLog> = {
      id: 'audit-1',
      actorId: 'user-1',
      actingAdminId: null,
      viaImpersonationLogId: null,
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: 'user-99',
      metadata: { reason: 'GDPR' },
    };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);

    const result = await service.write({
      actorId: 'user-1',
      action: 'USER_DELETED',
      targetType: 'User',
      targetId: 'user-99',
      metadata: { reason: 'GDPR' },
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'user-1',
        actingAdminId: null,
        viaImpersonationLogId: null,
        action: 'USER_DELETED',
        targetType: 'User',
        targetId: 'user-99',
        metadata: { reason: 'GDPR' },
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(saved);
    expect(result.actorId).toBe('user-1');
    expect(result.actingAdminId).toBeNull();
  });

  it('writes a dual-actor audit entry under impersonation (D6)', async () => {
    const saved: Partial<AuditLog> = {
      id: 'audit-2',
      actorId: 'impersonated-user',
      actingAdminId: 'real-admin',
      viaImpersonationLogId: 'imp-log-1',
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetId: 'impersonated-user',
      metadata: null,
    };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);

    const result = await service.write({
      actorId: 'impersonated-user',
      actingAdminId: 'real-admin',
      viaImpersonationLogId: 'imp-log-1',
      action: 'PROFILE_UPDATED',
      targetType: 'User',
      targetId: 'impersonated-user',
    });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'impersonated-user',
        actingAdminId: 'real-admin',
        viaImpersonationLogId: 'imp-log-1',
        action: 'PROFILE_UPDATED',
      }),
    );
    // Both actor IDs must be present — this is the dual-actor attribution (D6)
    expect(result.actorId).toBe('impersonated-user');
    expect(result.actingAdminId).toBe('real-admin');
    expect(result.viaImpersonationLogId).toBe('imp-log-1');
  });

  it('defaults actingAdminId and viaImpersonationLogId to null when omitted', async () => {
    const saved: Partial<AuditLog> = {
      actorId: 'admin-1',
      actingAdminId: null,
      viaImpersonationLogId: null,
      action: 'IMPERSONATION_START',
    };
    repo.create.mockReturnValue(saved);
    repo.save.mockResolvedValue(saved);

    const result = await service.write({ actorId: 'admin-1', action: 'IMPERSONATION_START' });

    expect(result.actingAdminId).toBeNull();
    expect(result.viaImpersonationLogId).toBeNull();
  });
});
