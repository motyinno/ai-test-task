import { apiGet, apiPost } from '../client';

export interface InvitationPreview {
  valid: boolean;
  email: string;
}

export interface AcceptInvitationDto {
  token: string;
  password: string;
}

export const invitationApi = {
  /** Validate an invite token and preview the invitee's email. */
  preview: (token: string): Promise<InvitationPreview> =>
    apiGet<InvitationPreview>(`/auth/invite/${encodeURIComponent(token)}`),

  /** Accept the invite by setting a password. */
  accept: (dto: AcceptInvitationDto): Promise<{ ok: boolean }> =>
    apiPost<{ ok: boolean }>('/auth/invite/accept', dto),
};
