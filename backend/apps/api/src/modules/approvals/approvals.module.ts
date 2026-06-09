import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ApprovalRequest } from './entities/approval-request.entity';
import { ChildLogin } from '../child-account/entities/child-login.entity';
import { PlayerProfile } from '../users/entities/player-profile.entity';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsService } from './approvals.service';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsExpiryScheduler } from './approvals-expiry.scheduler';
import { EmailModule } from '../../shared/integrations/email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalRequest, ChildLogin, PlayerProfile]),
    ScheduleModule.forRoot(),
    EmailModule,
  ],
  controllers: [ApprovalsController],
  providers: [
    ApprovalsRepository,
    ApprovalsService,
    ApprovalsExpiryScheduler,
  ],
  exports: [ApprovalsService, ApprovalsRepository],
})
export class ApprovalsModule {}
