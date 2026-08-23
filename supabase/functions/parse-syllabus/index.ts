/** Parse a syllabus into an owner-scoped course DAG. Provider keys stay server-side. */
import Dagre, { layout as runDagreLayout } from 'npm:@dagrejs/dagre@3.1.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { parseJsonObjectText } from '../_shared/bai.ts';
import {
  checkOpenRouterHealth,
  OPENROUTER_MODEL,
  OpenRouterError,
  requestOpenRouterCompletion,
} from '../_shared/openrouter.ts';

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
    course_code: { type: 'string' },
    course_name: { type: 'string' },
    course_description: { type: 'string' },
    units: { type: 'integer', minimum: 0, maximum: 30 },
    semester_description: { type: 'string' },
    nodes: {
      type: 'array', minItems: 1, maxItems: 24,
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          title: { type: 'string' },
          syllabus_topic: { type: 'string' },
          universal_skill: { type: 'string' },
          description: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
          icon_key: { type: 'string', enum: ICONS },
          prereq_keys: { type: 'array', items: { type: 'string' } },
          learning_objectives: { type: 'array', minItems: 1, maxItems: 2, items: { type: 'string' } },
          missions: {
            type: 'array', minItems: 2, maxItems: 2,
            items: {
              type: 'object',
              properties: {
                key: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                type: { type: 'string', enum: KINDS },
                estimated_minutes: { type: 'integer' },
                xp: { type: 'integer' },
              },
              required: ['key', 'title', 'description', 'type', 'estimated_minutes', 'xp'],
              additionalProperties: false,
            },
          },
        },
        required: [
          'key', 'title', 'syllabus_topic', 'universal_skill', 'description', 'kind',
          'icon_key', 'prereq_keys', 'learning_objectives', 'missions',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['course_code', 'course_name', 'course_description', 'units', 'semester_description', 'nodes'],
  additionalProperties: false,
} as const;

const SYSTEM = `Convert a university syllabus into a concise prerequisite DAG.

Rules:
- Extract the official course code, full title, unit count, concise description, and semester or section description. Use 0 units or an empty string only when the syllabus does not state the value.
- Extract only distinct academic topics, units, modules, and named assessments from the schedule. Ignore policies, attendance, office hours, and grading boilerplate.
- Keep the graph concise: combine duplicate weekly entries and return no more than 24 nodes.
- Preserve the syllabus vocabulary. Do not invent subject matter.
- Order nodes so every prerequisite appears earlier than the node that requires it. prereq_keys must be acyclic and express conceptual dependency, not calendar order.
- Give every node exactly two bite-sized missions strictly grounded in that topic: a reading or lecture review, then a practice drill or assignment. Include realistic minutes and XP.
- Give every node one or two observable learning objectives. Keep all descriptions to one short sentence.
- universal_skill is a reusable competency such as Algorithmic logic, Data interpretation, or Academic writing; use an empty string when none is justified.
- Choose a contextual pixel icon. Exams use trophy or boss skull; probability uses dice or coin; data uses grid or bar chart; code uses cursor or brackets; general theory uses scroll or spellbook.
- Return one compact JSON object only. Do not use Markdown fences. Escape quotes inside strings and never place a raw line break inside a JSON string.`;

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
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (body.action === 'status') {
    if (!apiKey) return json({ error: 'The syllabus parser is not configured yet.', status: 'offline' }, 503);
    try {
      await checkOpenRouterHealth(apiKey);
      return json({ status: 'online', model: OPENROUTER_MODEL, engine: 'openrouter' }, 200);
    } catch (cause) {
      const error = cause instanceof OpenRouterError ? cause : null;
      return json({
        error: error?.message ?? 'The OpenRouter parser health check failed.',
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

  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id, title')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) return json({ error: courseError.message }, 500);
  if (!course) return json({ error: 'Course not found.' }, 404);

  if (!apiKey) return json({ error: 'The syllabus parser is not configured yet.' }, 503);
  const startedAt = Date.now();
  console.info(JSON.stringify({ event: 'parser.stage', stage: 'request_received', has_pdf: Boolean(pdf) }));
  const promptText = syllabusText?.trim().slice(0, 60_000);
  const prompt = pdf
    ? 'Read the attached syllabus PDF and return its structured course graph.'
    : `Return the structured course graph for this syllabus.\n\n<syllabus>\n${promptText}\n</syllabus>`;
  if (pdf) {
    console.info(JSON.stringify({
      event: 'parser.stage',
      stage: 'pdf_forwarded_to_openrouter',
      duration_ms: Date.now() - startedAt,
    }));
  }

  const parserSystem = `${SYSTEM}\nRequired JSON shape:\n${JSON.stringify(TREE_SCHEMA)}`;
  const completionInput = {
    apiKey,
    prompt,
    maxTokens: 6500,
    timeoutMs: 55_000,
    document: pdf
      ? {
        base64: pdf,
        mediaType: 'application/pdf' as const,
        filename: clean(body.documentName, 160) || 'syllabus.pdf',
      }
      : undefined,
  };
  let responseText: string;
  let parsed: ParsedTree;
  try {
    responseText = await requestOpenRouterCompletion({
      ...completionInput,
      system: parserSystem,
      operation: 'parse-syllabus',
      temperature: 0.1,
    });
    parsed = normalizeTree(parseJsonObjectText<ParsedTree>(responseText));
    console.info(JSON.stringify({
      event: 'parser.stage',
      stage: 'model_complete',
      duration_ms: Date.now() - startedAt,
    }));
  } catch (firstCause) {
    const firstProviderError = firstCause instanceof OpenRouterError ? firstCause : null;
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
    try {
      responseText = await requestOpenRouterCompletion({
        ...completionInput,
        system: `${parserSystem}\nThe previous generation was empty or invalid JSON. Regenerate the complete object from scratch and verify every string, array, and closing brace before responding.`,
        operation: 'parse-syllabus-json-retry',
        temperature: 0,
      });
      parsed = normalizeTree(parseJsonObjectText<ParsedTree>(responseText));
      console.info(JSON.stringify({
        event: 'parser.stage',
        stage: 'json_retry_complete',
        duration_ms: Date.now() - startedAt,
      }));
    } catch (retryCause) {
      const retryProviderError = retryCause instanceof OpenRouterError ? retryCause : null;
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
        error: 'Nemotron returned malformed course data twice. Try a shorter syllabus or paste only the course schedule.',
      }, 422);
    }
  }
  const laidOut = layoutWithDagre(parsed.nodes);

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
    layout_engine: 'dagre-3.1.0',
    model: OPENROUTER_MODEL,
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

interface ParsedMission {
  key: string;
  title: string;
  description: string;
  type: typeof KINDS[number];
  estimated_minutes: number;
  xp: number;
}

interface ParsedNode {
  key: string;
  title: string;
  syllabus_topic: string;
  universal_skill: string;
  description: string;
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

type LaidOutNode = ParsedNode & { x: number; y: number; sort_order: number };

function clean(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Treat model output as untrusted even when a provider says it matches a schema. */
function normalizeTree(input: ParsedTree): ParsedTree {
  if (!Array.isArray(input.nodes) || input.nodes.length === 0 || input.nodes.length > 24) {
    throw new Error('The parser must return between 1 and 24 academic topics.');
  }
  const keys = new Set<string>();
  const indexByKey = new Map<string, number>();
  input.nodes.forEach((node, index) => {
    const key = clean(node.key, 80);
    if (!key || keys.has(key)) throw new Error('The parser returned duplicate or empty node keys.');
    keys.add(key);
    indexByKey.set(key, index);
  });
  const nodes = input.nodes.map((node, index): ParsedNode => {
    const key = clean(node.key, 80);
    const missions = Array.isArray(node.missions) ? node.missions.slice(0, 3) : [];
    if (missions.length < 2) throw new Error(`${clean(node.title, 120) || 'A topic'} needs at least two missions.`);
    return {
      key,
      title: clean(node.title, 120) || 'Untitled topic',
      syllabus_topic: clean(node.syllabus_topic, 240),
      universal_skill: clean(node.universal_skill, 120),
      description: clean(node.description, 600),
      kind: KINDS.includes(node.kind) ? node.kind : 'topic',
      icon_key: ICONS.includes(node.icon_key) ? node.icon_key : 'pixel_spellbook',
      prereq_keys: [...new Set(Array.isArray(node.prereq_keys) ? node.prereq_keys : [])]
        .filter((parent) => (indexByKey.get(parent) ?? index) < index),
      learning_objectives: (Array.isArray(node.learning_objectives) ? node.learning_objectives : [])
        .map((objective) => clean(objective, 240)).filter(Boolean).slice(0, 2),
      missions: missions.map((mission, missionIndex) => ({
        key: clean(mission.key, 80) || `${key}-mission-${missionIndex + 1}`,
        title: clean(mission.title, 160) || `Practice ${missionIndex + 1}`,
        description: clean(mission.description, 500),
        type: KINDS.includes(mission.type) ? mission.type : 'assignment',
        estimated_minutes: Math.max(5, Math.min(480, Math.round(Number(mission.estimated_minutes) || 30))),
        xp: Math.max(5, Math.min(500, Math.round(Number(mission.xp) || 20))),
      })),
    };
  });
  return {
    course_code: clean(input.course_code, 32),
    course_name: clean(input.course_name, 160),
    course_description: clean(input.course_description, 1000),
    units: Math.max(0, Math.min(30, Math.round(Number(input.units) || 0))),
    semester_description: clean(input.semester_description, 160),
    nodes,
  };
}

function layoutWithDagre(nodes: ParsedNode[]): LaidOutNode[] {
  const graph = new Dagre.graphlib.Graph()
    .setGraph({ rankdir: 'TB', ranksep: 110, nodesep: 72, edgesep: 32 })
    .setDefaultEdgeLabel(() => ({}));

  for (const node of nodes) graph.setNode(node.key, { width: 108, height: 88 });
  for (const node of nodes) {
    for (const prerequisite of node.prereq_keys) graph.setEdge(prerequisite, node.key);
  }
  runDagreLayout(graph);

  return nodes.map((node, sort_order) => {
    const position = graph.node(node.key);
    return {
      ...node,
      x: Number.isFinite(position?.x) ? position.x : 0,
      y: Number.isFinite(position?.y) ? position.y : sort_order * 140,
      sort_order,
    };
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
