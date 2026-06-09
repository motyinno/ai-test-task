import { apiGet, apiPost, apiDelete, apiPatch } from '../client';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type SkillLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED' | 'ELITE';

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface ChildProfileResponse {
  id: string;
  name: string;
  dateOfBirth: string;   // ISO date "YYYY-MM-DD"
  age: number;           // derived by backend
  ageGroup?: string;     // e.g. "U14" (derived) — not present in current list DTO
  gender: Gender;
  school?: string;
  skillLevel?: SkillLevel;
  trainers: TrainerAssociation[];
  createdAt: string;
}

export interface TrainerAssociation {
  trainerId: string;
  /**
   * The list DTO (GET /players/me/children) does NOT include a human-readable
   * trainer name — it returns { trainerId, status, connectedAt }. Treat the name
   * as optional and degrade gracefully (show trainerId) when absent.
   * Backend DTO gap tracked separately.
   */
  trainerName?: string;
  status?: string;
  connectedAt?: string;
}

export interface CreateChildDto {
  name: string;
  dateOfBirth: string;   // ISO "YYYY-MM-DD"
  gender: Gender;
  school?: string;
  trainerIds?: string[];
  createLogin?: boolean;
}

export interface AddChildTrainerDto {
  shareLinkCode?: string;
  trainerId?: string;
}

export interface TokenSettingDto {
  allowTokenSpendWithoutApproval: boolean;
}

interface PaginatedChildren {
  data: ChildProfileResponse[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

// ─── API ──────────────────────────────────────────────────────────────────────

export const familyApi = {
  // The API returns a bare array for this small list; tolerate an envelope too.
  listChildren: async (): Promise<ChildProfileResponse[]> => {
    const res = await apiGet<ChildProfileResponse[] | PaginatedChildren>(
      '/players/me/children',
    );
    return Array.isArray(res) ? res : res.data;
  },

  createChild: (dto: CreateChildDto): Promise<ChildProfileResponse> =>
    apiPost<ChildProfileResponse>('/players/me/children', dto),

  addTrainer: (childId: string, dto: AddChildTrainerDto): Promise<unknown> =>
    apiPost(`/players/me/children/${childId}/trainers`, dto),

  removeTrainer: (childId: string, trainerId: string): Promise<unknown> =>
    apiDelete(`/players/me/children/${childId}/trainers/${trainerId}`),

  updateTokenSetting: (childId: string, dto: TokenSettingDto): Promise<unknown> =>
    apiPatch(`/players/me/children/${childId}/token-setting`, dto),
};
