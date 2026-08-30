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
): Promise<void> {
  const { error } = await supabase.rpc('publish_community_course', {
    p_course_id: courseId,
    p_discoverability: visibility,
  });
  if (error) throw new Error(error.message || 'Community publishing failed.');
}

export async function archiveSharedCourse(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('archive_shared_course', { p_course_id: courseId });
  if (error) throw error;
}

export async function fetchInstructorVerification(): Promise<boolean> {
  // A revoked verification keeps its row — that record is what stops the
  // sign-up trigger granting the account verification a second time — so
  // presence alone is not the answer. An unrevoked row is.
  //
  // The column arrives with migration 0028, and a project that has not applied
  // it yet answers a server-side `revoked_at is null` filter with a hard 42703
  // rather than a row. Selecting the row and reading the flag here works
  // against both schemas, which matters because every caller of this — sign-in
  // role evidence included — treats a throw as "not an instructor".
  //
  // `.eq('user_id', ...)` is here for correctness, not access control — RLS
  // still decides which rows exist for this caller. 0034 opened the table to
  // administrators, so an unfiltered read returns every badge on the site:
  // `maybeSingle()` then throws PGRST116 on two rows or more, and on exactly
  // one row answers with somebody else's `revoked_at`. Naming whose row is the
  // answer is what makes the question well-formed.
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return false;
  const { data, error } = await supabase
    .from('verified_instructors')
    .select('*')
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') return false;
    throw error;
  }
  if (!data) return false;
  return !(data as { revoked_at?: string | null }).revoked_at;
}

export async function publishOfficialCourse(courseId: string): Promise<void> {
  const { error } = await supabase.rpc('publish_official_course', { p_course_id: courseId });
  if (error) throw error;
}
