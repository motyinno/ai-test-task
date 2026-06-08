import { apiGet, apiPost } from '../client';

export interface ContextDto {
  profileId: string;
  profileName: string;
  trainerId: string;
  trainerName: string;
  isSelf: boolean; // true = "Me" group; false = child
}

interface ContextsResponse {
  data: ContextDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export const playersContextApi = {
  getContexts: (): Promise<ContextsResponse> =>
    apiGet<ContextsResponse>('/players/me/contexts'),

  switchContext: (profileId: string, trainerId?: string): Promise<unknown> =>
    apiPost('/players/me/context', { profileId, trainerId }),
};
