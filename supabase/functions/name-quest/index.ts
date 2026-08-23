/**
 * name-quest — writes the quest name and the completion achievement for a batch
 * of nodes.
 *
 * Separate from parse-syllabus on purpose. That function builds the graph and
 * is prompted as a curriculum modeller; this one is a flavour writer and only
 * ever touches four name columns. Keeping the two prompts apart is what stops
 * naming pressure from leaking into the shape of the tree.
 *
 * Server-side for the same reason: BAI_API_KEY must never reach a client
 * bundle. The caller's own JWT does the writing, so the "course owner writes
 * nodes" policy from 0002 is the access control.
 *
 * Deploy:  supabase functions deploy name-quest
 * Secrets: supabase secrets set BAI_API_KEY=...
 */

import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { BAIError, requestStructuredCompletion } from '../_shared/bai.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


/**
 * ponytail: one call names one tree, and a tree that needs more than this is
 * one request per chunk from the client. Raise it when a real syllabus produces
 * a bigger tree than 40 nodes; splitting into parallel calls server-side is a
 * job scheduler, and this does not need one.
 */
const MAX_BATCH = 40;

/** Structured output contract. The model cannot return anything else. */
const NAMES_SCHEMA = {
  type: 'object',
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nodeId: {
            type: 'string',
            description: 'The id given for this node, echoed back unchanged.',
          },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          achievementTitle: { type: 'string' },
          achievementDescription: { type: 'string' },
        },
        required: ['nodeId', 'title', 'subtitle', 'achievementTitle', 'achievementDescription'],
        additionalProperties: false,
      },
    },
  },
  required: ['names'],
  additionalProperties: false,
} as const;

const SYSTEM = `You name quests in a course skill tree. You are a flavour writer, not a curriculum designer: the tree already exists, and you are giving each node a name a student would want to click.

For each node you are given, write:
- title: the quest name, 2 to 5 words.
- subtitle: one line under the title, at most 12 words.
- achievementTitle: the badge for finishing that node, 2 to 4 words.
- achievementDescription: one sentence saying what the student proved.

Rules:
- Every name must be grounded in that node's own title and description. A name that would fit any other node in the course is a failed name — "The Journey Begins", "Knowledge Unlocked", and "Level Up" are all failures. Use the node's actual subject.
- Do not invent content the node does not cover, and do not promise a skill it does not teach.
- Keep the register light but not childish, and consistent across the batch.
- Return exactly one entry per node id you were given, and echo each id unchanged.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Sign in to name quests.' }, 401);
  }

  // Caller's own token — RLS applies, so the update below succeeds only for the
  // course owner.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return json({ error: 'Sign in to name quests.' }, 401);
  }

  let body: { courseId?: string; nodeIds?: unknown; tone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const { courseId, nodeIds, tone } = body;
  if (!courseId || !Array.isArray(nodeIds) || nodeIds.length === 0) {
    return json({ error: 'courseId and a non-empty nodeIds array are both required.' }, 400);
  }
  if (!nodeIds.every((id) => typeof id === 'string' && id.length > 0)) {
    return json({ error: 'Every entry in nodeIds must be a node id.' }, 400);
  }
  if (nodeIds.length > MAX_BATCH) {
    return json(
      { error: `Name at most ${MAX_BATCH} nodes per request. Split the tree and try again.` },
      400,
    );
  }
  if (tone !== undefined && (typeof tone !== 'string' || tone.length > 200)) {
    return json({ error: 'Keep the tone hint under 200 characters.' }, 400);
  }

  // Students do not rename their own quests. The "course owner writes nodes"
  // policy in 0002 would block the update anyway; failing here gives a clear
  // message instead of a silent zero-row update.
  const { data: course, error: courseError } = await supabase
    .from('courses')
    .select('id')
    .eq('id', courseId)
    .eq('owner_id', auth.user.id)
    .maybeSingle();
  if (courseError) return json({ error: courseError.message }, 500);
  if (!course) return json({ error: 'Only the course owner can name its quests.' }, 403);

  const { data: nodes, error: nodesError } = await supabase
    .from('skill_nodes')
    .select('id, title, description, kind, title_override')
    .eq('course_id', courseId)
    .in('id', nodeIds as string[]);
  if (nodesError) return json({ error: nodesError.message }, 500);
  if (!nodes || nodes.length === 0) {
    return json({ error: 'None of those nodes are on that course.' }, 404);
  }

  // An instructor's own title always wins. This is the whole reason
  // title_override exists, so the node is skipped rather than regenerated.
  const namable = nodes.filter((n) => !n.title_override);
  const skipped = nodes.length - namable.length;
  if (namable.length === 0) {
    return json({ named: 0, skipped }, 200);
  }

  const apiKey = Deno.env.get('BAI_API_KEY');
  if (!apiKey) return json({ error: 'Quest naming is not configured yet.' }, 503);

  let text: string;
  try {
    text = await requestStructuredCompletion({
      apiKey,
      system: SYSTEM,
      prompt: prompt(namable, tone),
      schemaName: 'quest_names',
      schema: NAMES_SCHEMA,
      maxTokens: 12000,
      temperature: 0.5,
      operation: 'name-quest',
    });
  } catch (cause) {
    const error = cause instanceof BAIError ? cause : null;
    return json(
      { error: error?.message ?? 'Quest names could not be generated.' },
      error?.status === 422 ? 422 : 502,
    );
  }

  let parsed: { names?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'The names came back malformed. Try again.' }, 502);
  }

  const names = usableNames(parsed.names, new Set(namable.map((n) => n.id)));
  if (names.length === 0) {
    return json({ error: 'The names came back unusable. Try again.' }, 502);
  }

  // ponytail: one statement per node. At MAX_BATCH that is 40 short updates in
  // flight; move it into a definer function taking one jsonb array if the cap
  // ever rises far enough for the round trips to matter.
  const results = await Promise.all(
    names.map((n) =>
      supabase
        .from('skill_nodes')
        .update({
          quest_title: n.title,
          quest_subtitle: n.subtitle,
          achievement_title: n.achievementTitle,
          achievement_description: n.achievementDescription,
        })
        .eq('id', n.nodeId)
        // Re-checked at write time: an instructor may have typed an override
        // while the model was running, and that override still wins.
        .is('title_override', null)
        .select('id'),
    ),
  );

  const failed = results.find((r) => r.error);
  if (failed?.error) return json({ error: failed.error.message }, 500);

  const named = results.reduce((total, r) => total + (r.data?.length ?? 0), 0);
  return json({ named, skipped: nodes.length - named }, 200);
});

interface Name {
  nodeId: string;
  title: string;
  subtitle: string;
  achievementTitle: string;
  achievementDescription: string;
}

/**
 * Model output is untrusted, and here it carries ids. Keep only entries naming
 * a node that was actually in this batch and still namable — otherwise a
 * hallucinated id would be written straight into an `update ... where id = ?`.
 */
function usableNames(raw: unknown, allowed: Set<string>): Name[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Name[] = [];
  for (const n of raw) {
    if (!n || typeof n !== 'object') continue;
    const name = n as Record<string, unknown>;
    const nodeId = typeof name.nodeId === 'string' ? name.nodeId : '';
    if (!allowed.has(nodeId) || seen.has(nodeId)) continue;

    // The database has no length check on these columns, and a runaway title
    // would render as a wall of text on the chart.
    const title = text(name.title, 80);
    const subtitle = text(name.subtitle, 120);
    const achievementTitle = text(name.achievementTitle, 80);
    const achievementDescription = text(name.achievementDescription, 200);
    if (!title || !subtitle || !achievementTitle || !achievementDescription) continue;

    seen.add(nodeId);
    out.push({ nodeId, title, subtitle, achievementTitle, achievementDescription });
  }
  return out;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function prompt(
  nodes: { id: string; title: string; description: string; kind: string }[],
  tone?: string,
): string {
  const listed = nodes
    .map((n) => `<node id="${n.id}" kind="${n.kind}">\n${n.title}\n${n.description}\n</node>`)
    .join('\n');

  return `Name these ${nodes.length} nodes.
${tone ? `\nTone the instructor asked for: ${tone}\n` : ''}
<nodes>
${listed}
</nodes>`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
