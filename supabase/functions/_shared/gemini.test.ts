/**
 * Refusal handling and the 400 fallback ladder. Both decide whether a failed
 * call is retried at full price, so both are worth a check that fails loudly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { GeminiError, requestGeminiCompletion } from './gemini.ts';

type Stub = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

async function withFetch<T>(stub: Stub, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = stub as typeof globalThis.fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

const baseRequest = {
  apiKey: 'server-only-gemini-key',
  system: 'Return JSON.',
  prompt: 'Build the object.',
  maxTokens: 100,
};

test('a safety refusal with empty parts reports 422, not a retryable 502', async () => {
  // A blocked candidate comes back as an HTTP 200 carrying a finishReason and
  // no text. Reading content first turned that into a 502, which parse-syllabus
  // treats as retryable — so a refusal silently bought a second full-size call.
  await withFetch(
    async () =>
      Response.json({
        candidates: [{ finishReason: 'SAFETY', content: { parts: [] } }],
      }),
    async () => {
      const error = await requestGeminiCompletion(baseRequest).then(
        () => null,
        (cause: unknown) => cause,
      );
      assert.ok(error instanceof GeminiError, 'expected a GeminiError');
      assert.equal(error.status, 422);
      assert.match(error.message, /SAFETY/);
    },
  );
});

test('an unrelated 400 surfaces instead of silently re-running without the schema', async () => {
  let calls = 0;
  await withFetch(
    async () => {
      calls += 1;
      return Response.json(
        { error: { message: 'Request payload size exceeds the limit.' } },
        { status: 400 },
      );
    },
    async () => {
      const error = await requestGeminiCompletion({
        ...baseRequest,
        responseJsonSchema: { type: 'object' },
      }).then(() => null, (cause: unknown) => cause);
      assert.ok(error instanceof GeminiError, 'expected a GeminiError');
      assert.equal(error.status, 400);
      assert.equal(calls, 1, 'an unrelated 400 must not be retried');
    },
  );
});

test('a schema rejection retries once without the schema but keeps JSON mode', async () => {
  const payloads: Record<string, unknown>[] = [];
  await withFetch(
    async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      if (payloads.length === 1) {
        return Response.json(
          { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema".' } },
          { status: 400 },
        );
      }
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
      });
    },
    async () => {
      const result = await requestGeminiCompletion({
        ...baseRequest,
        responseJsonSchema: { type: 'object' },
      });
      assert.equal(result, '{"ok":true}');
      assert.equal(payloads.length, 2);
      const retry = payloads[1]!.generationConfig as Record<string, unknown>;
      assert.equal(retry.responseJsonSchema, undefined, 'the schema is what was rejected');
      assert.equal(retry.responseMimeType, 'application/json', 'JSON mode must survive');
      assert.equal(retry.maxOutputTokens, 100, 'the token cap must survive');
    },
  );
});

test('a generationConfig rejection falls back to a minimal config that still asks for JSON', async () => {
  const payloads: Record<string, unknown>[] = [];
  await withFetch(
    async (_input, init) => {
      payloads.push(JSON.parse(String(init?.body)));
      if (payloads.length === 1) {
        return Response.json(
          { error: { message: 'Invalid value at generation_config.seed.' } },
          { status: 400 },
        );
      }
      return Response.json({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }],
      });
    },
    async () => {
      const result = await requestGeminiCompletion({ ...baseRequest, seed: 7 });
      assert.equal(result, '{"ok":true}');
      assert.equal(payloads.length, 2);
      const retry = payloads[1]!.generationConfig as Record<string, unknown>;
      assert.equal(retry.seed, undefined, 'the seed is what was rejected');
      assert.equal(retry.responseMimeType, 'application/json', 'JSON mode must survive');
      assert.equal(retry.maxOutputTokens, 100, 'the token cap must survive');
    },
  );
});
