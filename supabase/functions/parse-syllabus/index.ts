/** Parse a syllabus into an owner-scoped course DAG. Provider keys stay server-side. */
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { parseJsonObjectText } from '../_shared/bai.ts';
import {
  normalizeTieredCourseDag,
  placeSynthesisAtCourseEnd,
  requirePedagogicalCourseGraph,
} from '../_shared/courseGraph.ts';
import { layoutCourseGraph } from '../_shared/courseLayout.ts';
import {
  isMeaningfulSyllabusTopic,
  MAX_PARSED_SKILLS,
  MIN_PARSED_SKILLS,
  missionDifficultyForTier,
  requireSyllabusCoverage,
  requireSyllabusScaledSkillCount,
  requireUniqueParserNodeIds,
  expandSharedLeadTopic,
  repairGenerationSeed,
  repairNodeTarget,
  reconcileGroupedSyllabusCoverage,
  scaleMission,
  syllabusGraphRepairPrompt,
  SYLLABUS_GRAPH_SYSTEM_PROMPT,
  SYLLABUS_OUTLINE_SYSTEM_PROMPT,
  skillCountRangeForWeeks,
  stableGenerationSeed,
} from '../_shared/curriculum.ts';
import {
  checkGeminiHealth,
  GEMINI_MODEL,
  GeminiError,
  requestGeminiCompletion,
} from '../_shared/gemini.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const ICONS = [
  'pixel_dice', 'pixel_coin', 'pixel_grid', 'pixel_bar_chart', 'pixel_trophy',
  'pixel_boss_skull', 'pixel_cursor_arrow', 'pixel_brackets', 'pixel_scroll',
  'pixel_spellbook', 'pixel_binary_tree', 'pixel_pointer', 'pixel_chip',
  'pixel_circuit', 'pixel_gate', 'pixel_potion', 'pixel_flask', 'pixel_atom',
] as const;
const KINDS = ['topic', 'reading', 'assignment', 'assessment', 'project'] as const;

const TREE_SCHEMA = {
  type: 'object',
  properties: {
    courseTitle: { type: 'string' },
    courseCode: { type: ['string', 'null'] },
    nodes: {
      type: 'array', minItems: MIN_PARSED_SKILLS, maxItems: MAX_PARSED_SKILLS,
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
          tier: { type: 'integer', minimum: 1, maximum: 4 },
          unit: { type: 'string' },
          mission: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              difficulty: { type: 'string', enum: ['Easy', 'Medium', 'Hard'] },
              estimatedMinutes: { type: 'integer', minimum: 5, maximum: 45 },
              xpReward: { type: 'integer', minimum: 20, maximum: 100 },
            },
            required: ['title', 'description', 'difficulty', 'estimatedMinutes', 'xpReward'],
            additionalProperties: false,
          },
        },
        required: ['id', 'label', 'description', 'tier', 'unit', 'mission'],
        additionalProperties: false,
      },
    },
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
        },
        required: ['source', 'target'],
        additionalProperties: false,
      },
    },
  },
  required: ['courseTitle', 'courseCode', 'nodes', 'edges'],
  additionalProperties: false,
} as const;

const OUTLINE_SCHEMA = {
  type: 'object',
  properties: {
    courseTitle: { type: 'string' },
    courseCode: { type: ['string', 'null'] },
    estimatedWeeks: { type: 'integer', minimum: 1, maximum: 52 },
    coverage: {
      type: 'array',
      minItems: 1,
      maxItems: 52,
      items: {
        type: 'object',
        properties: {
          week: { type: 'integer', minimum: 1, maximum: 52 },
          topics: {
            type: 'array',
            minItems: 1,
            maxItems: 12,
            items: { type: 'string' },
          },
        },
        required: ['week', 'topics'],
        additionalProperties: false,
      },
    },
  },
  required: ['courseTitle', 'courseCode', 'estimatedWeeks', 'coverage'],
  additionalProperties: false,
} as const;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Sign in to generate a chart.' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return json({ error: 'Sign in to generate a chart.' }, 401);

  let body: ParserRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (body.action === 'status') {
    if (!apiKey) return json({ error: 'The syllabus parser is not configured yet.', status: 'offline' }, 503);
    try {
      await checkGeminiHealth(apiKey);
      return json({ status: 'online', model: GEMINI_MODEL, engine: 'gemini' }, 200);
    } catch (cause) {
      const error = cause instanceof GeminiError ? cause : null;
      return json({
        error: error?.message ?? 'The Gemini parser health check failed.',
        status: 'offline',
      }, 503);
    }
  }
  const courseId = body.courseId?.trim();
  const syllabusText = body.syllabusText?.trim();
  const pdf = body.documentMediaType === 'application/pdf' ? body.documentBase64?.trim() : null;
  if (!courseId || (!syllabusText && !pdf)) {
    return json({ error: 'courseId and syllabus text or a PDF document are required.' }, 400);
  }
  if (syllabusText && syllabusText.length > 200_000) {
    return json({ error: 'That syllabus is too long to process. Split it and try again.' }, 413);
  }
  if (pdf && pdf.length > 20_000_000) {
    return json({ error: 'That PDF is too large. Keep the encoded document under 15 MB.' }, 413);
  }
  if (body.documentBase64 && !pdf) {
    return json({ error: 'This parser accepts text, Markdown, and text-based PDF files.' }, 415);
  }

  // Owner-scoped before the spend, not after it. RLS makes a course readable to
  // everyone enrolled, but only the owner can write skill_nodes (0002). Without
  // owner_id here an enrolled non-owner ran the full three-call pipeline and
  // then failed at the RLS-blocked insert — the money is already gone by then.
  // Same shape as name-quest: one query, 403, no existence oracle.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId)
    .eq('owner_id', auth.user.id)
    .maybeSingle();
  if (courseError) return json({ error: courseError.message }, 500);
  if (!course) return json({ error: 'Only the course owner can generate its skill tree.' }, 403);

  const { count: existingNodeCount, error: existingNodeError } = await supabase
    .from('skill_nodes')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId);
  if (existingNodeError) return json({ error: existingNodeError.message }, 500);
  if ((existingNodeCount ?? 0) > 0) {
    return json({ error: 'This course already has a skill tree. Start a new import instead.' }, 409);
  }

  if (!apiKey) return json({ error: 'The syllabus parser is not configured yet.' }, 503);
  const startedAt = Date.now();
  console.info(JSON.stringify({ event: 'parser.stage', stage: 'request_received', has_pdf: Boolean(pdf) }));
  const promptText = syllabusText?.trim().slice(0, 60_000);
  const sourceSeed = await stableGenerationSeed(pdf ?? promptText ?? '');
  const outlinePrompt = pdf
    ? 'Extract the cleaned weekly academic outline from the attached syllabus PDF.'
    : `Extract the cleaned weekly academic outline from this syllabus.\n\n<syllabus>\n${promptText}\n</syllabus>`;
  if (pdf) {
    console.info(JSON.stringify({
      event: 'parser.stage',
      stage: 'pdf_forwarded_to_gemini',
      duration_ms: Date.now() - startedAt,
    }));
  }

  let outline: SyllabusOutline;
  try {
    const outlineText = await requestGeminiCompletion({
      apiKey,
      system: `${SYLLABUS_OUTLINE_SYSTEM_PROMPT}\nRequired JSON shape:\n${JSON.stringify(OUTLINE_SCHEMA)}`,
      prompt: outlinePrompt,
      maxTokens: 6_000,
      seed: sourceSeed,
      timeoutMs: 45_000,
      operation: 'extract-syllabus-outline',
      responseJsonSchema: OUTLINE_SCHEMA,
      document: pdf
        ? {
          base64: pdf,
          mediaType: 'application/pdf',
          filename: clean(body.documentName, 160) || 'syllabus.pdf',
        }
        : undefined,
    });
    outline = normalizeOutline(parseJsonObjectText<SyllabusOutlineInput>(outlineText));
  } catch (cause) {
    const providerError = cause instanceof GeminiError ? cause : null;
    console.error(JSON.stringify({
      event: 'parser.stage',
      stage: 'outline_extraction_failed',
      duration_ms: Date.now() - startedAt,
      message: cause instanceof Error ? cause.message.slice(0, 240) : 'Unknown outline error',
    }));
    if (providerError) {
      return json({ error: providerError.message }, providerError.status === 422 ? 422 : 502);
    }
    return json({
      error: `Gemini could not recover the syllabus coverage table: ${validationMessage(cause)} Nothing was saved.`,
    }, 422);
  }

  const skillRange = skillCountRangeForWeeks(outline.estimatedWeeks);
  console.info(JSON.stringify({
    event: 'parser.stage',
    stage: 'outline_complete',
    duration_ms: Date.now() - startedAt,
    estimated_weeks: outline.estimatedWeeks,
    coverage_rows: outline.coverage.length,
    coverage_topics: outline.coverage.reduce((sum, row) => sum + row.topics.length, 0),
    required_skill_min: skillRange.min,
    required_skill_max: skillRange.max,
  }));

  const graphSchema = treeSchemaForRange(skillRange.min, skillRange.max);
  const parserSystem = `${SYLLABUS_GRAPH_SYSTEM_PROMPT}\nThis cleaned outline spans ${outline.estimatedWeeks} weeks. Return ${skillRange.min} to ${skillRange.max} nodes. Cover every listed topic at syllabus-supported granularity; repetition alone does not require extra skills.\nRequired JSON shape:\n${JSON.stringify(graphSchema)}`;
  const prompt = `Build the complete course graph from this cleaned syllabus outline.\n\n<cleanedSyllabus>\n${JSON.stringify(outline)}\n</cleanedSyllabus>`;
  const completionInput = {
    apiKey,
    prompt,
    maxTokens: 16_000,
    seed: sourceSeed,
    timeoutMs: 70_000,
  };
  let responseText = '';
  let parsed: ParsedTree;
  try {
    responseText = await requestGeminiCompletion({
      ...completionInput,
      system: parserSystem,
      operation: 'parse-syllabus',
      responseJsonSchema: graphSchema,
    });
    parsed = normalizeTree(parseJsonObjectText<ParsedCourseGraph>(responseText), outline);
    console.info(JSON.stringify({
      event: 'parser.stage',
      stage: 'model_complete',
      duration_ms: Date.now() - startedAt,
    }));
  } catch (firstCause) {
    const firstProviderError = firstCause instanceof GeminiError ? firstCause : null;
    if (firstProviderError && firstProviderError.status !== 502) {
      return json(
        { error: firstProviderError.message },
        firstProviderError.status === 422 ? 422 : 502,
      );
    }
    console.warn(JSON.stringify({
      event: 'parser.stage',
      stage: firstProviderError ? 'empty_or_failed_model_response' : 'invalid_model_json',
      duration_ms: Date.now() - startedAt,
      message: firstCause instanceof Error ? firstCause.message.slice(0, 240) : 'Unknown parse error',
    }));
    const firstValidationFailure = validationMessage(firstCause);
    const candidate = tryParseCourseGraph(responseText);
    const candidateCount = candidate?.nodes.length ?? 0;
    const repairTarget = repairNodeTarget(skillRange, candidateCount, firstValidationFailure);
    const repairSchema = treeSchemaForRange(repairTarget, repairTarget);
    console.info(JSON.stringify({
      event: 'parser.stage',
      stage: 'graph_repair_started',
      duration_ms: Date.now() - startedAt,
      candidate_nodes: candidateCount,
      repair_target_nodes: repairTarget,
    }));
    try {
      responseText = await requestGeminiCompletion({
        ...completionInput,
        seed: repairGenerationSeed(sourceSeed),
        system: `${SYLLABUS_GRAPH_SYSTEM_PROMPT}\nThis is a validation repair. Return exactly ${repairTarget} nodes and verify every graph rule before responding.\nRequired JSON shape:\n${JSON.stringify(repairSchema)}`,
        prompt: syllabusGraphRepairPrompt({
          outline,
          candidate,
          failure: firstValidationFailure,
          targetCount: repairTarget,
        }),
        operation: 'parse-syllabus-json-retry',
        responseJsonSchema: repairSchema,
      });
      parsed = normalizeTree(parseJsonObjectText<ParsedCourseGraph>(responseText), outline);
      console.info(JSON.stringify({
        event: 'parser.stage',
        stage: 'json_retry_complete',
        duration_ms: Date.now() - startedAt,
      }));
    } catch (retryCause) {
      const retryProviderError = retryCause instanceof GeminiError ? retryCause : null;
      console.error(JSON.stringify({
        event: 'parser.stage',
        stage: 'json_retry_failed',
        duration_ms: Date.now() - startedAt,
        message: retryCause instanceof Error ? retryCause.message.slice(0, 240) : 'Unknown parse error',
      }));
      if (retryProviderError) {
        return json({ error: retryProviderError.message }, retryProviderError.status === 422 ? 422 : 502);
      }
      return json({
        error: `Gemini returned course data Cardinal could not validate: ${validationMessage(retryCause)} Nothing was saved; retry the same file.`,
      }, 422);
    }
  }
  const laidOut = layoutCourseGraph(parsed.nodes);

  const courseMetadata = {
    course_code: clean(parsed.course_code, 32) || null,
    title: clean(parsed.course_name, 160) || course.title,
    description: clean(parsed.course_description, 1000),
    units: Math.max(0, Math.min(30, Math.round(Number(parsed.units) || 0))) || null,
    term: clean(parsed.semester_description, 160) || null,
  };
  const { error: metadataError } = await supabase.from('courses').update(courseMetadata).eq('id', courseId);
  if (metadataError) return json({ error: metadataError.message }, 500);

  const { data: inserted, error: insertError } = await supabase
    .from('skill_nodes')
    .insert(laidOut.map((node) => ({
      course_id: courseId,
      title: node.title,
      description: node.description,
      kind: node.kind,
      icon_key: node.icon_key,
      xp_reward: node.missions.reduce((sum, mission) => sum + mission.xp, 0),
      syllabus_topic: node.syllabus_topic,
      universal_skill: node.universal_skill || null,
      learning_objectives: node.learning_objectives,
      x: node.x,
      y: node.y,
      sort_order: node.sort_order,
    })))
    .select('id, sort_order');
  if (insertError || !inserted) return json({ error: insertError?.message ?? 'Nodes were not saved.' }, 500);

  const idByOrder = new Map(inserted.map((row) => [row.sort_order, row.id]));
  const idByKey = new Map(laidOut.map((node) => [node.key, idByOrder.get(node.sort_order)!]));
  const edges = laidOut.flatMap((node) => node.prereq_keys.map((prereqKey) => ({
    node_id: idByKey.get(node.key)!,
    prereq_id: idByKey.get(prereqKey)!,
  })));
  const missions = laidOut.flatMap((node) => node.missions.map((mission, index) => ({
    node_id: idByKey.get(node.key)!,
    title: mission.title,
    description: mission.description,
    kind: mission.type,
    xp_reward: mission.xp,
    estimated_minutes: mission.estimated_minutes,
    difficulty: mission.difficulty,
    sort_order: index,
  })));

  const [edgeResult, missionResult] = await Promise.all([
    edges.length ? supabase.from('node_prereqs').insert(edges) : Promise.resolve({ error: null }),
    supabase.from('missions').insert(missions),
  ]);
  const relatedError = edgeResult.error ?? missionResult.error;
  if (relatedError) {
    await supabase.from('skill_nodes').delete().eq('course_id', courseId);
    return json({ error: relatedError.message }, 500);
  }

  return json({
    course_id: courseId,
    course_code: courseMetadata.course_code,
    course_name: courseMetadata.title,
    course_description: courseMetadata.description,
    units: courseMetadata.units,
    semester_description: courseMetadata.term,
    node_count: laidOut.length,
    mission_count: missions.length,
    edge_count: edges.length,
    layout_engine: 'ranked-compact-v1',
    model: GEMINI_MODEL,
  }, 201);
});

interface ParserRequest {
  action?: 'status';
  courseId?: string;
  syllabusText?: string;
  documentBase64?: string;
  documentMediaType?: string;
  documentName?: string;
}

interface SyllabusOutlineInput {
  courseTitle: string;
  courseCode: string | null;
  estimatedWeeks: number;
  coverage: Array<{ week: number; topics: string[] }>;
}

interface SyllabusOutline {
  courseTitle: string;
  courseCode: string | null;
  estimatedWeeks: number;
  coverage: Array<{ week: number; topics: string[] }>;
}

interface ParsedMission {
  key: string;
  title: string;
  description: string;
  type: typeof KINDS[number];
  estimated_minutes: number;
  xp: number;
  difficulty: 'easy' | 'medium' | 'hard';
}

interface ParsedCourseGraphNode {
  id: string;
  label: string;
  description: string;
  tier: number;
  unit: string;
  mission: {
    title: string;
    description: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    estimatedMinutes: number;
    xpReward: number;
  };
}

interface ParsedCourseGraph {
  courseTitle: string;
  courseCode: string | null;
  nodes: ParsedCourseGraphNode[];
  edges: Array<{ source: string; target: string }>;
}

interface ParsedNode {
  key: string;
  title: string;
  syllabus_topic: string;
  universal_skill: string;
  description: string;
  tier: number;
  kind: typeof KINDS[number];
  icon_key: typeof ICONS[number];
  prereq_keys: string[];
  learning_objectives: string[];
  missions: ParsedMission[];
}

interface ParsedTree {
  course_code: string;
  course_name: string;
  course_description: string;
  units: number;
  semester_description: string;
  nodes: ParsedNode[];
}

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function cleanFull(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validationMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : 'Unknown validation error.';
  return clean(message.replace(/\s+/g, ' '), 240) || 'Unknown validation error.';
}

function treeSchemaForRange(minItems: number, maxItems: number): Record<string, unknown> {
  return {
    ...TREE_SCHEMA,
    properties: {
      ...TREE_SCHEMA.properties,
      nodes: {
        ...TREE_SCHEMA.properties.nodes,
        minItems,
        maxItems,
      },
    },
  };
}

function tryParseCourseGraph(value: string): ParsedCourseGraph | null {
  try {
    const parsed = parseJsonObjectText<ParsedCourseGraph>(value);
    return parsed && Array.isArray(parsed.nodes) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeOutline(input: SyllabusOutlineInput): SyllabusOutline {
  if (!input || !Array.isArray(input.coverage)) {
    throw new Error('The syllabus outline must include weekly academic coverage.');
  }
  const coverage = input.coverage.flatMap((row) => {
    const rawWeek = Math.round(Number(row?.week) || 0);
    if (rawWeek < 1 || rawWeek > 52) return [];
    const week = rawWeek;
    const topics = Array.isArray(row?.topics)
      ? [...new Set(row.topics
        .map((topic) => clean(topic, 300))
        .flatMap(expandSharedLeadTopic)
        .filter((topic) => topic
          && !isAssessmentOnlyTopic(topic)
          && isMeaningfulSyllabusTopic(topic)))]
      : [];
    return week > 0 && topics.length > 0 ? [{ week, topics }] : [];
  });
  if (coverage.length === 0) {
    throw new Error('No instructional topics were recovered from the syllabus coverage table.');
  }
  const latestCoverageWeek = Math.max(...coverage.map((row) => row.week));
  const estimatedWeeks = Math.max(
    latestCoverageWeek,
    Math.max(1, Math.min(52, Math.round(Number(input.estimatedWeeks) || latestCoverageWeek))),
  );
  return {
    courseTitle: clean(input.courseTitle, 160) || 'Imported Course',
    courseCode: clean(input.courseCode, 32) || null,
    estimatedWeeks,
    coverage,
  };
}

function isAssessmentOnlyTopic(topic: string): boolean {
  return /^(?:final|midterm|preliminary)?\s*(?:examination|exam|quiz|assessment)(?:\s+week)?$/i.test(topic.trim());
}

/** Convert the small public parser contract into Cardinal's richer stored model. */
function normalizeTree(input: ParsedCourseGraph, outline: SyllabusOutline): ParsedTree {
  if (!Array.isArray(input.nodes)) throw new Error('The parser must return academic skills as an array.');
  requireSyllabusScaledSkillCount(input.nodes, outline.estimatedWeeks);
  const coveredNodes = reconcileGroupedSyllabusCoverage(input.nodes, outline.coverage);
  requireSyllabusCoverage(coveredNodes, outline.coverage);
  requireUniqueParserNodeIds(coveredNodes);
  const usedKeys = new Set<string>();
  const keyByInputId = new Map<string, string>();
  const normalizedKeys = coveredNodes.map((node, index) => {
    const rawId = clean(node.id, 120);
    const stem = slug(rawId || clean(node.label, 120)) || `skill-${index + 1}`;
    let key = stem;
    let suffix = 2;
    while (usedKeys.has(key)) key = `${stem}-${suffix++}`;
    usedKeys.add(key);
    if (rawId && !keyByInputId.has(rawId)) keyByInputId.set(rawId, key);
    return key;
  });
  const prereqsByKey = new Map(normalizedKeys.map((key) => [key, [] as string[]]));
  for (const edge of Array.isArray(input.edges) ? input.edges : []) {
    const source = keyByInputId.get(clean(edge.source, 120));
    const target = keyByInputId.get(clean(edge.target, 120));
    if (!source || !target || source === target) continue;
    prereqsByKey.get(target)?.push(source);
  }

  const rawNodeByKey = new Map<string, ParsedCourseGraphNode>();
  const nodes = normalizeTieredCourseDag(placeSynthesisAtCourseEnd(coveredNodes.map((node, index): ParsedNode => {
    const key = normalizedKeys[index]!;
    rawNodeByKey.set(key, node);
    const title = compactLabel(node.label);
    const description = clean(node.description, 600) || `Apply ${title} in a focused example.`;
    const missionTitle = clean(node.mission?.title, 160) || `Practice ${title}`;
    const missionDescription = cleanFull(node.mission?.description)
      || `Complete one worked exercise that demonstrates ${title}.`;
    const resolvedDifficulty = missionDifficultyForTier(
      node.tier,
      `${title} ${description} ${missionTitle} ${missionDescription}`,
      node.mission?.difficulty,
    );
    const missionScale = scaleMission(
      resolvedDifficulty,
      node.mission?.estimatedMinutes,
      node.mission?.xpReward,
    );
    const kind = inferKind(`${title} ${description} ${missionTitle}`);
    return {
      key,
      title,
      syllabus_topic: clean(node.unit, 240),
      universal_skill: '',
      description,
      tier: Number(node.tier),
      kind,
      icon_key: inferIcon(`${title} ${node.unit}`),
      prereq_keys: [...new Set(prereqsByKey.get(key) ?? [])],
      learning_objectives: [`Complete a focused application of ${title}.`],
      missions: [{
        key: `${key}-mission`,
        title: missionTitle,
        description: missionDescription,
        type: kind === 'assessment' || kind === 'project' ? kind : 'assignment',
        estimated_minutes: missionScale.estimatedMinutes,
        xp: missionScale.xpReward,
        difficulty: missionScale.difficulty.toLowerCase() as ParsedMission['difficulty'],
      }],
    };
  }))).map((node) => {
    const rawNode = rawNodeByKey.get(node.key)!;
    const mission = node.missions[0]!;
    const difficulty = missionDifficultyForTier(
      node.tier,
      `${node.title} ${node.description} ${mission.title} ${mission.description}`,
      rawNode.mission?.difficulty,
    );
    const scaled = scaleMission(
      difficulty,
      rawNode.mission?.estimatedMinutes,
      rawNode.mission?.xpReward,
    );
    return {
      ...node,
      missions: [{
        ...mission,
        estimated_minutes: scaled.estimatedMinutes,
        xp: scaled.xpReward,
        difficulty: scaled.difficulty.toLowerCase() as ParsedMission['difficulty'],
      }],
    };
  });
  requirePedagogicalCourseGraph(nodes);
  return {
    course_code: clean(input.courseCode, 32),
    course_name: clean(input.courseTitle, 160),
    course_description: '',
    units: 0,
    semester_description: '',
    nodes,
  };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function compactLabel(value: unknown): string {
  const words = clean(value, 160).split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length === 0) return 'Untitled Skill';
  if (words.length === 1) words.push('Foundations');
  return words.join(' ');
}

function inferKind(value: string): typeof KINDS[number] {
  if (/\b(exam|quiz|test|assessment)\b/i.test(value)) return 'assessment';
  if (/\b(project|capstone|presentation)\b/i.test(value)) return 'project';
  if (/\b(read|reading|chapter|article)\b/i.test(value)) return 'reading';
  if (/\b(assignment|problem set|exercise|practice)\b/i.test(value)) return 'assignment';
  return 'topic';
}

function inferIcon(value: string): typeof ICONS[number] {
  if (/\b(exam|test|assessment)\b/i.test(value)) return 'pixel_trophy';
  if (/\b(probability|random|chance)\b/i.test(value)) return 'pixel_dice';
  if (/\b(data|table|matrix|statistics)\b/i.test(value)) return 'pixel_grid';
  if (/\b(tree|graph|network)\b/i.test(value)) return 'pixel_binary_tree';
  if (/\b(code|algorithm|program)\b/i.test(value)) return 'pixel_brackets';
  if (/\b(logic|boolean|circuit|gate)\b/i.test(value)) return 'pixel_gate';
  if (/\b(set|relation|function)\b/i.test(value)) return 'pixel_atom';
  return 'pixel_spellbook';
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
