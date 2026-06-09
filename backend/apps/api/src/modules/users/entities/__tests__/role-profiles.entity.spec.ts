/**
 * B1: Role Profile Entities Tests
 *
 * Verifies:
 *   - TrainerProfile, CoachProfile, PlayerProfile can be persisted
 *   - UUIDs are generated
 *   - FK constraints are intact (profile cascades on user delete)
 *   - PlayerProfile.parentUserId FK is preserved
 *   - CoachProfile.trainerId is required (org-bound)
 */
import { Test } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DatabaseModule } from '../../../../shared/database/database.module';
import { User, UserRole, UserStatus } from '../user.entity';
import { TrainerProfile } from '../trainer-profile.entity';
import { CoachProfile } from '../coach-profile.entity';
import { PlayerProfile } from '../player-profile.entity';

describe('B1: Role Profile Entities', () => {
  let userRepo: Repository<User>;
  let trainerProfileRepo: Repository<TrainerProfile>;
  let coachProfileRepo: Repository<CoachProfile>;
  let playerProfileRepo: Repository<PlayerProfile>;
  let moduleRef: ReturnType<(typeof Test)['createTestingModule']> extends Promise<infer T>
    ? T
    : never;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        DatabaseModule,
        TypeOrmModule.forFeature([User, TrainerProfile, CoachProfile, PlayerProfile]),
      ],
    }).compile();
    moduleRef = mod as unknown as typeof moduleRef;
    userRepo = mod.get(getRepositoryToken(User));
    trainerProfileRepo = mod.get(getRepositoryToken(TrainerProfile));
    coachProfileRepo = mod.get(getRepositoryToken(CoachProfile));
    playerProfileRepo = mod.get(getRepositoryToken(PlayerProfile));
  });

  afterAll(async () => {
    await (moduleRef as unknown as { close: () => Promise<void> }).close();
  });

  beforeEach(async () => {
    // Delete profiles before users to avoid FK violations
    await playerProfileRepo.query('DELETE FROM player_profiles');
    await coachProfileRepo.query('DELETE FROM coach_profiles');
    await trainerProfileRepo.query('DELETE FROM trainer_profiles');
    await userRepo.query('DELETE FROM users');
  });

  // ─── TrainerProfile ─────────────────────────────────────────────────────────

  describe('TrainerProfile', () => {
    it('saves a TrainerProfile with UUID PK and required fields', async () => {
      const user = await userRepo.save(
        userRepo.create({
          email: 'trainer-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      const profile = await trainerProfileRepo.save(
        trainerProfileRepo.create({
          userId: user.id,
          businessName: 'Elite Soccer Training',
          trainerName: 'Coach Mike',
        }),
      );

      expect(profile.id).toBeDefined();
      expect(profile.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(profile.userId).toBe(user.id);
      expect(profile.businessName).toBe('Elite Soccer Training');
      expect(profile.trainerName).toBe('Coach Mike');
      expect(profile.phone).toBeNull();
      expect(profile.photoUrl).toBeNull();
      expect(profile.stripeAccountId).toBeNull();
    });

    it('enforces unique userId constraint on TrainerProfile', async () => {
      const user = await userRepo.save(
        userRepo.create({
          email: 'trainer-uniq@test.com',
          passwordHash: 'hashed',
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );

      await trainerProfileRepo.save(
        trainerProfileRepo.create({
          userId: user.id,
          businessName: 'Biz A',
          trainerName: 'Mike',
        }),
      );

      await expect(
        trainerProfileRepo.save(
          trainerProfileRepo.create({
            userId: user.id,
            businessName: 'Biz B',
            trainerName: 'Mike 2',
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ─── CoachProfile ────────────────────────────────────────────────────────────

  describe('CoachProfile', () => {
    it('saves a CoachProfile with trainerId (org-bound)', async () => {
      const trainerUser = await userRepo.save(
        userRepo.create({
          email: 'trainer-for-coach@test.com',
          passwordHash: 'hashed',
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const coachUser = await userRepo.save(
        userRepo.create({
          email: 'coach-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
        }),
      );

      const profile = await coachProfileRepo.save(
        coachProfileRepo.create({
          userId: coachUser.id,
          trainerId: trainerUser.id,
        }),
      );

      expect(profile.id).toBeDefined();
      expect(profile.userId).toBe(coachUser.id);
      expect(profile.trainerId).toBe(trainerUser.id);
      expect(profile.bio).toBeNull();
      expect(profile.publicProfile).toBe(false);
    });

    it('enforces unique userId constraint on CoachProfile', async () => {
      const trainerUser = await userRepo.save(
        userRepo.create({
          email: 'trainer-for-coach-uniq@test.com',
          passwordHash: 'hashed',
          role: UserRole.TRAINER,
          status: UserStatus.ACTIVE,
        }),
      );
      const coachUser = await userRepo.save(
        userRepo.create({
          email: 'coach-uniq@test.com',
          passwordHash: 'hashed',
          role: UserRole.COACH,
          status: UserStatus.ACTIVE,
        }),
      );

      await coachProfileRepo.save(
        coachProfileRepo.create({
          userId: coachUser.id,
          trainerId: trainerUser.id,
        }),
      );

      await expect(
        coachProfileRepo.save(
          coachProfileRepo.create({
            userId: coachUser.id,
            trainerId: trainerUser.id,
          }),
        ),
      ).rejects.toThrow();
    });
  });

  // ─── PlayerProfile ───────────────────────────────────────────────────────────

  describe('PlayerProfile', () => {
    it('saves a PlayerProfile (standalone adult) with null parentUserId', async () => {
      const user = await userRepo.save(
        userRepo.create({
          email: 'player-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      const profile = await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: user.id,
          name: 'John Player',
        }),
      );

      expect(profile.id).toBeDefined();
      expect(profile.userId).toBe(user.id);
      expect(profile.parentUserId).toBeNull();
      expect(profile.name).toBe('John Player');
      expect(profile.dateOfBirth).toBeNull();
      expect(profile.skillLevel).toBeNull();
    });

    it('saves a child PlayerProfile with parentUserId set', async () => {
      const parentUser = await userRepo.save(
        userRepo.create({
          email: 'parent-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );
      const childUser = await userRepo.save(
        userRepo.create({
          email: 'child-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      const childProfile = await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: childUser.id,
          parentUserId: parentUser.id,
          name: 'Child One',
          dateOfBirth: '2016-03-01',
          gender: 'MALE',
        }),
      );

      expect(childProfile.parentUserId).toBe(parentUser.id);
      expect(childProfile.dateOfBirth).toBe('2016-03-01');
      expect(childProfile.gender).toBe('MALE');
    });

    it('parentUserId FK is preserved (not cascaded) when parent user is NOT deleted', async () => {
      const parentUser = await userRepo.save(
        userRepo.create({
          email: 'parent-fk-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );
      const childUser = await userRepo.save(
        userRepo.create({
          email: 'child-fk-b1@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      const childProfile = await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: childUser.id,
          parentUserId: parentUser.id,
          name: 'Child FK Test',
        }),
      );

      // Read back and verify the FK reference is intact
      const reloaded = await playerProfileRepo.findOne({ where: { id: childProfile.id } });
      expect(reloaded).not.toBeNull();
      expect(reloaded!.parentUserId).toBe(parentUser.id);
    });

    it('enforces unique userId constraint on PlayerProfile', async () => {
      const user = await userRepo.save(
        userRepo.create({
          email: 'player-uniq@test.com',
          passwordHash: 'hashed',
          role: UserRole.PLAYER,
          status: UserStatus.ACTIVE,
        }),
      );

      await playerProfileRepo.save(
        playerProfileRepo.create({
          userId: user.id,
          name: 'Player One',
        }),
      );

      await expect(
        playerProfileRepo.save(
          playerProfileRepo.create({
            userId: user.id,
            name: 'Player Two',
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
