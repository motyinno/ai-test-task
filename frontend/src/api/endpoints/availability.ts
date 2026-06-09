import { apiGet, apiPut } from '../client';

export interface AvailabilitySlot {
  dayOfWeek: 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
  startTime: string;  // "HH:MM"
  endTime: string;    // "HH:MM"
}

export interface SetAvailabilityDto {
  slots: AvailabilitySlot[];
}

export interface AvailabilityResponse {
  slots: AvailabilitySlot[];
}

/**
 * The backend returns availability as a bare array of slot rows
 * (`[{ dayOfWeek, startTime, endTime, ... }]`), but the grids consume
 * `{ slots }`. Normalize both shapes (array OR `{ slots }`) so saved
 * availability actually loads back into the grid. Without this, GET resolves
 * to an array, `data.slots` is undefined, and the grid renders empty — making
 * every save look like it did nothing.
 */
function normalizeAvailability(raw: unknown): AvailabilityResponse {
  const rows = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { slots?: unknown })?.slots)
      ? (raw as { slots: unknown[] }).slots
      : [];
  const slots: AvailabilitySlot[] = rows.map((s) => {
    const slot = s as { dayOfWeek: AvailabilitySlot['dayOfWeek']; startTime: string; endTime: string };
    return {
      dayOfWeek: slot.dayOfWeek,
      // Tolerate "HH:MM" or "HH:MM:SS" — the grid keys on "HH:MM".
      startTime: slot.startTime?.slice(0, 5),
      endTime: slot.endTime?.slice(0, 5),
    };
  });
  return { slots };
}

export const availabilityApi = {
  getPlayerAvailability: (profileId: string): Promise<AvailabilityResponse> =>
    apiGet<unknown>(`/players/${profileId}/availability`).then(normalizeAvailability),

  setPlayerAvailability: (profileId: string, dto: SetAvailabilityDto): Promise<AvailabilityResponse> =>
    apiPut<unknown>(`/players/${profileId}/availability`, dto).then(normalizeAvailability),

  getCoachAvailability: (): Promise<AvailabilityResponse> =>
    apiGet<unknown>('/coaches/me/availability').then(normalizeAvailability),

  setCoachAvailability: (dto: SetAvailabilityDto): Promise<AvailabilityResponse> =>
    apiPut<unknown>('/coaches/me/availability', dto).then(normalizeAvailability),
};
