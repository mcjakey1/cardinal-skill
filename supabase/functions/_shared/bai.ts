const BAI_API_URL = 'https://api.b.ai/v1';
const BAI_CHAT_URL = `${BAI_API_URL}/chat/completions`;

export const BAI_MODEL = 'deepseek-v4-flash';

interface CompletionOptions {
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  operation?: string;
}

interface StructuredCompletionOptions extends CompletionOptions {
  schemaName: string;
  schema: Record<string, unknown>;
  responseMode?: 'auto' | 'json-object';
}

interface BAIChatResponse {
  choices?: Array<{ message?: { content?: string; refusal?: string | null } }>;
  error?: { message?: string };
}

interface BAIModelsResponse {
  data?: Array<{ id?: string }>;
  error?: { message?: string };
}

export class BAIError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'BAIError';
    this.status = status;
  }
}

/** Extracts the first complete JSON object from wrapped or duplicated provider output. */
export function parseJsonObjectText<T>(content: string): T {
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let lastError: unknown;
  for (let start = trimmed.indexOf('{'); start >= 0; start = trimmed.indexOf('{', start + 1)) {
    const end = balancedObjectEnd(trimmed, start);
    // An unclosed outer object is a truncated response. Do not skip into one of
    // its balanced child objects and mistake that fragment for the full graph.
    if (end < 0) throw new SyntaxError('Unterminated JSON object in provider response.');
    try {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    } catch (cause) {
      lastError = cause;
    }
  }
  if (lastError) throw lastError;
  return JSON.parse(trimmed) as T;
}

function balancedObjectEnd(value: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/** Verifies the configured key and confirms that this account can see the selected model. */
export async function checkBAIHealth(apiKey: string, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(`${BAI_API_URL}/models`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` },
  }, timeoutMs, 'health');
  const body = await parseProviderBody<BAIModelsResponse>(response);
  if (!response.ok) throw providerError(response, body);
  if (!body.data?.some((model) => model.id === BAI_MODEL)) {
    throw new BAIError(`The b.ai account cannot access ${BAI_MODEL}.`, 403);
  }
  logBAI('health', 'success', startedAt, response.status);
}

/** Calls b.ai from a trusted server runtime for an ordinary text response. */
export async function requestTextCompletion({
  apiKey,
  system,
  prompt,
  maxTokens,
  temperature = 0.7,
  timeoutMs = 60_000,
  operation = 'text-completion',
}: CompletionOptions): Promise<string> {
  const response = await requestChat({
    apiKey,
    system,
    prompt,
    maxTokens,
    temperature,
    timeoutMs,
    operation,
  });
  return completionText(response);
}

/** Requests strict JSON, retrying with JSON Object mode if JSON Schema mode is rejected. */
export async function requestStructuredCompletion({
  apiKey,
  system,
  prompt,
  schemaName,
  schema,
  maxTokens,
  temperature = 0.2,
  timeoutMs = 120_000,
  operation = 'structured-completion',
  responseMode = 'auto',
}: StructuredCompletionOptions): Promise<string> {
  if (responseMode === 'json-object') {
    const response = await requestChat({
      apiKey,
      system,
      prompt: `${prompt}\n\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}`,
      maxTokens,
      temperature,
      timeoutMs,
      operation,
      responseFormat: { type: 'json_object' },
    });
    return completionText(response);
  }
  try {
    const response = await requestChat({
      apiKey,
      system,
      prompt,
      maxTokens,
      temperature,
      timeoutMs,
      operation,
      responseFormat: {
        type: 'json_schema',
        json_schema: { name: schemaName, strict: true, schema },
      },
    });
    return completionText(response);
  } catch (cause) {
    if (!(cause instanceof BAIError) || cause.status !== 400) throw cause;
    console.warn(JSON.stringify({ event: 'bai.schema_fallback', operation, model: BAI_MODEL }));
    const response = await requestChat({
      apiKey,
      system,
      prompt: `${prompt}\n\nReturn only JSON matching this schema:\n${JSON.stringify(schema)}`,
      maxTokens,
      temperature,
      timeoutMs,
      operation: `${operation}-json-object-fallback`,
      responseFormat: { type: 'json_object' },
    });
    return completionText(response);
  }
}

async function requestChat({
  apiKey,
  system,
  prompt,
  maxTokens,
  temperature,
  timeoutMs,
  operation,
  responseFormat,
}: CompletionOptions & { responseFormat?: Record<string, unknown> }): Promise<BAIChatResponse> {
  const startedAt = Date.now();
  const response = await fetchWithTimeout(BAI_CHAT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: BAI_MODEL,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
      stream: false,
      temperature,
      max_tokens: maxTokens,
      ...(responseFormat ? { response_format: responseFormat } : {}),
    }),
  }, timeoutMs ?? 60_000, operation ?? 'completion');
  const body = await parseProviderBody<BAIChatResponse>(response);
  if (!response.ok) {
    const error = providerError(response, body);
    logBAI(operation ?? 'completion', 'error', startedAt, response.status, error.message);
    throw error;
  }
  logBAI(operation ?? 'completion', 'success', startedAt, response.status);
  return body;
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
      ? `The b.ai ${operation} request timed out.`
      : 'The b.ai provider could not be reached.';
    console.error(JSON.stringify({ event: 'bai.network_error', operation, message }));
    throw new BAIError(message, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseProviderBody<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

function providerError(response: Response, body: { error?: { message?: string } }): BAIError {
  const providerMessage = body.error?.message?.trim();
  if (response.status === 401) return new BAIError('The configured b.ai API key was rejected.', 401);
  if (response.status === 403) {
    return new BAIError(providerMessage || 'The b.ai account cannot access the selected model.', 403);
  }
  if (response.status === 429) return new BAIError('The b.ai rate limit or credit limit was reached.', 429);
  return new BAIError(providerMessage || `b.ai returned HTTP ${response.status}.`, response.status);
}

function completionText(body: BAIChatResponse): string {
  const message = body.choices?.[0]?.message;
  if (message?.refusal) throw new BAIError('The AI provider refused the request.', 422);
  const content = message?.content?.trim();
  if (!content) throw new BAIError('The AI provider returned no content.', 502);
  return content;
}

function logBAI(
  operation: string,
  result: 'success' | 'error',
  startedAt: number,
  status: number,
  message?: string,
): void {
  const entry = {
    event: 'bai.request',
    operation,
    model: BAI_MODEL,
    result,
    status,
    duration_ms: Date.now() - startedAt,
    ...(message ? { message } : {}),
  };
  if (result === 'error') console.error(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}
