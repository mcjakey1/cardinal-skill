export interface ActivityCell {
  key: string;
  label: string;
  active: boolean;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

export function activityPunchCard(
  timestamps: Iterable<string>,
  today: Date = new Date(),
  length = 14,
): ActivityCell[] {
  const active = new Set<string>();
  for (const timestamp of timestamps) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) active.add(dayKey(parsed));
  }
  return Array.from({ length: Math.max(1, length) }, (_, index) => {
    const date = addDays(today, index - Math.max(1, length) + 1);
    const key = dayKey(date);
    return {
      key,
      label: date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 1),
      active: active.has(key),
    };
  });
}

export function nodesPerWeek(
  masteredAt: Iterable<string>,
  today: Date = new Date(),
  windowDays = 28,
): number {
  const start = addDays(today, -Math.max(1, windowDays) + 1).getTime();
  const end = today.getTime();
  let completions = 0;
  for (const timestamp of masteredAt) {
    const time = new Date(timestamp).getTime();
    if (Number.isFinite(time) && time >= start && time <= end) completions += 1;
  }
  return Math.round((completions / (Math.max(1, windowDays) / 7)) * 10) / 10;
}

export function completionEstimateDays(remainingNodes: number, velocity: number): number | null {
  if (!Number.isFinite(remainingNodes) || remainingNodes <= 0) return 0;
  if (!Number.isFinite(velocity) || velocity <= 0) return null;
  return Math.ceil(remainingNodes / (velocity / 7));
}

export function playerTitle(level: number): string {
  if (level >= 10) return 'Grandmaster';
  if (level >= 7) return 'Specialist';
  if (level >= 4) return 'Apprentice';
  return 'Initiate';
}
