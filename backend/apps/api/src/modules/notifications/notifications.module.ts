/**
 * NotificationsModule — in-app notification channel (Q-01.06, GR4).
 *
 * Provides NotificationsService and NotificationsRepository.
 * Exported so AvailabilityModule can use NotificationsService for coach override notifications.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationsRepository } from './notifications.repository';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Notification])],
  providers: [NotificationsRepository, NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
