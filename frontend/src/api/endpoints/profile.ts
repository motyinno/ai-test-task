import { apiGet, apiPatch } from '../client';

/** Q-01.01 resolved: SkillLevel enum */
export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';

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
  // Player-specific (Q-01.01, Q-01.02)
  school?: string;
  jerseyNumber?: string;
  skillLevel?: SkillLevel;
  dateOfBirth?: string;   // ISO date (Q-01.02)
  age?: number;           // derived (Q-01.02)
  ageGroup?: string;      // derived (Q-01.02)
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
  skillLevel?: SkillLevel;    // Q-01.01
  emergencyContact?: string;
}

export const profileApi = {
  get: (): Promise<ProfileResponseDto> => apiGet<ProfileResponseDto>('/me/profile'),
  update: (dto: UpdateProfileDto): Promise<ProfileResponseDto> =>
    apiPatch<ProfileResponseDto>('/me/profile', dto),
};
