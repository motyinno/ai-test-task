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

export const availabilityApi = {
  getPlayerAvailability: (profileId: string): Promise<AvailabilityResponse> =>
    apiGet<AvailabilityResponse>(`/players/${profileId}/availability`),

  setPlayerAvailability: (profileId: string, dto: SetAvailabilityDto): Promise<AvailabilityResponse> =>
    apiPut<AvailabilityResponse>(`/players/${profileId}/availability`, dto),

  getCoachAvailability: (): Promise<AvailabilityResponse> =>
    apiGet<AvailabilityResponse>('/coaches/me/availability'),

  setCoachAvailability: (dto: SetAvailabilityDto): Promise<AvailabilityResponse> =>
    apiPut<AvailabilityResponse>('/coaches/me/availability', dto),
};
