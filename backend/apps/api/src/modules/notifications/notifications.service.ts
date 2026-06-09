/**
 * NotificationsService — business logic for in-app notifications (Q-01.06, GR4).
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationsRepository, CreateNotificationData } from './notifications.repository';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsRepo: NotificationsRepository) {}

  /**
   * Create a new in-app notification for a user.
   */
  async create(data: CreateNotificationData): Promise<Notification> {
    return this.notificationsRepo.create(data);
  }

  /**
   * Create an AVAILABILITY_OVERRIDE notification for the given coach user.
   */
  async createAvailabilityOverrideNotification(opts: {
    coachUserId: string;
    coachName: string;
    trainerName: string;
    reason: string;
  }): Promise<Notification> {
    return this.notificationsRepo.create({
      userId: opts.coachUserId,
      type: NotificationType.AVAILABILITY_OVERRIDE,
      title: 'Your availability has been overridden',
      body: `${opts.trainerName} has overridden your availability. Reason: ${opts.reason}`,
    });
  }

  /**
   * Get all notifications for the authenticated user.
   */
  async listForUser(userId: string): Promise<Notification[]> {
    return this.notificationsRepo.findByUserId(userId);
  }

  /**
   * Mark a notification as read.
   * Throws 404 if the notification doesn't exist or doesn't belong to the user.
   */
  async markRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationsRepo.markRead(id, userId);
    if (!notification) {
      throw new NotFoundException({
        message: `Notification ${id} not found`,
        errorCode: 'NOTIFICATION_NOT_FOUND',
      });
    }
    return notification;
  }
}
