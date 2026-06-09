import { apiGet, apiPost } from '../client';

export type PaymentType = 'USD' | 'TOKEN';
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'CANCELLED';

export interface ApprovalRequestDto {
  id: string;
  childProfileId: string;
  childName: string;
  eventRef: string;
  amount: number;
  paymentType: PaymentType;
  status: ApprovalStatus;
  autoApproved: boolean;
  expiresAt?: string;
  resolvedAt?: string;
  parentNotes?: string;
  createdAt: string;
}

export interface ListApprovalsQueryDto {
  status?: ApprovalStatus;
  childProfileId?: string;
  page?: number;
  limit?: number;
}

interface PaginatedApprovals {
  data: ApprovalRequestDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface ResolveApprovalDto {
  parentNotes?: string;
}

export const approvalsApi = {
  list: (params?: ListApprovalsQueryDto): Promise<PaginatedApprovals> => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.childProfileId) qs.set('childProfileId', params.childProfileId);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    const queryStr = qs.toString();
    return apiGet<PaginatedApprovals>(`/approvals${queryStr ? `?${queryStr}` : ''}`);
  },

  approve: (id: string, dto?: ResolveApprovalDto): Promise<ApprovalRequestDto> =>
    apiPost<ApprovalRequestDto>(`/approvals/${id}/approve`, dto ?? {}),

  deny: (id: string, dto?: ResolveApprovalDto): Promise<ApprovalRequestDto> =>
    apiPost<ApprovalRequestDto>(`/approvals/${id}/deny`, dto ?? {}),
};
