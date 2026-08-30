/**
 * suggest-subtree — builds the supplemental steps under a node a student is
 * stuck on.
 *
 * Server-side for the same reason as parse-syllabus: BAI_API_KEY must
 * never reach a client bundle. The caller's own JWT does the reading, so RLS
 * decides which node they may ask about, and the write goes through
 * `request_help_subtree()` so the insert is atomic and can only ever produce
 * ungraded steps under a node the caller can already see.
 *
 * Deploy:  supabase functions deploy suggest-subtree
 * Secrets: supabase secrets set BAI_API_KEY=...
 */

import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import { BAIError, parseJsonObjectText, requestStructuredCompletion } from '../_shared/bai.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};


const MIN_STEPS = 2;
const MAX_STEPS = 5;
const KINDS = ['topic', 'reading', 'assignment', 'assessment', 'project'] as const;

/**
 * XP split, kept in step with `fragmentXp` in src/features/skilltree/subtree.ts
 * — same constant, same floor, same remainder-on-the-parent rule. That file is
 * the source of truth; this is a copy because it lives in the app's tsconfig
 * and cannot be imported from Deno.
 *
 * ponytail: duplicated, not shared. A shared package for two dozen lines is
 * more machinery than the drift is worth, and the drift is caught rather than
 * hoped away — `request_help_subtree()` re-checks the conservation invariant in
 * the database and rejects the whole insert if these two disagree. If you
 * change HELP_SHARE or the rounding there, change it here in the same commit.
 */
const HELP_SHARE = 0.4;

function fragmentXp(parentReward: number, stepCount: number) {
  const total = Number.isFinite(parentReward) && parentReward > 0 ? Math.floor(parentReward) : 0;
  const steps = Number.isFinite(stepCount) ? Math.floor(stepCount) : 0;
  if (steps <= 0) return { parentReward: total, stepRewards: [] as number[] };

  const perStep = Math.floor((total * HELP_SHARE) / steps);
  return {
    parentReward: total - perStep * steps,
    stepRewards: new Array<number>(steps).fill(perStep),
  };
}

const clean = (xp: number) => (Number.isFinite(xp) && xp > 0 ? Math.floor(xp) : 0);

/**
 * Also from missions.ts. Largest-remainder apportionment, so the parts sum to
 * the whole exactly rather than relying on the rounding to be kind.
 */
function fragmentMissionXp(missionXps: readonly number[], stepCount: number) {
  const missions = (missionXps ?? []).map(clean);
  const total = missions.reduce((a, b) => a + b, 0);
  const steps = Number.isFinite(stepCount) ? Math.floor(stepCount) : 0;

  if (steps <= 0 || total === 0) {
    return {
      missionRewards: missions,
      stepRewards: new Array<number>(Math.max(steps, 0)).fill(0),
    };
  }

  const perStep = Math.floor((total * HELP_SHARE) / steps);
  const stepRewards = new Array<number>(steps).fill(perStep);
  const remaining = total - perStep * steps;

  const exact = missions.map((xp) => (xp * remaining) / total);
  const missionRewards = exact.map(Math.floor);
  let shortfall = remaining - missionRewards.reduce((a, b) => a + b, 0);

  const order = exact
    .map((value, i) => ({ i, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; shortfall > 0 && k < order.length; k += 1) {
    const idx = order[k]!.i;
    missionRewards[idx] = (missionRewards[idx] ?? 0) + 1;
    shortfall -= 1;
  }
  if (shortfall > 0 && missionRewards.length > 0) {
    missionRewards[0] = (missionRewards[0] ?? 0) + shortfall;
  }

  return { missionRewards, stepRewards };
}

/**
 * Which of the two splits this node needs — mirrors `planFragmentation` in
 * src/features/skilltree/missions.ts, which is the source of truth and is the
 * one with the tests.
 *
 * Getting this wrong is not a rounding bug, it is an XP faucet: a node made of
 * missions pays the student through those missions, so dropping only its
 * `xp_reward` leaves the missions paying the full original amount while the new
 * steps pay extra on top.
 */
function planFragmentation(
  parentReward: number,
  missionXps: readonly number[],
  stepCount: number,
): { parentReward: number; stepRewards: number[]; missionRewards: number[] | null } {
  if (!missionXps || missionXps.length === 0) {
    const split = fragmentXp(parentReward, stepCount);
    return { parentReward: split.parentReward, stepRewards: split.stepRewards, missionRewards: null };
  }

  const { missionRewards, stepRewards } = fragmentMissionXp(missionXps, stepCount);
  return {
    parentReward: missionRewards.reduce((a, b) => a + b, 0),
    stepRewards,
    missionRewards,
  };
}

/** Also from subtree.ts: steps sit left of their parent and stack downward. */
const HELP_DX = -70;
const HELP_DY = 90;

/** Structured output contract. The model cannot return anything else. */
const STEPS_SCHEMA = {
  type: 'object',
  properties: {
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'Stable slug, unique within this batch.' },
          title: { type: 'string' },
          description: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
          prereqKeys: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Keys of steps listed earlier in this batch that must be done first. Empty for the first step. Must not form a cycle.',
          },
        },
        required: ['key', 'title', 'description', 'kind', 'prereqKeys'],
        additionalProperties: false,
      },
    },
  },
  required: ['steps'],
  additionalProperties: false,
} as const;

const SYSTEM = `You design a short scaffold for one student who is stuck on one specific node of a course skill tree.

You are given the node they are stuck on and the prerequisite nodes they have already mastered to reach it. Write ${MIN_STEPS} to ${MAX_STEPS} supplemental steps that bridge that exact gap.

Rules:
- Every step must name concrete content from the node's own title and description. A step that would make sense under any node in any course is a failed step: no "review your notes", "practise more problems", "watch a video on the topic".
- Start from what the prerequisites already gave the student and finish where the node begins. Do not re-teach a prerequisite and do not teach the node itself.
- prereqKeys orders the steps. A step may only depend on a step listed before it in the array, so the scaffold is a chain or a shallow fan-in and never a cycle. Leave it empty on the first step.
- Use the fewest steps that actually close the gap. Two good steps beat five padded ones.
- kind is what the student does: reading to take something in, assignment to practise it, assessment to check it.
- Write each description to the student, in one or two sentences, saying what they will be able to do once the step is done.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return json({ error: 'Use POST.' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Sign in to ask for extra help.' }, 401);
  }

  // Caller's own token — RLS applies, so this client can only read the courses
  // they are actually on.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return json({ error: 'Sign in to ask for extra help.' }, 401);
  }

  let body: { courseId?: string; nodeId?: string; requester?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }

  const { courseId, nodeId, requester, reason } = body;
  if (!courseId || !nodeId) {
    return json({ error: 'courseId and nodeId are both required.' }, 400);
  }
  // Validated so a malformed body fails here rather than downstream. The audit
  // row does not use this value: `request_help_subtree()` derives student vs
  // instructor from course ownership, so a student cannot log their request as
  // though their instructor made it.
  if (requester !== 'student' && requester !== 'instructor') {
    return json({ error: "requester must be 'student' or 'instructor'." }, 400);
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 2000)) {
    return json({ error: 'Keep the reason under 2000 characters.' }, 400);
  }

  // RLS decides this: the row comes back only if the caller owns the course or
  // is enrolled on it. Failing here gives them a clear message instead of an
  // opaque database error three calls later.
  const { data: node, error: nodeError } = await supabase
    .from('skill_nodes')
    .select('id, title, description, kind, xp_reward, x, y, sort_order, parent_node_id')
    .eq('id', nodeId)
    .eq('course_id', courseId)
    .maybeSingle();
  if (nodeError) return json({ error: nodeError.message }, 500);
  if (!node) return json({ error: 'That node is not on a course you can see.' }, 404);
  if (node.parent_node_id) {
    return json(
      { error: 'That step is already extra help. Ask on the node it sits under.' },
      409,
    );
  }

  // The prerequisites are the context that makes this a bridge rather than
  // generic study advice: they are what the student already has.
  const { data: edges, error: edgeError } = await supabase
    .from('node_prereqs')
    .select('prereq_id')
    .eq('node_id', nodeId);
  if (edgeError) return json({ error: edgeError.message }, 500);

  let prereqs: { title: string; description: string }[] = [];
  if (edges && edges.length > 0) {
    const { data, error } = await supabase
      .from('skill_nodes')
      .select('title, description')
      .in('id', edges.map((e) => e.prereq_id));
    if (error) return json({ error: error.message }, 500);
    prereqs = data ?? [];
  }

  const apiKey = Deno.env.get('BAI_API_KEY');
  if (!apiKey) return json({ error: 'Extra help is not configured yet.' }, 503);

  let text: string;
  try {
    text = await requestStructuredCompletion({
      apiKey,
      system: SYSTEM,
      prompt: prompt(node, prereqs, reason),
      schemaName: 'supplemental_steps',
      schema: STEPS_SCHEMA,
      maxTokens: 8000,
      temperature: 0.2,
      operation: 'suggest-subtree',
    });
  } catch (cause) {
    const error = cause instanceof BAIError ? cause : null;
    return json(
      { error: error?.message ?? 'Extra help could not be generated.' },
      error?.status === 422 ? 422 : 502,
    );
  }

  // requestStructuredCompletion's json-object fallback puts the schema in the
  // prompt, which is the path most likely to come back ```json-fenced. A raw
  // JSON.parse rejects that and throws away a call already paid for.
  let parsed: { steps?: unknown };
  try {
    parsed = parseJsonObjectText<{ steps?: unknown }>(text);
  } catch {
    return json({ error: 'The extra help came back malformed. Try again.' }, 502);
  }

  // usableSteps() already caps the batch at MAX_STEPS; too few is the only way
  // left to end up with something unusable.
  const steps = usableSteps(parsed.steps);
  if (steps.length < MIN_STEPS) {
    return json({ error: 'The extra help came back unusable. Try again.' }, 502);
  }

  // A node made of missions is re-priced through those missions, never through
  // its own column alone — see planFragmentation. Ordered so the rewards below
  // line up with the rows positionally.
  const { data: missionRows, error: missionError } = await supabase
    .from('missions')
    .select('id, xp_reward')
    .eq('node_id', nodeId)
    .order('sort_order');
  if (missionError) return json({ error: missionError.message }, 500);

  const plan = planFragmentation(
    node.xp_reward,
    (missionRows ?? []).map((m) => m.xp_reward),
    steps.length,
  );
  const built = buildSubtree(node, steps, plan.stepRewards);

  const { error: rpcError } = await supabase.rpc('request_help_subtree', {
    p_node_id: nodeId,
    p_parent_reward: plan.parentReward,
    p_steps: built.nodes,
    p_prereqs: built.prereqs,
    p_missions: plan.missionRewards
      ? (missionRows ?? []).map((m, i) => ({ id: m.id, xp_reward: plan.missionRewards![i] ?? 0 }))
      : [],
    p_reason: reason ?? null,
  });
  if (rpcError) {
    // 0041 narrowed who may add help to a course: the owner, or a student
    // enrolled on a course that is not official. A refusal there is the server
    // saying no, not the server breaking, so it must not read as a 500 with a
    // Postgres sentence in it. 42501 is the code the function raises.
    if (rpcError.code === '42501') {
      return json(
        { error: 'Extra help can only be added to this course by whoever runs it.' },
        403,
      );
    }
    return json({ error: rpcError.message }, 500);
  }

  return json({ stepCount: built.nodes.length, parentXpReward: plan.parentReward }, 201);
});

interface Step {
  key: string;
  title: string;
  description: string;
  kind: string;
  prereqKeys: string[];
}

/**
 * Model output is untrusted. Keep the first occurrence of each usable key and
 * drop anything malformed — a duplicate key would mint two ids for one step and
 * make the edge translation below ambiguous.
 */
function usableSteps(raw: unknown): Step[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: Step[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const step = s as Record<string, unknown>;
    const key = typeof step.key === 'string' ? step.key.trim() : '';
    const title = typeof step.title === 'string' ? step.title.trim() : '';
    const description = typeof step.description === 'string' ? step.description.trim() : '';
    const kind = typeof step.kind === 'string' ? step.kind : '';
    if (!key || !title || !description || seen.has(key)) continue;
    if (!(KINDS as readonly string[]).includes(kind)) continue;

    seen.add(key);
    out.push({
      key,
      // The database has no length check on these; a runaway title would
      // otherwise render as a wall of text on the chart.
      title: title.slice(0, 120),
      description: description.slice(0, 600),
      kind,
      prereqKeys: Array.isArray(step.prereqKeys)
        ? step.prereqKeys.filter((k): k is string => typeof k === 'string')
        : [],
    });
    if (out.length === MAX_STEPS) break;
  }
  return out;
}

interface Parent {
  id: string;
  x: number;
  y: number;
  sort_order: number;
}

/** One row for `request_help_subtree(p_steps)`; the keys are read by name. */
interface HelpNodeRow {
  id: string;
  title: string;
  description: string;
  kind: string;
  xp_reward: number;
  x: number;
  y: number;
  sort_order: number;
}

/**
 * Mirrors `buildHelpSubtree` in src/features/skilltree/subtree.ts, which is the
 * source of truth for the placement and the edge rules.
 *
 * A step may only require a step declared earlier in the batch. That one rule
 * makes the subtree acyclic by construction, which is why there is no cycle
 * detection: self, forward, and unknown references are dropped rather than
 * handed to `deriveStatuses`, because a node it quarantines as cyclic renders
 * as permanently locked — the worst thing to show a student who asked for help.
 */
function buildSubtree(parent: Parent, steps: Step[], stepRewards: number[]) {
  const idByKey = new Map(steps.map((s) => [s.key, crypto.randomUUID()] as const));
  const indexByKey = new Map(steps.map((s, i) => [s.key, i] as const));

  const nodes: HelpNodeRow[] = [];
  const prereqs: { node_id: string; prereq_id: string }[] = [];
  const isPrereqOfAStep = new Set<string>();

  for (const [i, step] of steps.entries()) {
    const id = idByKey.get(step.key)!;

    for (const key of step.prereqKeys) {
      const j = indexByKey.get(key);
      if (j === undefined || j >= i) continue;
      prereqs.push({ node_id: id, prereq_id: idByKey.get(key)! });
      isPrereqOfAStep.add(key);
    }

    nodes.push({
      id,
      title: step.title,
      description: step.description,
      kind: step.kind,
      xp_reward: stepRewards[i] ?? 0,
      x: parent.x + HELP_DX,
      y: parent.y + HELP_DY * (i + 1),
      // The steps share the parent's slot; the prereq chain is what actually
      // enforces the order.
      sort_order: parent.sort_order,
    });
  }

  // Terminal steps become prerequisites of the parent. Without this the
  // scaffold is decorative: the student could skip every step and the node they
  // were stuck on would be unchanged.
  for (const step of steps) {
    if (isPrereqOfAStep.has(step.key)) continue;
    prereqs.push({ node_id: parent.id, prereq_id: idByKey.get(step.key)! });
  }

  return { nodes, prereqs };
}

function prompt(
  node: { title: string; description: string; kind: string },
  prereqs: { title: string; description: string }[],
  reason?: string,
): string {
  const already = prereqs.length
    ? prereqs.map((p) => `- ${p.title}: ${p.description}`).join('\n')
    : '(none — this node has no prerequisites)';

  return `The student is stuck on this node.

<node kind="${node.kind}">
${node.title}
${node.description}
</node>

They have already mastered its prerequisites:

<prerequisites>
${already}
</prerequisites>
${reason ? `\nIn their words, what they are stuck on:\n\n<reason>\n${reason}\n</reason>\n` : ''}
Return the supplemental steps that get them from those prerequisites to this node.`;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
