const MIN_LADDER_RANK = 4;
const MIN_VISIBLE_RANK = 10;
const MAX_VISIBLE_RANK = 50;

export function getLeaderboardLadderRanks(
  participantCount: number,
  populatedRanks: readonly number[],
): number[] {
  const safeParticipantCount = Number.isFinite(participantCount)
    ? Math.max(0, Math.floor(participantCount))
    : 0;
  const highestPopulatedRank = populatedRanks.reduce(
    (highest, rank) => Number.isFinite(rank) ? Math.max(highest, rank) : highest,
    0,
  );
  const finalRank = Math.min(
    MAX_VISIBLE_RANK,
    Math.max(MIN_VISIBLE_RANK, safeParticipantCount, highestPopulatedRank),
  );

  return Array.from(
    { length: finalRank - MIN_LADDER_RANK + 1 },
    (_, index) => index + MIN_LADDER_RANK,
  );
}
