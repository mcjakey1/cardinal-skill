import { bytesToBase64 } from './base64';
import { callEdgeFunction, type EdgeFunctionTelemetry } from './edgeFunctions';
import { extractTextFromPDF } from './pdfTextExtraction';
import { supabase } from './supabase';
import {
  MAX_PDF_BYTES,
  importedCourseTitle,
  instructorImportError,
  syllabusFileAccepted,
  syllabusParseRequest,
  type SyllabusDocument,
} from '@/features/skilltree/instructorCourseImport';

export {
  importedCourseTitle,
  instructorImportError,
  syllabusFileAccepted,
  type SyllabusDocument,
} from '@/features/skilltree/instructorCourseImport';

/**
 * Reading a syllabus and turning it into a course, once, for both screens that
 * do it. The student check-in and the instructor workspace differ only in what
 * they show while it runs and what they do once the course exists, so those are
 * callbacks rather than a second copy of the flow.
 */

export interface SyllabusFile {
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number;
}

export interface SyllabusSelection {
  document: SyllabusDocument | null;
  text: string;
  /** Ready to show next to the picker, already a sentence. */
  status: string;
}

/** Facts as they happen. Each screen writes them in its own voice. */
export type SyllabusReadEvent =
  | { kind: 'fetching' }
  | { kind: 'fetched'; status: number; durationMs: number }
  | { kind: 'pdf'; bytes: number; base64Length: number }
  | { kind: 'extracting' }
  | { kind: 'extracted'; pageCount: number; characters: number; durationMs: number; truncated: boolean }
  | { kind: 'no-text-layer' }
  | { kind: 'extract-failed' }
  | { kind: 'text'; characters: number };

/**
 * Read a picked file into something the parser accepts. Throws with a sentence
 * a person can act on — every caller shows it verbatim.
 */
export async function readSyllabusFile(
  file: SyllabusFile,
  onEvent?: (event: SyllabusReadEvent) => void,
): Promise<SyllabusSelection> {
  if (!syllabusFileAccepted(file.name)) {
    throw new Error('That file type cannot be read. Choose a PDF, TXT, or Markdown file, or paste the syllabus text instead.');
  }

  const startedAt = Date.now();
  onEvent?.({ kind: 'fetching' });
  const response = await fetch(file.uri);
  onEvent?.({ kind: 'fetched', status: response.status, durationMs: Date.now() - startedAt });
  if (!response.ok) {
    throw new Error(`This device could not open that file (HTTP ${response.status}). Choose it again, or paste the syllabus text instead.`);
  }

  const isPdf = /\.pdf$/i.test(file.name) || file.mimeType === 'application/pdf';
  if (!isPdf) {
    const body = await response.text();
    if (!body.trim()) {
      throw new Error('That file has no text in it. Choose a different file, or paste the syllabus text instead.');
    }
    onEvent?.({ kind: 'text', characters: body.length });
    return {
      document: null,
      text: body,
      status: `${body.length.toLocaleString()} characters ready to import`,
    };
  }

  const buffer = await response.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new Error('That PDF is larger than 15 MB. Save a smaller copy, or paste the syllabus text instead.');
  }
  const base64 = bytesToBase64(bytes);
  onEvent?.({ kind: 'pdf', bytes: bytes.byteLength, base64Length: base64.length });

  // A PDF with no readable text layer is not a failure: the parser accepts the
  // document itself and reads it server-side.
  onEvent?.({ kind: 'extracting' });
  let text = '';
  try {
    const extractStartedAt = Date.now();
    const extracted = await extractTextFromPDF(buffer);
    if (extracted) {
      text = extracted.text;
      onEvent?.({
        kind: 'extracted',
        pageCount: extracted.pageCount,
        characters: extracted.text.length,
        durationMs: Date.now() - extractStartedAt,
        truncated: extracted.truncated,
      });
    } else {
      onEvent?.({ kind: 'no-text-layer' });
    }
  } catch {
    onEvent?.({ kind: 'extract-failed' });
  }

  // Say so when the text box stays empty. On a phone it always does — nothing
  // there can decode a PDF — and an empty box next to a chosen file otherwise
  // reads as a file that failed to load.
  const kilobytes = Math.ceil(bytes.byteLength / 1024);
  return {
    document: { name: file.name, mediaType: 'application/pdf', base64 },
    text,
    status: text.trim()
      ? `${kilobytes} KB PDF ready to import`
      : `${kilobytes} KB PDF ready to import. This device cannot read PDF text, so the parser reads the document itself.`,
  };
}

export interface SyllabusParseResult {
  course_id: string;
  course_code: string | null;
  course_name: string;
  course_description?: string | null;
  semester_description: string | null;
  units?: number | null;
  node_count: number;
  mission_count: number;
  edge_count: number;
}

export interface ParserStatus {
  status: 'online';
  model?: string;
}

export type ImportStage = 'creating' | 'parsing' | 'saved' | 'discarded';

export interface SyllabusImportOutcome {
  courseId: string;
  title: string;
  result: SyllabusParseResult;
}

const STATUS_TIMEOUT_MS = 12_000;
/** A long syllabus streams for minutes; the Edge Function's own ceiling is lower. */
const PARSE_TIMEOUT_MS = 210_000;

/** Is the parser reachable and configured? Asked before anyone picks a file. */
export function checkParserStatus(): Promise<ParserStatus> {
  return callEdgeFunction<ParserStatus>('parse-syllabus', { action: 'status' }, STATUS_TIMEOUT_MS);
}

/**
 * Create the course, parse the syllabus into it, and leave nothing behind if
 * the parse fails. Resolves only when a chart is actually saved.
 */
export async function runSyllabusImport(
  input: {
    titleOverride: string;
    fileName: string | null;
    text: string;
    document: SyllabusDocument | null;
  },
  hooks?: {
    onStage?: (stage: ImportStage) => void;
    telemetry?: EdgeFunctionTelemetry;
  },
): Promise<SyllabusImportOutcome> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    throw new Error('Your sign-in has expired. Sign in again, then start the import.');
  }

  const title = importedCourseTitle(input.titleOverride, input.fileName);
  hooks?.onStage?.('creating');
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .insert({ title, owner_id: auth.user.id })
    .select('id')
    .single();
  if (courseError || !course) {
    throw new Error(instructorImportError(courseError ?? new Error('The course was not created. Try again.')));
  }

  try {
    hooks?.onStage?.('parsing');
    const result = await callEdgeFunction<SyllabusParseResult>(
      'parse-syllabus',
      syllabusParseRequest({ courseId: course.id, text: input.text, document: input.document }),
      PARSE_TIMEOUT_MS,
      hooks?.telemetry,
    );
    if (typeof result.node_count !== 'number') {
      throw new Error('The parser did not return a saved chart. Try the import again.');
    }
    hooks?.onStage?.('saved');
    return { courseId: course.id, title, result };
  } catch (cause) {
    // Nothing partial survives a failed parse. An empty course row would sit in
    // the list looking like a course whose chart simply never loads.
    await supabase.from('courses').delete().eq('id', course.id);
    hooks?.onStage?.('discarded');
    throw new Error(instructorImportError(cause));
  }
}
