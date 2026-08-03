import { supabase } from '@/lib/supabase';
import type { Prereq, SkillNode, Tree } from './types';

export interface TreeSnapshot {
  tree: Tree;
  masteredIds: string[];
  xp: number;
}

/**
 * One chart plus the signed-in student's progress on it.
 *
 * RLS scopes `node_progress` and `xp_events` to the caller, so there is no user
 * id in these queries — the database applies it. Do not add one; a client-side
 * filter would look like the security control and isn't.
 */
export async function fetchTree(courseId: string): Promise<TreeSnapshot> {
  const [nodesRes, prereqsRes, progressRes, xpRes] = await Promise.all([
    supabase
      .from('skill_nodes')
      .select('id, course_id, track_id, title, description, kind, xp_reward, x, y, sort_order')
      .eq('course_id', courseId)
      .order('sort_order'),
    supabase.from('node_prereqs').select('node_id, prereq_id').eq('course_id', courseId),
    supabase.from('node_progress').select('node_id').eq('status', 'mastered'),
    supabase.rpc('total_xp_for_course', { p_course_id: courseId }),
  ]);

  const firstError = nodesRes.error ?? prereqsRes.error ?? progressRes.error ?? xpRes.error;
  if (firstError) throw firstError;

  const nodes: SkillNode[] = (nodesRes.data ?? []).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    trackId: r.track_id,
    title: r.title,
    description: r.description ?? '',
    kind: r.kind,
    xpReward: r.xp_reward,
    x: r.x,
    y: r.y,
    sortOrder: r.sort_order,
  }));

  const prereqs: Prereq[] = (prereqsRes.data ?? []).map((r) => ({
    nodeId: r.node_id,
    prereqId: r.prereq_id,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));

  return {
    tree: { nodes, prereqs },
    masteredIds: (progressRes.data ?? []).map((r) => r.node_id).filter((id) => nodeIds.has(id)),
    xp: (xpRes.data as number | null) ?? 0,
  };
}
