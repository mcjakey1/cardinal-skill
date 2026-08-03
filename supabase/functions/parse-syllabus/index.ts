/**
 * parse-syllabus — turns an uploaded syllabus into a skill tree.
 *
 * Runs server-side for one reason: ANTHROPIC_API_KEY must never reach a client
 * bundle. The function authenticates the caller with their own JWT, confirms
 * they own the course, then writes nodes and prerequisite edges.
 *
 * Deploy:  supabase functions deploy parse-syllabus
 * Secrets: supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
 */

import Anthropic from 'npm:@anthropic-ai/sdk@^0.68.0';
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';

const MODEL = 'claude-opus-5';

/** Structured output contract. The model cannot return anything else. */
const TREE_SCHEMA = {
  type: 'object',
  properties: {
    nodes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Stable slug, unique within this tree.' },
          title: { type: 'string' },
          description: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['topic', 'reading', 'assignment', 'assessment', 'project'],
          },
          xp_reward: { type: 'integer' },
          prereq_keys: {
            type: 'array',
            items: { type: 'string' },
            description: 'Keys of nodes that must be mastered first. Must not form a cycle.',
          },
        },
        required: ['key', 'title', 'description', 'kind', 'xp_reward', 'prereq_keys'],
        additionalProperties: false,
      },
    },
  },
  required: ['nodes'],
  additionalProperties: false,
} as const;

const SYSTEM = `You convert a university course syllabus into a prerequisite graph of learning nodes.

Rules:
- One node per distinct learning outcome, topic, or graded artifact. Do not create a node for administrative content (office hours, attendance policy, grading scale).
- prereq_keys encodes what a student must understand first, not the calendar order. Two topics taught in the same week with no dependency between them have no edge.
- The graph must be acyclic.
- xp_reward scales with effort: a reading is 25, a problem set 50, a midterm 150, a term project 300. Adjust within those bands.
- Write each description for the student, in one or two sentences, saying what they will be able to do once the node is mastered.
- Use the syllabus's own vocabulary. Do not invent topics it does not mention.`;

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Sign in to generate a chart.' }, 401);
  }

  // Caller's own token — RLS applies, so this client can only touch their rows.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return json({ error: 'Sign in to generate a chart.' }, 401);
  }

  let body: { courseId?: string; syllabusText?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const { courseId, syllabusText } = body;
  if (!courseId || !syllabusText?.trim()) {
    return json({ error: 'courseId and syllabusText are both required.' }, 400);
  }
  if (syllabusText.length > 200_000) {
    return json({ error: 'That syllabus is too long to process. Split it and try again.' }, 413);
  }

  // Ownership check. RLS would block the insert anyway; failing here gives the
  // student a clear message instead of an opaque database error.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .maybeSingle();
  if (courseError) return json({ error: courseError.message }, 500);
  if (!course) return json({ error: 'Course not found.' }, 404);

  const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY')! });

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: TREE_SCHEMA },
    },
    messages: [
      {
        role: 'user',
        content: `Here is the syllabus. Return the node graph.\n\n<syllabus>\n${syllabusText}\n</syllabus>`,
      },
    ],
  });

  const message = await stream.finalMessage();

  // Check stop_reason before reading content — a refusal returns HTTP 200 with
  // empty or partial content.
  if (message.stop_reason === 'refusal') {
    return json({ error: 'That document could not be processed. Try a different syllabus.' }, 422);
  }

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) {
    return json({ error: 'The chart came back empty. Try again.' }, 502);
  }

  let parsed: { nodes: ParsedNode[] };
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'The chart came back malformed. Try again.' }, 502);
  }

  const laidOut = layout(parsed.nodes);

  const { data: inserted, error: insertError } = await supabase
    .from('skill_nodes')
    .insert(
      laidOut.map((n) => ({
        course_id: courseId,
        title: n.title,
        description: n.description,
        kind: n.kind,
        xp_reward: n.xp_reward,
        x: n.x,
        y: n.y,
        sort_order: n.sort_order,
      })),
    )
    .select('id, sort_order');
  if (insertError) return json({ error: insertError.message }, 500);

  const idBySortOrder = new Map(inserted.map((r) => [r.sort_order, r.id]));
  const edges = laidOut.flatMap((n) =>
    n.prereq_keys
      .map((key) => laidOut.find((c) => c.key === key))
      .filter((p): p is LaidOutNode => p !== undefined)
      .map((p) => ({
        node_id: idBySortOrder.get(n.sort_order)!,
        prereq_id: idBySortOrder.get(p.sort_order)!,
      })),
  );

  if (edges.length > 0) {
    const { error: edgeError } = await supabase.from('node_prereqs').insert(edges);
    if (edgeError) return json({ error: edgeError.message }, 500);
  }

  return json({ nodeCount: laidOut.length, edgeCount: edges.length }, 201);
});

interface ParsedNode {
  key: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  prereq_keys: string[];
}

type LaidOutNode = ParsedNode & { x: number; y: number; sort_order: number };

/**
 * Assign chart coordinates by dependency depth: depth becomes the row, position
 * within the row becomes the column.
 *
 * ponytail: this is a layered layout with no edge-crossing minimisation, so a
 * dense graph will look tangled. Reach for a real DAG layout (dagre, ELK) only
 * once a pilot syllabus actually produces one that reads badly.
 */
function layout(nodes: ParsedNode[]): LaidOutNode[] {
  const COL = 160;
  const ROW = 120;
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  const depths = new Map<string, number>();

  const depthOf = (key: string, seen: Set<string>): number => {
    const cached = depths.get(key);
    if (cached !== undefined) return cached;
    if (seen.has(key)) return 0; // Cycle: break here; the client reports it.
    seen.add(key);
    const node = byKey.get(key);
    const parents = node?.prereq_keys.filter((k) => byKey.has(k)) ?? [];
    const depth = parents.length === 0 ? 0 : Math.max(...parents.map((k) => depthOf(k, seen))) + 1;
    seen.delete(key);
    depths.set(key, depth);
    return depth;
  };

  for (const n of nodes) depthOf(n.key, new Set());

  const perRow = new Map<number, number>();
  return nodes.map((n, i) => {
    const depth = depths.get(n.key) ?? 0;
    const col = perRow.get(depth) ?? 0;
    perRow.set(depth, col + 1);
    return { ...n, x: col * COL, y: depth * ROW, sort_order: i };
  });
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
