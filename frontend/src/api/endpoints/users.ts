import { apiGet, apiPost, apiPatch, apiDelete } from '../client';

export interface UserResponseDto {
  id: string;
  email: string;
  role: 'SUPER_ADMIN' | 'TRAINER' | 'COACH' | 'PLAYER';
  status: 'ACTIVE' | 'INACTIVE' | 'DELETED';
  displayName: string;
  emailVerified: boolean;
  anonymizedAt?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export interface CreateTrainerDto {
  businessName: string;
  trainerName: string;
  email: string;
  phone?: string;
  onboardingMode: 'TEMP_PASSWORD' | 'INVITE_LINK';
}

export interface ListUsersQueryDto {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  status?: string;
}

export const usersApi = {
  list: (query: ListUsersQueryDto = {}): Promise<{ data: UserResponseDto[]; meta: { page: number; limit: number; total: number; totalPages: number } }> => {
    const params = new URLSearchParams();
    if (query.page) params.set('page', String(query.page));
    if (query.limit) params.set('limit', String(query.limit));
    if (query.search) params.set('search', query.search);
    if (query.role) params.set('role', query.role);
    if (query.status) params.set('status', query.status);
    const qs = params.toString();
    return apiGet(`/users${qs ? `?${qs}` : ''}`);
  },

  create: (dto: CreateTrainerDto): Promise<UserResponseDto> =>
    apiPost<UserResponseDto>('/users', dto),

  deactivate: (id: string): Promise<UserResponseDto> =>
    apiPost<UserResponseDto>(`/users/${id}/deactivate`),

  reactivate: (id: string): Promise<UserResponseDto> =>
    apiPost<UserResponseDto>(`/users/${id}/reactivate`),

  delete: (id: string, reason: string): Promise<UserResponseDto> =>
    apiDelete<UserResponseDto>(`/users/${id}`, { reason }),
};
