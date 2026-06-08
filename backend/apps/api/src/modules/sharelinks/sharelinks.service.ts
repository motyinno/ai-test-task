import { Injectable, NotFoundException, GoneException, Logger } from '@nestjs/common';
import { ShareLink, ShareLinkType } from './entities/share-link.entity';
import { ShareLinksRepository } from './sharelinks.repository';
import { CreateShareLinkDto } from './dto/create-share-link.dto';
import { generateShareLinkCode } from './share-link-code.util';

@Injectable()
export class ShareLinksService {
  private readonly logger = new Logger(ShareLinksService.name);

  constructor(private readonly repo: ShareLinksRepository) {}

  /**
   * Generate a new static or unique share link.
   * The link is scoped to the calling trainer's org.
   */
  async generate(
    dto: CreateShareLinkDto,
    ctx: { trainerId: string; userId: string },
  ): Promise<ShareLink> {
    const base = {
      code: generateShareLinkCode(),
      trainerId: ctx.trainerId,
      createdBy: ctx.userId,
    };

    const entity =
      dto.type === ShareLinkType.UNIQUE
        ? {
            ...base,
            type: ShareLinkType.UNIQUE,
            targetEmail: dto.targetEmail!,
            maxUses: 1,
            expiresAt: this.sevenDaysFromNow(),
          }
        : {
            ...base,
            type: ShareLinkType.STATIC,
            maxUses: null,
            expiresAt: null,
          };

    return this.repo.createScoped(entity);
  }

  /**
   * List share links for the calling trainer (tenant-scoped, paginated).
   */
  async list(
    page: number,
    limit: number,
  ): Promise<{ data: ShareLink[]; total: number }> {
    return this.repo.findPaginatedScoped(page, limit);
  }

  /**
   * Revoke a share link (flip active=false).
   * Scoped — attempting to revoke another trainer's link → 404.
   */
  async revoke(id: string): Promise<ShareLink> {
    const result = await this.repo.scopedUpdate({ id } as any, { active: false } as any);
    if (result.affected === 0) {
      throw new NotFoundException({ message: 'Share link not found', errorCode: 'LINK_NOT_FOUND' });
    }
    const link = await this.repo.scopedFindOne({ where: { id } as any });
    if (!link) {
      throw new NotFoundException({ message: 'Share link not found', errorCode: 'LINK_NOT_FOUND' });
    }
    return link;
  }

  /**
   * Validation pipeline — ordered gate:
   *   1. Exists (LINK_NOT_FOUND 404)
   *   2. Not revoked (LINK_REVOKED 410)
   *   3. Not expired (LINK_EXPIRED 410)
   *   4. Not used up for UNIQUE (LINK_USED 410)
   *
   * GLOBAL lookup: visitor has no trainer context — code is the credential.
   */
  async resolveLink(code: string): Promise<ShareLink> {
    // GLOBAL lookup: the code is the credential; visitor has no trainer context.
    // audited escape hatch — withoutTenantScope inside findByCode (A1)
    const link = await this.repo.findByCode(code);

    if (!link) {
      throw new NotFoundException({ message: 'Invalid share link', errorCode: 'LINK_NOT_FOUND' });
    }
    if (!link.active) {
      throw new GoneException({ message: 'Link has been revoked', errorCode: 'LINK_REVOKED' });
    }
    if (link.expiresAt && link.expiresAt < new Date()) {
      throw new GoneException({ message: 'Link has expired', errorCode: 'LINK_EXPIRED' });
    }
    if (
      link.type === ShareLinkType.UNIQUE &&
      link.maxUses != null &&
      link.useCount >= link.maxUses
    ) {
      throw new GoneException({ message: 'Link has already been used', errorCode: 'LINK_USED' });
    }
    return link;
  }

  private sevenDaysFromNow(): Date {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}
