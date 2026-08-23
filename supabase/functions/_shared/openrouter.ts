const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_CHAT_URL = `${OPENROUTER_API_URL}/chat/completions`;

export const OPENROUTER_MODEL = 'nvidia/nemotron-3.5-lightning:free';

interface CompletionOptions {
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  operation?: string;
  document?: {
    base64: string;
    mediaType: 'application/pdf';
    filename: string;
  };
}

interface OpenRouterResponse {
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; refusal?: string | null };
  }>;
  error?: { message?: string };
}

export class OpenRouterError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenRouterError';
    this.status = status;
  }
}

/** Validates the server-side key without consuming one of the free model requests. */
export async function checkOpenRouterHealth(apiKey: string, timeoutMs = 10_000): Promise<void> {
  const response = await fetchWithTimeout(`${OPENROUTER_API_URL}/key`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  }, timeoutMs, 'health');
  const body = await parseBody<{ error?: { message?: string } }>(response);
  if (!response.ok) throw providerError(response, body);
}

/** Uses the exact free Nemotron endpoint; JSON is validated by the parser boundary. */
export async function requestOpenRouterCompletion({
  apiKey,
  system,
  prompt,
  maxTokens,
  temperature = 0,
  timeoutMs = 55_000,
  operation = 'completion',
  document,
}: CompletionOptions): Promise<string> {
  const startedAt = Date.now();
  const userContent = document
    ? [
      { type: 'text', text: prompt },
      {
        type: 'file',
        file: {
          filename: document.filename,
          file_data: `data:${document.mediaType};base64,${document.base64}`,
        },
      },
    ]
    : prompt;
  const response = await fetchWithTimeout(OPENROUTER_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://cardinal-skill.app',
      'X-Title': 'Cardinal Skill',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      ...(document
        ? { plugins: [{ id: 'file-parser', pdf: { engine: 'cloudflare-ai' } }] }
        : {}),
      stream: false,
      temperature,
      max_tokens: maxTokens,
      reasoning: { effort: 'none', exclude: true },
    }),
  }, timeoutMs, operation);
  const body = await parseBody<OpenRouterResponse>(response);
  if (!response.ok) {
    const error = providerError(response, body);
    logRequest(operation, 'error', startedAt, response.status, error.message);
    throw error;
  }

  const choice = body.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (choice?.message?.refusal) throw new OpenRouterError('Nemotron refused the syllabus request.', 422);
  if (!content) throw new OpenRouterError('OpenRouter returned no parser content.', 502);
  if (choice?.finish_reason === 'length') {
    throw new OpenRouterError('Nemotron stopped before completing the course graph.', 502);
  }
  logRequest(operation, 'success', startedAt, response.status);
  return content;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  operation: string,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (cause) {
    const message = cause instanceof Error && cause.name === 'AbortError'
      ? `The OpenRouter ${operation} request timed out.`
      : 'OpenRouter could not be reached.';
    console.error(JSON.stringify({ event: 'openrouter.network_error', operation, message }));
    throw new OpenRouterError(message, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseBody<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

function providerError(response: Response, body: { error?: { message?: string } }): OpenRouterError {
  const providerMessage = body.error?.message?.trim();
  if (response.status === 401) return new OpenRouterError('The configured OpenRouter API key was rejected.', 401);
  if (response.status === 402) return new OpenRouterError('The OpenRouter account requires credits or a higher limit.', 402);
  if (response.status === 403) return new OpenRouterError(providerMessage || 'OpenRouter denied model access.', 403);
  if (response.status === 429) return new OpenRouterError('The OpenRouter free-model rate limit was reached.', 429);
  return new OpenRouterError(providerMessage || `OpenRouter returned HTTP ${response.status}.`, response.status);
}

function logRequest(
  operation: string,
  result: 'success' | 'error',
  startedAt: number,
  status: number,
  message?: string,
): void {
  const entry = {
    event: 'openrouter.request',
    operation,
    model: OPENROUTER_MODEL,
    result,
    status,
    duration_ms: Date.now() - startedAt,
    ...(message ? { message } : {}),
  };
  if (result === 'error') console.error(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}
