import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImpersonationLog } from './entities/impersonation-log.entity';
import { ImpersonationRepository } from './impersonation.repository';
import { ImpersonationService } from './impersonation.service';
import { ImpersonationController } from './impersonation.controller';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

/**
 * ImpersonationModule (F3–F6)
 *
 * Provides:
 *   - ImpersonationController (POST /:userId, POST /exit, GET /history)
 *   - ImpersonationService (business logic: start, exit, cap check, history, dual-actor)
 *   - ImpersonationRepository (bracket CRUD, paginated history)
 *
 * Imports AuthModule for SessionContextService.
 * AuditService is provided globally via AuditModule (@Global).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ImpersonationLog, User]),
    AuthModule,
  ],
  controllers: [ImpersonationController],
  providers: [ImpersonationService, ImpersonationRepository],
  exports: [ImpersonationService],
})
export class ImpersonationModule {}
