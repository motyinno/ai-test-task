/**
 * C6: TrainerPlayerAssociation entity tests.
 *
 * Tests:
 *   - persists with ACTIVE default, viaShareLinkId, connectedAt
 *   - unique (trainerId, playerProfileId) — DB-level constraint (BR-005)
 */
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseModule } from '../../../../shared/database/database.module';
import {
  TrainerPlayerAssociation,
  AssociationStatus,
} from '../trainer-player-association.entity';

describe('TrainerPlayerAssociation entity (C6)', () => {
  let repo: Repository<TrainerPlayerAssociation>;
  let moduleRef: any;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        TypeOrmModule.forFeature([TrainerPlayerAssociation]),
      ],
    }).compile();
    moduleRef = mod;
    repo = mod.get(getRepositoryToken(TrainerPlayerAssociation));
  });

  afterAll(async () => {
    await moduleRef?.close();
  });

  beforeEach(async () => {
    await repo.query('DELETE FROM trainer_player_associations');
  });

  it('persists with ACTIVE default, viaShareLinkId, and connectedAt', async () => {
    const assoc = await repo.save(
      repo.create({
        trainerId: 'trainer-c6-1',
        playerProfileId: 'player-c6-1',
        viaShareLinkId: 'link-c6-1',
      }),
    );

    expect(assoc.id).toMatch(/[0-9a-f-]{36}/);
    expect(assoc.status).toBe(AssociationStatus.ACTIVE);
    expect(assoc.viaShareLinkId).toBe('link-c6-1');
    expect(assoc.connectedAt).toBeInstanceOf(Date);
  });

  it('persists with REMOVED status', async () => {
    const assoc = await repo.save(
      repo.create({
        trainerId: 'trainer-c6-r',
        playerProfileId: 'player-c6-r',
        status: AssociationStatus.REMOVED,
      }),
    );
    expect(assoc.status).toBe(AssociationStatus.REMOVED);
  });

  it('persists with null viaShareLinkId', async () => {
    const assoc = await repo.save(
      repo.create({
        trainerId: 'trainer-c6-null',
        playerProfileId: 'player-c6-null',
      }),
    );
    expect(assoc.viaShareLinkId).toBeNull();
  });

  /**
   * BR-005: unique (trainerId, playerProfileId) at the DB level.
   *
   * Sanity check (failing-first): This test verifies the UNIQUE constraint exists.
   * When the constraint was removed from the migration, a second insert succeeded
   * (no error), and this test went RED.
   */
  it('unique (trainerId, playerProfileId) — second insert throws (BR-005)', async () => {
    await repo.save(
      repo.create({
        trainerId: 'trainer-c6-dup',
        playerProfileId: 'player-c6-dup',
      }),
    );

    // Second insert with the same (trainerId, playerProfileId) must throw
    await expect(
      repo.save(
        repo.create({
          trainerId: 'trainer-c6-dup',
          playerProfileId: 'player-c6-dup',
        }),
      ),
    ).rejects.toThrow();
  });

  it('different playerProfileId for same trainer is allowed', async () => {
    await repo.save(repo.create({ trainerId: 't-multi', playerProfileId: 'p1' }));
    const second = await repo.save(repo.create({ trainerId: 't-multi', playerProfileId: 'p2' }));
    expect(second.id).toBeDefined();
  });

  it('same playerProfileId for different trainers is allowed', async () => {
    await repo.save(repo.create({ trainerId: 't-shared-1', playerProfileId: 'p-shared' }));
    const second = await repo.save(repo.create({ trainerId: 't-shared-2', playerProfileId: 'p-shared' }));
    expect(second.id).toBeDefined();
  });
});
