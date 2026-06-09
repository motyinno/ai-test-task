import { apiGet, apiPut } from '../client';
import { clearCsrfCache } from '../client';

export interface BrandingResponseDto {
  logoUrl?: string;
  primaryColorHex: string;
}

export interface UpdateBrandingDto {
  logoUrl?: string;
  primaryColorHex: string;
}

export const brandingApi = {
  get: (): Promise<BrandingResponseDto> =>
    apiGet<BrandingResponseDto>('/trainers/me/branding'),

  update: (dto: UpdateBrandingDto): Promise<BrandingResponseDto> =>
    apiPut<BrandingResponseDto>('/trainers/me/branding', dto),

  uploadLogo: async (file: File): Promise<{ logoUrl: string }> => {
    // For multipart uploads we bypass the JSON client wrapper
    const { ApiError } = await import('../errors');

    // Get CSRF token
    const csrfRes = await fetch('/api/v1/auth/csrf', {
      credentials: 'include',
    });
    const { token: csrf } = await csrfRes.json() as { token: string };

    const formData = new FormData();
    formData.append('logo', file); // backend FileInterceptor('logo') expects this field name

    const res = await fetch('/api/v1/trainers/me/branding/logo', {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-CSRF-Token': csrf },
      body: formData,
    });

    if (!res.ok) {
      const envelope = await res.json().catch(() => ({})) as {
        statusCode?: number; message?: string; errorCode?: string;
      };
      throw new ApiError(
        envelope.message ?? res.statusText,
        envelope.statusCode ?? res.status,
        envelope.errorCode ?? 'UPLOAD_ERROR',
      );
    }

    return res.json() as Promise<{ logoUrl: string }>;
  },
};
