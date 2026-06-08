import { apiPost } from '../client';

export const impersonationApi = {
  exit: (): Promise<void> => apiPost<void>('/impersonation/exit'),
  start: (userId: string): Promise<{ impersonationLogId: string; expiresAt: string }> =>
    apiPost(`/impersonation/${userId}`),
};
