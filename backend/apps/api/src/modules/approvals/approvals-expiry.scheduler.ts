import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ApprovalsService } from './approvals.service';

/**
 * ApprovalsExpiryScheduler — D10.
 *
 * 48-hour expiry sweep: transitions stale Pending rows to Expired.
 *
 * Architecture (A2):
 * - Runs every 15 minutes to keep the expiry window tight.
 * - Uses a Postgres advisory lock so only one instance (in a multi-instance deployment)
 *   runs the sweep per tick. Lock is released after the sweep.
 * - The sweep itself is an idempotent guarded UPDATE
 *   (WHERE status='Pending' AND expiresAt < now() AND autoApproved=false).
 * - Safe to run concurrently: concurrent instances will try the lock, exactly one
 *   wins, the rest skip (no duplicate transitions).
 */
@Injectable()
export class ApprovalsExpiryScheduler implements OnModuleDestroy {
  private readonly logger = new Logger(ApprovalsExpiryScheduler.name);

  /**
   * Postgres advisory lock key for the expiry sweep.
   * Must be stable across deployments and unique to this sweep.
   * Using a deterministic numeric hash of the purpose string.
   */
  private readonly ADVISORY_LOCK_KEY = 7381001; // Stable key for approvals expiry sweep

  private isRunning = false;

  constructor(
    private readonly approvalsService: ApprovalsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Runs every 15 minutes.
   * Advisory lock ensures only one instance sweeps per tick (A2).
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async runExpirySweep(): Promise<void> {
    if (this.isRunning) {
      this.logger.debug('[SWEEP] Previous sweep still running — skipping tick');
      return;
    }

    this.isRunning = true;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Try to acquire a session-level advisory lock (non-blocking).
      // pg_try_advisory_lock returns true if acquired, false if already held.
      const [lockResult] = await queryRunner.query(
        `SELECT pg_try_advisory_lock($1) AS acquired`,
        [this.ADVISORY_LOCK_KEY],
      );

      if (!lockResult.acquired) {
        this.logger.debug('[SWEEP] Advisory lock not acquired — another instance is sweeping');
        return;
      }

      this.logger.log('[SWEEP] Acquired advisory lock — running expiry sweep');

      try {
        const count = await this.approvalsService.expireStaleApprovals();
        if (count > 0) {
          this.logger.log(`[SWEEP] Expired ${count} approval request(s)`);
        } else {
          this.logger.debug('[SWEEP] No stale approvals found');
        }
      } finally {
        // Always release the advisory lock
        await queryRunner.query(
          `SELECT pg_advisory_unlock($1)`,
          [this.ADVISORY_LOCK_KEY],
        );
        this.logger.debug('[SWEEP] Advisory lock released');
      }
    } catch (err) {
      this.logger.error(`[SWEEP] Error during expiry sweep: ${(err as Error).message}`, (err as Error).stack);
    } finally {
      await queryRunner.release();
      this.isRunning = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Release advisory lock if held (e.g. during graceful shutdown)
    if (this.dataSource.isInitialized) {
      try {
        await this.dataSource.query(
          `SELECT pg_advisory_unlock($1)`,
          [this.ADVISORY_LOCK_KEY],
        );
      } catch {
        // Ignore errors on shutdown
      }
    }
  }
}
