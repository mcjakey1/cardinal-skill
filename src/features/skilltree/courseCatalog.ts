import { supabase } from '@/lib/supabase';
import {
  normalizeCatalogCourses,
  type CatalogCourse,
  type CatalogKind,
  type CatalogRow,
  type CommunityVisibility,
} from './courseCatalogModel';

export type { CatalogCourse, CatalogKind, CommunityVisibility } from './courseCatalogModel';

export async function fetchCourseCatalog(kind: CatalogKind): Promise<CatalogCourse[]> {
  const { data, error } = await supabase.rpc('course_catalog', { p_course_kind: kind });
  if (error) throw error;
  return normalizeCatalogCourses((data ?? []) as CatalogRow[]);
}

export async function resolveSharedCourse(shareCode: string): Promise<CatalogCourse | null> {
  const { data, error } = await supabase.rpc('resolve_shared_course', {
    p_share_code: shareCode.trim().toLocaleLowerCase(),
  });
  if (error) throw error;
  return normalizeCatalogCourses((data ?? []) as CatalogRow[])[0] ?? null;
}

export async function joinPublishedCourse(courseId: string): Promise<string> {
  const { data, error } = await supabase.rpc('join_published_course', { p_course_id: courseId });
  if (error) throw error;
  if (typeof data !== 'string') throw new Error('The joined course did not return its id.');
  return data;
}

export async function publishCommunityCourse(
  courseId: string,
  visibility: CommunityVisibility,
): Promise<string> {
  const { data, error } = await supabase.rpc('publish_community_course', {
    p_course_id: courseId,
    p_discoverability: visibility,
  });
  if (error) throw new Error(error.message || 'Community publishing failed.');
  if (typeof data !== 'string') throw new Error('The shared course did not return a share code.');
  return data;
}

export async function archiveSharedCourse(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_shared_course', { p_course_id: courseId });
  if (error) throw error;
}

export async function fetchInstructorVerification(): Promise<boolean> {
  const { data, error } = await supabase
    .from('verified_instructors')
    .select('user_id')
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return false;
    throw error;
  }
  return Boolean(data);
}

export async function publishOfficialCourse(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_official_course', { p_course_id: courseId });
  if (error) throw error;
}
