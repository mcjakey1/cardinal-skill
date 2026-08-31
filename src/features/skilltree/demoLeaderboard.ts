import type { LeaderboardEntry } from './recordQueries';

/** Fictional standings shown only for the bundled demo course. */
export const demoLeaderboard: readonly LeaderboardEntry[] = [
  { rank: 1, displayName: 'Mina Reyes', level: 3, xp: 820, mastered: 9, totalNodes: 12, streak: 8, participantCount: 10, isCurrentUser: false },
  { rank: 2, displayName: 'Theo Lim', level: 3, xp: 760, mastered: 8, totalNodes: 12, streak: 5, participantCount: 10, isCurrentUser: false },
  { rank: 3, displayName: 'Samira Cruz', level: 3, xp: 690, mastered: 8, totalNodes: 12, streak: 6, participantCount: 10, isCurrentUser: false },
  { rank: 4, displayName: 'You', level: 2, xp: 320, mastered: 4, totalNodes: 12, streak: 1, participantCount: 10, isCurrentUser: true },
  { rank: 5, displayName: 'Ivo Santos', level: 2, xp: 285, mastered: 4, totalNodes: 12, streak: 3, participantCount: 10, isCurrentUser: false },
  { rank: 6, displayName: 'Nadia Flores', level: 2, xp: 250, mastered: 3, totalNodes: 12, streak: 2, participantCount: 10, isCurrentUser: false },
  { rank: 7, displayName: 'Paolo Tan', level: 2, xp: 210, mastered: 3, totalNodes: 12, streak: 1, participantCount: 10, isCurrentUser: false },
  { rank: 8, displayName: 'Aya Navarro', level: 2, xp: 170, mastered: 2, totalNodes: 12, streak: 2, participantCount: 10, isCurrentUser: false },
  { rank: 9, displayName: 'Luis Dela Cruz', level: 2, xp: 120, mastered: 2, totalNodes: 12, streak: 1, participantCount: 10, isCurrentUser: false },
  { rank: 10, displayName: 'Celine Ong', level: 1, xp: 60, mastered: 1, totalNodes: 12, streak: 1, participantCount: 10, isCurrentUser: false },
];
