import { apiGet, apiPost } from '../client';

export interface ShareLinkPreviewDto {
  valid: boolean;
  type: 'STATIC' | 'UNIQUE';
  trainerName: string;
  reason?: string;
}

export interface ShareLinkDto {
  id: string;
  code: string;
  url: string;
  type: 'STATIC' | 'UNIQUE';
  targetEmail?: string;
  expiresAt?: string;
  useCount: number;
  maxUses?: number;
  active: boolean;
}

export interface JoinViaLinkDto {
  name: string;
  email: string;
  password: string;
  phone?: string;
  playerName?: string;
  age?: number;
  gender?: string;
  associateProfileIds?: string[];
}

export const sharelinksApi = {
  validate: (code: string): Promise<ShareLinkPreviewDto> =>
    apiGet<ShareLinkPreviewDto>(`/sharelinks/${code}/validate`),

  join: (code: string, dto?: JoinViaLinkDto): Promise<unknown> =>
    apiPost(`/join/${code}`, dto),

  list: (): Promise<{ data: ShareLinkDto[]; meta: object }> =>
    apiGet<{ data: ShareLinkDto[]; meta: object }>('/sharelinks'),

  create: (dto: { type: 'STATIC' | 'UNIQUE'; targetEmail?: string }): Promise<ShareLinkDto> =>
    apiPost<ShareLinkDto>('/sharelinks', dto),

  revoke: (id: string): Promise<unknown> =>
    apiPost(`/sharelinks/${id}/revoke`),
};
