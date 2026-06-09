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

  /**
   * Upload a profile photo (multipart). Bypasses the JSON api client and uses the
   * backend's expected field name `photo` (FileInterceptor('photo')).
   */
  uploadPhoto: async (file: File): Promise<{ photoUrl: string; thumbnailUrl?: string }> => {
    const csrfRes = await fetch('/api/v1/auth/csrf', { credentials: 'include' });
    const { token: csrf } = (await csrfRes.json()) as { token: string };
    const formData = new FormData();
    formData.append('photo', file);
    const res = await fetch('/api/v1/me/profile/photo', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
      body: formData,
    });
    if (!res.ok) {
      const { ApiError } = await import('../errors');
      let msg = 'Photo upload failed';
      try {
        const body = (await res.json()) as { message?: string };
        if (body.message) msg = body.message;
      } catch { /* ignore */ }
      throw new ApiError(msg, res.status, 'PHOTO_UPLOAD_FAILED');
    }
    return (await res.json()) as { photoUrl: string; thumbnailUrl?: string };
  },
};
