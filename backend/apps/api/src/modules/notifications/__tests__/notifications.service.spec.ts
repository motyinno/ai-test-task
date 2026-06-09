/**
 * GR4 — NotificationsService unit tests (Q-01.06)
 *
 * Verifies:
 *   1. create() persists a notification via the repository.
 *   2. createAvailabilityOverrideNotification() creates the correct type/title/body.
 *   3. listForUser() returns notifications for the user.
 *   4. markRead() updates the read flag; throws 404 if not found (user-scoped).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { NotificationsService } from '../notifications.service';
import { NotificationsRepository } from '../notifications.repository';
import { Notification, NotificationType } from '../entities/notification.entity';

function makeNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'notif-1',
    userId: 'user-1',
    type: NotificationType.AVAILABILITY_OVERRIDE,
    title: 'Test notification',
    body: 'Body text',
    read: false,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('NotificationsService (GR4, Q-01.06)', () => {
  let service: NotificationsService;
  let repo: {
    create: jest.Mock;
    findByUserId: jest.Mock;
    markRead: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn(),
      findByUserId: jest.fn(),
      markRead: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: NotificationsRepository, useValue: repo },
      ],
    }).compile();

    service = module.get(NotificationsService);
  });

  describe('create', () => {
    it('creates a notification with provided data', async () => {
      const notif = makeNotification();
      repo.create.mockResolvedValue(notif);

      const result = await service.create({
        userId: 'user-1',
        type: NotificationType.AVAILABILITY_OVERRIDE,
        title: 'Test notification',
        body: 'Body text',
      });

      expect(result).toEqual(notif);
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        type: NotificationType.AVAILABILITY_OVERRIDE,
      }));
    });
  });

  describe('createAvailabilityOverrideNotification', () => {
    it('creates AVAILABILITY_OVERRIDE type with reason in body', async () => {
      const notif = makeNotification({ type: NotificationType.AVAILABILITY_OVERRIDE });
      repo.create.mockResolvedValue(notif);

      await service.createAvailabilityOverrideNotification({
        coachUserId: 'coach-1',
        coachName: 'Alice',
        trainerName: 'Mike',
        reason: 'Championship finals',
      });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'coach-1',
        type: NotificationType.AVAILABILITY_OVERRIDE,
        body: expect.stringContaining('Championship finals'),
      }));
    });

    it('SANITY CHECK: removing the create call leaves zero repo calls → test red', async () => {
      const notif = makeNotification();
      repo.create.mockResolvedValue(notif);

      await service.createAvailabilityOverrideNotification({
        coachUserId: 'coach-1',
        coachName: 'Alice',
        trainerName: 'Mike',
        reason: 'Tournament',
      });

      // SANITY: this is exactly 1 — if the create call is removed, this becomes 0 → test red
      expect(repo.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('listForUser', () => {
    it('returns all notifications for the user', async () => {
      const notifications = [makeNotification(), makeNotification({ id: 'notif-2' })];
      repo.findByUserId.mockResolvedValue(notifications);

      const result = await service.listForUser('user-1');

      expect(result).toEqual(notifications);
      expect(repo.findByUserId).toHaveBeenCalledWith('user-1');
    });

    it('returns empty array when user has no notifications', async () => {
      repo.findByUserId.mockResolvedValue([]);

      const result = await service.listForUser('user-1');

      expect(result).toEqual([]);
    });
  });

  describe('markRead', () => {
    it('marks notification as read', async () => {
      const notif = makeNotification({ read: true });
      repo.markRead.mockResolvedValue(notif);

      const result = await service.markRead('notif-1', 'user-1');

      expect(result.read).toBe(true);
      expect(repo.markRead).toHaveBeenCalledWith('notif-1', 'user-1');
    });

    it('throws 404 NOTIFICATION_NOT_FOUND when notification does not belong to user', async () => {
      repo.markRead.mockResolvedValue(null);

      await expect(service.markRead('nonexistent', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });
});
