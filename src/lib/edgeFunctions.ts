import { supabase } from './supabase';
import { edgeErrorMessage } from './edgeFunctionError';
import { readEdgeResponseText, type EdgeResponseStreamTelemetry } from './edgeStream';

export { edgeErrorMessage } from './edgeFunctionError';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const DEFAULT_TIMEOUT_MS = 90_000;

export class EdgeFunctionError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.status = status;
  }
}

export interface EdgeFunctionTelemetry extends EdgeResponseStreamTelemetry {
  onRequest?: (event: { endpoint: string; requestBytes: number }) => void;
  onResponse?: (event: { status: number; durationMs: number; contentLength: number | null }) => void;
}

/**
 * Calls one authenticated Supabase Edge Function without losing its error body.
 * Provider secrets remain inside the function; the browser only receives the
 * public anon key and the signed-in user's short-lived access token.
 */
export async function callEdgeFunction<T>(
  functionName: string,
  body: Readonly<Record<string, unknown>>,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  telemetry?: EdgeFunctionTelemetry,
): Promise<T> {
  if (!supabaseUrl || !anonKey) {
    throw new EdgeFunctionError('The API connection is not configured on this device.', null);
  }

  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new EdgeFunctionError('Sign in with a verified account to use the live AI service.', 401);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const endpoint = `${supabaseUrl}/functions/v1/${functionName}`;
  const requestBody = JSON.stringify(body);
  const requestBytes = new TextEncoder().encode(requestBody).byteLength;
  const startedAt = Date.now();
  try {
    telemetry?.onRequest?.({ endpoint, requestBytes });
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: requestBody,
      signal: controller.signal,
    });
    telemetry?.onResponse?.({
      status: response.status,
      durationMs: Date.now() - startedAt,
      contentLength: parseContentLength(response.headers.get('content-length')),
    });
    const raw = await readEdgeResponseText(response, telemetry);
    let parsed: unknown = null;
    if (raw) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
    }
    if (!response.ok) {
      throw new EdgeFunctionError(
        edgeErrorMessage(parsed, `The API returned HTTP ${response.status}. Try again.`),
        response.status,
      );
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new EdgeFunctionError('The API returned an unreadable response. Try again.', response.status);
    }
    return parsed as T;
  } catch (error) {
    if (error instanceof EdgeFunctionError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EdgeFunctionError('The API took too long to respond. Try again.', 408);
    }
    throw new EdgeFunctionError('The API could not be reached. Check your connection and try again.', null);
  } finally {
    clearTimeout(timeout);
  }
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
