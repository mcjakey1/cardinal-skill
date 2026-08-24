const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta';

/** Google does not expose a general-purpose `gemini-3.1-flash` model. */
export const GEMINI_MODEL = 'gemini-3.1-flash-lite';

interface CompletionOptions {
  apiKey: string;
  system: string;
  prompt: string;
  maxTokens: number;
  seed?: number;
  timeoutMs?: number;
  operation?: string;
  responseJsonSchema?: Record<string, unknown>;
  useGenerationConfig?: boolean;
  document?: {
    base64: string;
    mediaType: 'application/pdf';
    filename: string;
  };
}

interface GeminiResponse {
  candidates?: Array<{
    finishReason?: string;
    content?: { parts?: Array<{ text?: string }> };
  }>;
  promptFeedback?: { blockReason?: string };
  error?: { message?: string; status?: string };
}

export class GeminiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

/** Validates both the API key and configured model without running inference. */
export async function checkGeminiHealth(apiKey: string, timeoutMs = 10_000): Promise<void> {
  const response = await fetchWithTimeout(`${GEMINI_API_URL}/models/${GEMINI_MODEL}`, {
    method: 'GET',
    headers: { 'x-goog-api-key': apiKey },
  }, timeoutMs, 'health');
  const body = await parseBody<GeminiResponse>(response);
  if (!response.ok) throw providerError(response, body);
}

export async function requestGeminiCompletion({
  apiKey,
  system,
  prompt,
  maxTokens,
  seed,
  timeoutMs = 55_000,
  operation = 'completion',
  responseJsonSchema,
  useGenerationConfig = true,
  document,
}: CompletionOptions): Promise<string> {
  const startedAt = Date.now();
  const parts: Array<Record<string, unknown>> = [{ text: prompt }];
  if (document) {
    parts.push({
      inlineData: {
        mimeType: document.mediaType,
        data: document.base64,
      },
    });
  }

  const response = await fetchWithTimeout(
    `${GEMINI_API_URL}/models/${GEMINI_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts }],
        ...(useGenerationConfig
          ? {
            generationConfig: {
              maxOutputTokens: maxTokens,
              ...(seed !== undefined ? { seed } : {}),
              responseMimeType: 'application/json',
              ...(responseJsonSchema ? { responseJsonSchema } : {}),
            },
          }
          : {}),
      }),
    },
    timeoutMs,
    operation,
  );
  const body = await parseBody<GeminiResponse>(response);
  if (!response.ok) {
    if (response.status === 400 && responseJsonSchema) {
      console.warn(JSON.stringify({
        event: 'gemini.schema_fallback',
        operation,
        model: GEMINI_MODEL,
      }));
      return await requestGeminiCompletion({
        apiKey,
        system,
        prompt,
        maxTokens,
        seed,
        timeoutMs,
        operation: `${operation}-json-fallback`,
        document,
      });
    }
    if (response.status === 400 && useGenerationConfig) {
      console.warn(JSON.stringify({
        event: 'gemini.config_fallback',
        operation,
        model: GEMINI_MODEL,
      }));
      return await requestGeminiCompletion({
        apiKey,
        system,
        prompt,
        maxTokens,
        seed,
        timeoutMs,
        operation: `${operation}-minimal-fallback`,
        document,
        useGenerationConfig: false,
      });
    }
    const error = providerError(response, body);
    logRequest(operation, 'error', startedAt, response.status, error.message);
    throw error;
  }

  const candidate = body.candidates?.[0];
  const content = candidate?.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!candidate) {
    const reason = body.promptFeedback?.blockReason;
    throw new GeminiError(
      reason ? `Gemini blocked the syllabus request (${reason}).` : 'Gemini returned no parser candidate.',
      reason ? 422 : 502,
    );
  }
  if (!content) throw new GeminiError('Gemini returned no parser content.', 502);
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('Gemini stopped before completing the course graph.', 502);
  }
  if (candidate.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
    throw new GeminiError(`Gemini could not complete the syllabus request (${candidate.finishReason}).`, 422);
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
      ? `The Gemini ${operation} request timed out.`
      : 'Gemini could not be reached.';
    console.error(JSON.stringify({ event: 'gemini.network_error', operation, message }));
    throw new GeminiError(message, 502);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseBody<T>(response: Response): Promise<T> {
  return await response.json().catch(() => ({})) as T;
}

function providerError(response: Response, body: GeminiResponse): GeminiError {
  const providerMessage = body.error?.message?.trim();
  if (response.status === 400) return new GeminiError(providerMessage || 'Gemini rejected the parser request.', 400);
  if (response.status === 401 || response.status === 403) {
    return new GeminiError('The configured Gemini API key was rejected or cannot access this model.', 401);
  }
  if (response.status === 404) return new GeminiError(`Gemini model ${GEMINI_MODEL} is unavailable.`, 503);
  if (response.status === 429) return new GeminiError('The Gemini API quota or rate limit was reached.', 429);
  return new GeminiError(providerMessage || `Gemini returned HTTP ${response.status}.`, response.status);
}

function logRequest(
  operation: string,
  result: 'success' | 'error',
  startedAt: number,
  status: number,
  message?: string,
): void {
  const entry = {
    event: 'gemini.request',
    operation,
    model: GEMINI_MODEL,
    result,
    status,
    duration_ms: Date.now() - startedAt,
    ...(message ? { message } : {}),
  };
  if (result === 'error') console.error(JSON.stringify(entry));
  else console.info(JSON.stringify(entry));
}
