/**
 * The canvas backdrop, carried by the account instead of the device.
 *
 * Scoping is the policy's job, not this file's: `student_preferences` is
 * `user_id = auth.uid()` for every command, so neither call names a student.
 *
 * Every failure here is swallowed. A backdrop is decoration — an offline
 * device, an expired token, or a migration that has not run yet should leave a
 * student looking at the field they had, never at an error.
 */

import { supabase } from '@/lib/supabase';
import { MAX_ACCOUNT_URI, parseBackdrop, type Backdrop } from '@/theme/backdrops';

const TABLE = 'student_preferences';

/** The stored backdrop, or null when there is nothing to apply. */
export async function fetchAccountBackdrop(): Promise<Backdrop | null> {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select('canvas_backdrop')
      .maybeSingle();
    if (error || !data?.canvas_backdrop) return null;
    return parseBackdrop(data.canvas_backdrop);
  } catch {
    return null;
  }
}

/** Write-through. Returns whether the account actually took it. */
export async function saveAccountBackdrop(next: Backdrop): Promise<boolean> {
  try {
    // Refused here rather than sent and rejected. Migration 0014 bounds the row,
    // so an oversized backdrop would otherwise cost a round trip carrying every
    // one of those bytes, only to come back as a check violation this function
    // swallows — the request is the expensive part, not the failure.
    if ((next.imageUri?.length ?? 0) > MAX_ACCOUNT_URI) return false;

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return false;
    const { error } = await supabase
      .from(TABLE)
      .upsert(
        { user_id: userId, canvas_backdrop: next, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      );
    return !error;
  } catch {
    return false;
  }
}
