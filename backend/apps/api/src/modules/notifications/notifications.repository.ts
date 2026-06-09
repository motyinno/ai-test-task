/**
 * NotificationsRepository — data access layer for Notification entity.
 */
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
}

@Injectable()
export class NotificationsRepository {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(data: CreateNotificationData): Promise<Notification> {
    const notification = this.repo.create({
      userId: data.userId,
      type: data.type,
      title: data.title,
      body: data.body,
      read: false,
    });
    return this.repo.save(notification);
  }

  async findByUserId(userId: string): Promise<Notification[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async markRead(id: string, userId: string): Promise<Notification | null> {
    const notification = await this.repo.findOne({ where: { id, userId } });
    if (!notification) return null;

    notification.read = true;
    return this.repo.save(notification);
  }
}
