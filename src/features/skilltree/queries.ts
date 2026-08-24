import { supabase } from '@/lib/supabase';
import {
  DEMO_COURSE_ID,
  DEMO_COURSE_TITLE,
  demoMasteredIds,
  demoTree,
  demoXp,
} from './demoTree';
import { demoMissions } from './demoMissions';
import { findMockCourse } from './mockCourses';
import { loadCachedTree } from '@/lib/courseCache';
import type { Mission, Prereq, SkillNode, Tree } from './types';

export interface TreeSnapshot {
  tree: Tree;
  masteredIds: string[];
  xp: number;
  /** The course's own name. The chart screen puts it on the field. */
  title: string;
  /** The work inside the nodes. A chart with no missions still renders. */
  missions: Mission[];
  /** Missions this student has finished. RLS scopes it; there is no user id here. */
  completedMissionIds: string[];
}

/**
 * One chart plus the signed-in student's progress on it.
 *
 * RLS scopes `node_progress` and `xp_events` to the caller, so there is no user
 * id in these queries — the database applies it. Do not add one; a client-side
 * filter would look like the security control and isn't.
 */
export async function fetchTree(courseId: string): Promise<TreeSnapshot> {
  const mock = findMockCourse(courseId);
  if (mock) {
    return {
      tree: mock.tree,
      missions: mock.missions,
      masteredIds: [],
      completedMissionIds: [],
      xp: 0,
      title: mock.title,
    };
  }
  // ponytail: `/tree/demo` reads a fixture so the chart is viewable with no
  // Supabase project. Remove with `demoTree.ts` once seeding is routine.
  if (courseId === DEMO_COURSE_ID) {
    return {
      tree: demoTree,
      masteredIds: demoMasteredIds,
      xp: demoXp,
      title: DEMO_COURSE_TITLE,
      missions: demoMissions,
      completedMissionIds: [],
    };
  }

  const [nodesRes, prereqsRes, progressRes, xpRes, courseRes, missionsRes, missionProgressRes] =
    await Promise.all([
      supabase
        .from('skill_nodes')
        .select(
          'id, course_id, track_id, title, description, kind, icon_key, xp_reward, syllabus_topic, universal_skill, learning_objectives, x, y, sort_order, quest_title, quest_subtitle, title_override, achievement_title, achievement_description, parent_node_id, graded, archived',
        )
        .eq('course_id', courseId)
        .order('sort_order'),
      supabase.from('node_prereqs').select('node_id, prereq_id').eq('course_id', courseId),
      supabase.from('node_progress').select('node_id').eq('status', 'mastered'),
      supabase.rpc('total_xp_for_course', { p_course_id: courseId }),
      supabase.from('courses').select('title').eq('id', courseId).maybeSingle(),
      supabase
        .from('missions')
        .select('id, node_id, title, description, kind, xp_reward, estimated_minutes')
        .eq('course_id', courseId)
        .order('sort_order'),
      // No user id: RLS scopes mission_progress to the caller. Adding one here
      // would look like the control and isn't.
      supabase.from('mission_progress').select('mission_id'),
    ]);

  const firstError = nodesRes.error ?? prereqsRes.error ?? progressRes.error ?? xpRes.error;
  if (firstError) {
    const cached = await loadCachedTree(courseId);
    if (cached) return cached;
    throw firstError;
  }

  const nodes: SkillNode[] = (nodesRes.data ?? []).map((r) => ({
    id: r.id,
    courseId: r.course_id,
    trackId: r.track_id,
    title: r.title,
    description: r.description ?? '',
    kind: r.kind,
    iconKey: r.icon_key,
    xpReward: r.xp_reward,
    moduleName: r.syllabus_topic ?? undefined,
    universalSkill: r.universal_skill ?? undefined,
    learningObjectives: r.learning_objectives ?? undefined,
    learningObjective: r.learning_objectives?.[0] ?? undefined,
    x: r.x,
    y: r.y,
    sortOrder: r.sort_order,
    questTitle: r.quest_title,
    questSubtitle: r.quest_subtitle,
    titleOverride: r.title_override,
    achievementTitle: r.achievement_title,
    achievementDescription: r.achievement_description,
    parentNodeId: r.parent_node_id,
    // Only an explicit `false` is supplemental. Every node written before help
    // subtrees existed came from a syllabus and is graded.
    graded: r.graded,
    // Retired by the owner. RLS hides these rows from students entirely, so a
    // non-owner never sees one; the owner does, and needs the flag to tell a
    // retired node from a live one and to restore it.
    archived: r.archived,
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
    // A course row that RLS hides, or that was deleted between queries, still
    // has a chart worth drawing — it just does not have a name to print.
    title: courseRes.data?.title ?? 'Untitled course',
    // Same tolerance for missions: a chart whose missions failed to load is a
    // chart with nodes worth their stored XP, not an error screen.
    missions: (missionsRes.data ?? [])
      .filter((row) => nodeIds.has(row.node_id))
      .map((r) => ({
        id: r.id,
        skillId: r.node_id,
        title: r.title,
        description: r.description ?? '',
        kind: r.kind,
        xpReward: r.xp_reward,
        estimatedMinutes: r.estimated_minutes ?? undefined,
      })),
    completedMissionIds: (missionProgressRes.data ?? []).map((r) => r.mission_id),
  };
}
