import { supabase } from '@/lib/supabase';

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  level: number;
  xp: number;
  mastered: number;
  totalNodes: number;
  streak: number;
  participantCount: number;
  isCurrentUser: boolean;
}

export interface RecordEvent {
  courseId: string;
  nodeId: string;
  completedAt: string;
  kind: 'node' | 'mission';
}

interface LeaderboardRow {
  rank_position: number;
  display_name: string;
  level: number;
  xp: number;
  mastered: number;
  total_nodes: number;
  streak: number;
  participant_count: number;
  is_current_user: boolean;
}

interface RecordEventRow {
  course_id: string;
  node_id: string;
  completed_at: string;
  event_kind: string;
}

export async function fetchLeaderboard(courseId: string | null): Promise<LeaderboardEntry[]> {
  const { data, error } = await supabase.rpc('student_leaderboard', { p_course_id: courseId });
  if (error) throw error;
  return ((data ?? []) as LeaderboardRow[]).map((row) => ({
    rank: Number(row.rank_position),
    displayName: String(row.display_name),
    level: Number(row.level),
    xp: Number(row.xp),
    mastered: Number(row.mastered),
    totalNodes: Number(row.total_nodes),
    streak: Number(row.streak),
    participantCount: Number(row.participant_count),
    isCurrentUser: Boolean(row.is_current_user),
  }));
}

export async function fetchRecordEvents(courseId: string | null): Promise<RecordEvent[]> {
  const { data, error } = await supabase.rpc('own_record_events', { p_course_id: courseId });
  if (error) throw error;
  return ((data ?? []) as RecordEventRow[]).map((row) => ({
    courseId: String(row.course_id),
    nodeId: String(row.node_id),
    completedAt: String(row.completed_at),
    kind: row.event_kind === 'node' ? 'node' : 'mission',
  }));
}

export async function fetchLeaderboardVisibility(): Promise<boolean | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('social_opt_in')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.social_opt_in ?? false;
}

export async function setLeaderboardVisibility(visible: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_leaderboard_visibility', { p_visible: visible });
  if (error) throw error;
  return Boolean(data);
}
