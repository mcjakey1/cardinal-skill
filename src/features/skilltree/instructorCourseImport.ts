/**
 * The pure half of syllabus importing, shared by the student check-in screen
 * and the instructor workspace. Everything here is a plain function so it can
 * be exercised without Supabase, React, or a device; the network half lives in
 * `src/lib/syllabusImport.ts`.
 */

export const SYLLABUS_FILE_PATTERN = /\.(pdf|txt|md)$/i;

/** The Edge Function rejects a larger encoded document with HTTP 413. */
export const MAX_PDF_BYTES = 15_000_000;

export interface SyllabusDocument {
  name: string;
  mediaType: 'application/pdf';
  base64: string;
}

export function syllabusFileAccepted(name: string): boolean {
  return SYLLABUS_FILE_PATTERN.test(name.trim());
}

export function importedCourseTitle(override: string, fileName?: string | null): string {
  const chosen = override.trim();
  if (chosen) return chosen;
  const fromFile = fileName?.replace(SYLLABUS_FILE_PATTERN, '').trim();
  return fromFile || 'Imported course';
}

/**
 * Extracted text wins over the PDF bytes: it is far smaller and the parser
 * reads it directly. The document is the fallback for a scanned or native PDF
 * whose text layer this device could not read. Only ever one of the two, so a
 * long syllabus is not uploaded twice.
 */
export function syllabusParseRequest(input: {
  courseId: string;
  text: string;
  document: SyllabusDocument | null;
}): Record<string, unknown> {
  const extracted = input.text.trim();
  if (extracted) return { courseId: input.courseId, syllabusText: extracted };
  return {
    courseId: input.courseId,
    documentBase64: input.document?.base64,
    documentMediaType: input.document?.mediaType,
    documentName: input.document?.name,
  };
}

/**
 * A schema that is behind the app answers in machine language and always will:
 * `column verified_instructors.revoked_at does not exist` is the literal text a
 * project missing a migration produces. Nobody can act on it, and no server
 * message is coming to replace it, so these codes are answered here.
 */
const BEHIND_MIGRATIONS =
  'This app is newer than the database it is connected to. Ask whoever set up this project to apply the latest database updates, then try the import again.';

const SCHEMA_DRIFT = new Set(['42703', 'PGRST204', 'PGRST205']);

/** Postgres writes this one, and it names a table rather than a next step. */
const RAW_RLS = /row[- ]level security/i;

function failureCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && code.trim() ? code.trim() : null;
}

function failureMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  if (typeof error === 'string') return error.trim();
  return '';
}

/**
 * One sentence saying what went wrong and what to do next.
 *
 * Supabase failures are plain objects rather than `Error` instances, so
 * `err.message` alone loses them. Where the server already wrote for people —
 * the Edge Function's errors, and every `raise exception` in the migrations,
 * including the one refusing an unverified instructor — that sentence wins:
 * it knows which of several reasons applied and this function does not.
 */
export function instructorImportError(error: unknown): string {
  const code = failureCode(error);
  if (SCHEMA_DRIFT.has(code ?? '')) return BEHIND_MIGRATIONS;
  // PostgREST says "JWT expired", which reads as a fault rather than an errand.
  if (code === 'PGRST301') return 'Your sign-in has expired. Sign in again, then start the import.';
  const message = failureMessage(error);
  if (!message) return 'The course could not be saved. Check your connection and try again.';
  if (RAW_RLS.test(message)) {
    return 'Your account is not allowed to save this course. Sign out, sign back in, and try again.';
  }
  return message;
}
