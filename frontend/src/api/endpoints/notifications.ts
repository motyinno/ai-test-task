import { apiGet, apiPost } from '../client';

export type NotificationType = 'AVAILABILITY_OVERRIDE' | 'GENERAL';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsResponse {
  data: Notification[];
}

export const notificationsApi = {
  list: (): Promise<NotificationsResponse> =>
    apiGet<NotificationsResponse>('/notifications'),

  markRead: (id: string): Promise<Notification> =>
    apiPost<Notification>(`/notifications/${id}/read`),
};
