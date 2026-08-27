export const SYLLABUS_FILE_PATTERN = /\.(pdf|txt|md)$/i;

export function syllabusFileAccepted(name: string): boolean {
  return SYLLABUS_FILE_PATTERN.test(name.trim());
}

export function importedCourseTitle(override: string, fileName?: string | null): string {
  const chosen = override.trim();
  if (chosen) return chosen;
  const fromFile = fileName?.replace(SYLLABUS_FILE_PATTERN, '').trim();
  return fromFile || 'Imported course';
}

/** Supabase failures are plain objects, not always Error instances. */
export function instructorImportError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  if (typeof error === 'string' && error.trim()) return error.trim();
  return 'The course could not be saved. Check your connection and try again.';
}
