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
  ageGroup: string;      // e.g. "U14" (derived)
  gender: Gender;
  school?: string;
  skillLevel?: SkillLevel;
  trainers: TrainerAssociation[];
  createdAt: string;
}

export interface TrainerAssociation {
  trainerId: string;
  trainerName: string;
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
  listChildren: (): Promise<PaginatedChildren> =>
    apiGet<PaginatedChildren>('/players/me/children'),

  createChild: (dto: CreateChildDto): Promise<ChildProfileResponse> =>
    apiPost<ChildProfileResponse>('/players/me/children', dto),

  addTrainer: (childId: string, dto: AddChildTrainerDto): Promise<unknown> =>
    apiPost(`/players/me/children/${childId}/trainers`, dto),

  removeTrainer: (childId: string, trainerId: string): Promise<unknown> =>
    apiDelete(`/players/me/children/${childId}/trainers/${trainerId}`),

  updateTokenSetting: (childId: string, dto: TokenSettingDto): Promise<unknown> =>
    apiPatch(`/players/me/children/${childId}/token-setting`, dto),
};
