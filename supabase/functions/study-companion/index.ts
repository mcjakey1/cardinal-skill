/** Contextual study chat. The provider key stays server-side; RLS validates scope. */
import { createClient } from 'npm:@supabase/supabase-js@^2.58.0';
import {
  BAIError,
  BAI_MODEL,
  checkBAIHealth,
  requestTextCompletion,
} from '../_shared/bai.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Sign in to use the study companion.' }, 401);

  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) return json({ error: 'Sign in to use the study companion.' }, 401);

  let body: {
    action?: 'status';
    courseId?: string;
    nodeId?: string;
    course?: string;
    node_title?: string;
    node_description?: string;
    syllabus_skill?: string;
    universal_skill?: string;
    learning_objectives?: string[];
    user_prompt?: string;
    missions?: { title: string; description?: string }[];
    prerequisites?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Body must be JSON.' }, 400);
  }
  const apiKey = Deno.env.get('BAI_API_KEY');
  if (body.action === 'status') {
    if (!apiKey) {
      return json({ error: 'The study companion is not configured yet.', status: 'offline' }, 503);
    }
    try {
      await checkBAIHealth(apiKey);
      return json({ status: 'online', model: BAI_MODEL, engine: 'edge' }, 200);
    } catch (cause) {
      const error = cause instanceof BAIError ? cause : null;
      return json({
        error: error?.message ?? 'The b.ai provider health check failed.',
        status: 'offline',
      }, 503);
    }
  }
  const question = body.user_prompt?.trim();
  if (!body.courseId || !body.nodeId || !question) {
    return json({ error: 'courseId, nodeId, and user_prompt are required.' }, 400);
  }
  if (question.length > 4000) return json({ error: 'Keep the question under 4000 characters.' }, 413);

  const isBundledDemo = body.courseId.startsWith('demo');
  let course: { title: string } | null = null;
  let node: {
    id: string;
    title: string;
    description: string | null;
    syllabus_topic: string | null;
    universal_skill: string | null;
    learning_objectives: string[] | null;
  } | null = null;
  let missions: { title: string; description?: string }[] = [];

  if (isBundledDemo) {
    if (!body.course?.trim() || !body.node_title?.trim()) {
      return json({ error: 'Demo course and node context are required.' }, 400);
    }
    course = { title: bounded(body.course, 160) };
    node = {
      id: bounded(body.nodeId, 160),
      title: bounded(body.node_title, 160),
      description: bounded(body.node_description, 1000) || null,
      syllabus_topic: bounded(body.syllabus_skill, 500) || null,
      universal_skill: bounded(body.universal_skill, 160) || null,
      learning_objectives: boundedList(body.learning_objectives, 12, 500),
    };
    missions = (body.missions ?? []).slice(0, 20).map((mission) => ({
      title: bounded(mission.title, 200),
      description: bounded(mission.description, 500),
    }));
  } else {
    const [{ data: storedCourse }, { data: storedNode, error: nodeError }, { data: storedMissions }] = await Promise.all([
      client.from('courses').select('title').eq('id', body.courseId).maybeSingle(),
      client
        .from('skill_nodes')
        .select('id, title, description, syllabus_topic, universal_skill, learning_objectives')
        .eq('id', body.nodeId)
        .eq('course_id', body.courseId)
        .maybeSingle(),
      client.from('missions').select('title, description').eq('node_id', body.nodeId),
    ]);
    if (nodeError) return json({ error: nodeError.message }, 500);
    if (!storedNode) return json({ error: 'That node is not on a course you can see.' }, 404);
    course = storedCourse;
    node = storedNode;
    missions = storedMissions ?? [];
  }

  const courseTitle = course?.title ?? body.course ?? 'Untitled course';
  const syllabusTopic = node.syllabus_topic ?? body.syllabus_skill ?? node.description;
  const learningObjectives = node.learning_objectives?.length
    ? node.learning_objectives
    : body.learning_objectives ?? [];
  const systemPrompt = `You are the Cardinal Skill AI Academic Companion.

You are assisting a student in the course "${courseTitle}", specifically on the node "${node.title}" (topic: "${syllabusTopic}").
Learning objectives: ${JSON.stringify(learningObjectives)}.
Universal competency: ${node.universal_skill ?? 'Not specified'}.
Prerequisites: ${JSON.stringify(body.prerequisites ?? [])}.
Active missions: ${JSON.stringify(missions ?? body.missions ?? [])}.

Guide the student with hints, Socratic questions, and structured explanations. Do not complete graded work or simply give away solutions. Stay within the supplied syllabus context. If context is insufficient, say so and ask one focused question.`;
  if (!apiKey) return json({ error: 'The study companion is not configured yet.' }, 503);

  let answer: string;
  try {
    answer = await requestTextCompletion({
      apiKey,
      system: systemPrompt,
      prompt: question,
      temperature: 0.7,
      maxTokens: 1000,
      timeoutMs: 60_000,
      operation: 'study-companion',
    });
  } catch (cause) {
    const error = cause instanceof BAIError ? cause : null;
    return json({ error: error?.message ?? 'The study provider could not be reached. Try again.' }, 502);
  }

  return json({ answer, model: BAI_MODEL, engine: 'edge' }, 200);
});

function bounded(value: unknown, maximum: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

function boundedList(value: unknown, maximumItems: number, maximumLength: number): string[] {
  return Array.isArray(value)
    ? value.slice(0, maximumItems).map((item) => bounded(item, maximumLength)).filter(Boolean)
    : [];
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  });
}
