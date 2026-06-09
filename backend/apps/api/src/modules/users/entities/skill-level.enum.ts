/**
 * SkillLevel — trainer-assigned skill categorisation for player profiles.
 * Stored as a Postgres enum column on player_profiles.skill_level.
 *
 * Resolved: Q-01.01 (2026-06-09)
 */
export enum SkillLevel {
  BEGINNER = 'BEGINNER',
  INTERMEDIATE = 'INTERMEDIATE',
  ADVANCED = 'ADVANCED',
  ELITE = 'ELITE',
}
