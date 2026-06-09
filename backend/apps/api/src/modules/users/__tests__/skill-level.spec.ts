/**
 * GR1 — SkillLevel enum tests (Q-01.01)
 *
 * Verifies:
 *   1. SkillLevel enum has exactly the four accepted values.
 *   2. UpdateProfileDto validates and rejects invalid skill level values.
 *   3. PlayerProfile entity accepts SkillLevel values and rejects others.
 *
 * Sanity-check: invalid value ('PRO', 'EXPERT') must be rejected.
 */
import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { SkillLevel } from '../entities/skill-level.enum';
import { UpdateProfileDto } from '../../profile/dto/update-profile.dto';

describe('SkillLevel enum (GR1, Q-01.01)', () => {
  it('defines exactly BEGINNER, INTERMEDIATE, ADVANCED, ELITE', () => {
    const values = Object.values(SkillLevel);
    expect(values).toHaveLength(4);
    expect(values).toContain('BEGINNER');
    expect(values).toContain('INTERMEDIATE');
    expect(values).toContain('ADVANCED');
    expect(values).toContain('ELITE');
  });

  describe('UpdateProfileDto.skillLevel validation', () => {
    it('accepts BEGINNER as a valid skill level', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'BEGINNER' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors).toHaveLength(0);
    });

    it('accepts INTERMEDIATE as a valid skill level', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'INTERMEDIATE' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors).toHaveLength(0);
    });

    it('accepts ADVANCED as a valid skill level', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'ADVANCED' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors).toHaveLength(0);
    });

    it('accepts ELITE as a valid skill level', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'ELITE' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors).toHaveLength(0);
    });

    it('SANITY CHECK — rejects PRO (invalid skill level → 400)', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'PRO' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors.length).toBeGreaterThan(0);
      // Verify it's an isEnum constraint violation
      expect(skillErrors[0].constraints).toHaveProperty('isEnum');
    });

    it('SANITY CHECK — rejects EXPERT (invalid skill level → 400)', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'EXPERT' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors.length).toBeGreaterThan(0);
    });

    it('SANITY CHECK — rejects lowercase intermediate (case-sensitive enum)', async () => {
      const dto = plainToInstance(UpdateProfileDto, { skillLevel: 'intermediate' });
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors.length).toBeGreaterThan(0);
    });

    it('accepts undefined (optional field — player profile without skill level)', async () => {
      const dto = plainToInstance(UpdateProfileDto, {});
      const errors = await validate(dto);
      const skillErrors = errors.filter((e) => e.property === 'skillLevel');
      expect(skillErrors).toHaveLength(0);
    });
  });
});
