import { apiGet, apiPost } from '../client';

export interface ActiveContextDto {
  profileId: string;
  trainerId?: string;
  label: string;
}

export interface MeResponseDto {
  id: string;
  role: 'SUPER_ADMIN' | 'TRAINER' | 'COACH' | 'PLAYER';
  isChild: boolean;
  parentUserId?: string;
  emailVerified: boolean;
  mustChangePassword: boolean;
  impersonatedBy?: string;
  activeContext: ActiveContextDto;
}

export interface LoginDto {
  email: string;
  password: string;
}

export const authApi = {
  me: (): Promise<MeResponseDto> => apiGet<MeResponseDto>('/auth/me'),
  login: (dto: LoginDto): Promise<MeResponseDto> => apiPost<MeResponseDto>('/auth/login', dto),
  logout: (): Promise<void> => apiPost<void>('/auth/logout'),
};
