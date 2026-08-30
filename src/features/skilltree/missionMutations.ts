import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';
import { editedTreeKey, saveEditedCourseSnapshot, type EditedCourse } from '@/lib/editedTree';
import { applyMissionUpdate, type MissionUpdate } from './missionEditing';

export type { MissionUpdate } from './missionEditing';

/** Owner-only RPC; migration 0018 performs the mission and node-total updates atomically. */
export async function persistMissionUpdate(update: MissionUpdate): Promise<void> {
  const { error } = await supabase.rpc('update_course_mission', {
    p_mission_id: update.id,
    p_title: update.title,
    p_description: update.description,
    p_xp_reward: update.xpReward,
    p_estimated_minutes: update.estimatedMinutes,
    p_difficulty: update.difficulty,
  });
  if (error) throw error;
}

/** A chart-local authoring draft must not shadow the mission just saved from Missions. */
export async function synchronizeEditedMission(courseId: string, update: MissionUpdate): Promise<void> {
  const key = editedTreeKey(courseId);
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return;
  const stored = JSON.parse(raw) as EditedCourse;
  const next = applyMissionUpdate(
    {
      ...stored,
      title: '', masteredIds: [], completedMissionIds: [], xp: 0,
    },
    update,
  );
  await saveEditedCourseSnapshot(courseId, { tree: next.tree, missions: next.missions });
}
