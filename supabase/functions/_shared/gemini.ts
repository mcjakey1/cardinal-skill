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
  /** Last-resort retry: keep JSON mode and the token cap, drop everything else. */
  minimalGenerationConfig?: boolean;
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

/**
 * Gemini usually names an unsupported generationConfig field, but some model
 * versions reduce schema/config validation failures to the exact generic
 * INVALID_ARGUMENT message. These gates keep the fallback bounded while all
 * other 400s (for example, payload-size failures) surface immediately.
 */
const SCHEMA_REJECTION = /response_?json_?schema|response_?schema/i;
const CONFIG_REJECTION = /generation_?config|\bseed\b|max_?output_?tokens/i;
const GENERIC_INVALID_ARGUMENT = /^request contains an invalid argument\.?$/i;

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
  minimalGenerationConfig = false,
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
        // JSON mode and the token cap are never dropped: without
        // responseMimeType the model answers in prose and every caller's parse
        // fails, and without maxOutputTokens the response is unbounded.
        generationConfig: {
          maxOutputTokens: maxTokens,
          responseMimeType: 'application/json',
          ...(minimalGenerationConfig
            ? {}
            : {
              ...(seed !== undefined ? { seed } : {}),
              ...(responseJsonSchema ? { responseJsonSchema } : {}),
            }),
        },
      }),
    },
    timeoutMs,
    operation,
  );
  const body = await parseBody<GeminiResponse>(response);
  if (!response.ok) {
    // Retry a named field rejection or Gemini's exact generic INVALID_ARGUMENT.
    // Retrying on every 400 would make a malformed PDF or oversized request buy
    // a second full-price call and then report a misleading schema problem.
    const providerMessage = body.error?.message ?? '';
    const genericInvalidArgument = response.status === 400
      && GENERIC_INVALID_ARGUMENT.test(providerMessage.trim());
    if (
      response.status === 400
      && responseJsonSchema
      && (SCHEMA_REJECTION.test(providerMessage) || genericInvalidArgument)
    ) {
      console.warn(JSON.stringify({
        event: 'gemini.schema_fallback',
        operation,
        model: GEMINI_MODEL,
        message: providerMessage.slice(0, 240),
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
    if (
      response.status === 400
      && !minimalGenerationConfig
      && (CONFIG_REJECTION.test(providerMessage) || genericInvalidArgument)
    ) {
      console.warn(JSON.stringify({
        event: 'gemini.config_fallback',
        operation,
        model: GEMINI_MODEL,
        message: providerMessage.slice(0, 240),
      }));
      return await requestGeminiCompletion({
        apiKey,
        system,
        prompt,
        maxTokens,
        timeoutMs,
        operation: `${operation}-minimal-fallback`,
        document,
        minimalGenerationConfig: true,
      });
    }
    const error = providerError(response, body);
    logRequest(operation, 'error', startedAt, response.status, error.message);
    throw error;
  }

  // Why the refusal checks come before the content check: a safety block is an
  // HTTP 200 with a finishReason and no parts. Reading content first turned
  // that into the 502 below, which parse-syllabus treats as retryable — so a
  // refusal bought a second full-size call and then reported a validation
  // error. A refusal is 422 and final; only a truncation is worth retrying.
  const candidate = body.candidates?.[0];
  if (!candidate) {
    const reason = body.promptFeedback?.blockReason;
    throw new GeminiError(
      reason ? `Gemini blocked the syllabus request (${reason}).` : 'Gemini returned no parser candidate.',
      reason ? 422 : 502,
    );
  }
  if (candidate.finishReason === 'MAX_TOKENS') {
    throw new GeminiError('Gemini stopped before completing the course graph.', 502);
  }
  if (candidate.finishReason && !['STOP', 'FINISH_REASON_UNSPECIFIED'].includes(candidate.finishReason)) {
    throw new GeminiError(`Gemini could not complete the syllabus request (${candidate.finishReason}).`, 422);
  }
  const content = candidate.content?.parts
    ?.map((part) => part.text ?? '')
    .join('')
    .trim();
  if (!content) throw new GeminiError('Gemini returned no parser content.', 502);
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
