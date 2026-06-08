import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { TrainerPlayerAssociation, AssociationStatus } from './entities/trainer-player-association.entity';

@Injectable()
export class PlayersRepository {
  constructor(
    @InjectRepository(TrainerPlayerAssociation)
    private readonly assocRepo: Repository<TrainerPlayerAssociation>,
  ) {}

  /**
   * Find an existing association between a trainer and a player profile.
   * Used for BR-005 duplicate-check and reactivation.
   */
  async findAssociation(
    trainerId: string,
    playerProfileId: string,
  ): Promise<TrainerPlayerAssociation | null> {
    return this.assocRepo.findOne({ where: { trainerId, playerProfileId } });
  }

  /** Save an association (insert or update). */
  async saveAssociation(assoc: Partial<TrainerPlayerAssociation>): Promise<TrainerPlayerAssociation> {
    return this.assocRepo.save(assoc as TrainerPlayerAssociation);
  }

  /** Save an association inside a running EntityManager transaction. */
  async saveAssociationInTx(
    em: EntityManager,
    assoc: Partial<TrainerPlayerAssociation>,
  ): Promise<TrainerPlayerAssociation> {
    return em.save(TrainerPlayerAssociation, assoc as TrainerPlayerAssociation);
  }

  /** Find an association using a running EntityManager (for reading inside a tx). */
  async findAssociationInTx(
    em: EntityManager,
    trainerId: string,
    playerProfileId: string,
  ): Promise<TrainerPlayerAssociation | null> {
    return em.findOne(TrainerPlayerAssociation, { where: { trainerId, playerProfileId } });
  }

  /**
   * Create a new ACTIVE association.
   * Returns null if the unique constraint fires (already exists — race condition).
   */
  async createAssociation(data: {
    trainerId: string;
    playerProfileId: string;
    viaShareLinkId: string | null;
  }): Promise<TrainerPlayerAssociation | null> {
    try {
      return await this.assocRepo.save(
        this.assocRepo.create({
          ...data,
          status: AssociationStatus.ACTIVE,
        }),
      );
    } catch (err: any) {
      // unique violation
      if (err?.code === '23505') {
        return null;
      }
      throw err;
    }
  }
}
