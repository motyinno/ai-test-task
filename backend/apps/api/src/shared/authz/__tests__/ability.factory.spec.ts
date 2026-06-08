import { Test } from '@nestjs/testing';
import { AbilityFactory } from '../ability.factory';
import { TenantContext } from '../../tenancy/tenant-context';

describe('AbilityFactory', () => {
  let factory: AbilityFactory;

  beforeEach(async () => {
    const mod = await Test.createTestingModule({
      providers: [AbilityFactory],
    }).compile();
    factory = mod.get(AbilityFactory);
  });

  const childCtx: TenantContext = {
    userId: 'c1',
    role: 'PLAYER',
    trainerId: 't1',
    isChild: true,
    parentUserId: 'p1',
  };

  const trainerCtx: TenantContext = {
    userId: 'tr1',
    role: 'TRAINER',
    isChild: false,
  };

  describe('Child principal constraints (FR-026, SEC-009)', () => {
    it('can read Event', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('read', 'Event')).toBe(true);
    });

    it('can rsvp Event', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('rsvp', 'Event')).toBe(true);
    });

    it('cannot add Trainer', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('add', 'Trainer')).toBe(false);
    });

    it('cannot manage Payment', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('manage', 'Payment')).toBe(false);
    });

    it('cannot purchase Token', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('purchase', 'Token')).toBe(false);
    });

    it('cannot delete Account', () => {
      const ability = factory.forContext(childCtx);
      expect(ability.can('delete', 'Account')).toBe(false);
    });
  });

  describe('Non-child principal (trainer)', () => {
    it('trainer can manage anything by default', () => {
      const ability = factory.forContext(trainerCtx);
      expect(ability.can('manage', 'all')).toBe(true);
    });

    it('trainer can add Trainer', () => {
      const ability = factory.forContext(trainerCtx);
      expect(ability.can('add', 'Trainer')).toBe(true);
    });

    it('trainer can manage Payment', () => {
      const ability = factory.forContext(trainerCtx);
      expect(ability.can('manage', 'Payment')).toBe(true);
    });
  });
});
