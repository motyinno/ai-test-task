import { apiGet, apiPatch } from '../client';

export interface ProfileResponseDto {
  id: string;
  role: string;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  // Coach-specific
  bio?: string;
  credentials?: string;
  publicProfile?: boolean;
  // Player-specific
  school?: string;
  jerseyNumber?: string;
  // Parent-specific
  emergencyContact?: string;
  // Meta
  photoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
}

export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
  bio?: string;
  credentials?: string;
  publicProfile?: boolean;
  school?: string;
  jerseyNumber?: string;
  emergencyContact?: string;
}

export const profileApi = {
  get: (): Promise<ProfileResponseDto> => apiGet<ProfileResponseDto>('/me/profile'),
  update: (dto: UpdateProfileDto): Promise<ProfileResponseDto> =>
    apiPatch<ProfileResponseDto>('/me/profile', dto),
};
