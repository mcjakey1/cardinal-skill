import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BAIError,
  BAI_MODEL,
  checkBAIHealth,
  parseJsonObjectText,
  requestStructuredCompletion,
  requestTextCompletion,
} from '../../supabase/functions/_shared/bai.ts';

test('b.ai structured requests keep the key in the authorization header', async () => {
  const originalFetch = globalThis.fetch;
  let captured: { input?: string | URL | Request; init?: RequestInit } = {};
  globalThis.fetch = async (input, init) => {
    captured = { input, init };
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  try {
    const result = await requestStructuredCompletion({
      apiKey: 'server-only-test-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      schemaName: 'test_object',
      schema: { type: 'object' },
      maxTokens: 100,
    });

    assert.equal(result, '{"ok":true}');
    assert.equal(captured.input, 'https://api.b.ai/v1/chat/completions');
    assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer server-only-test-key');
    const payload = JSON.parse(String(captured.init?.body));
    assert.equal(payload.model, BAI_MODEL);
    assert.equal(payload.stream, false);
    assert.equal(payload.response_format.type, 'json_schema');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('plain text completion does not send a structured response format', async () => {
  const originalFetch = globalThis.fetch;
  let payload: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    payload = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  try {
    const result = await requestTextCompletion({
      apiKey: 'server-only-test-key',
      system: 'Return JSON text.',
      prompt: 'Build the object.',
      maxTokens: 100,
    });
    assert.equal(result, '{"ok":true}');
    assert.equal('response_format' in payload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('b.ai provider errors retain their status and safe message', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: { message: 'Model access is restricted.' } },
    { status: 403 },
  );

  try {
    await assert.rejects(
      requestStructuredCompletion({
        apiKey: 'server-only-test-key',
        system: 'Return JSON.',
        prompt: 'Build the object.',
        schemaName: 'test_object',
        schema: { type: 'object' },
        maxTokens: 100,
      }),
      (cause: unknown) => cause instanceof BAIError
        && cause.status === 403
        && cause.message === 'Model access is restricted.',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('structured output falls back to JSON Object mode when schema mode is rejected', async () => {
  const originalFetch = globalThis.fetch;
  const formats: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    formats.push(payload.response_format.type);
    return formats.length === 1
      ? Response.json({ error: { message: 'Unsupported response format.' } }, { status: 400 })
      : Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  try {
    const result = await requestStructuredCompletion({
      apiKey: 'server-only-test-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      schemaName: 'test_object',
      schema: { type: 'object' },
      maxTokens: 100,
    });
    assert.equal(result, '{"ok":true}');
    assert.deepEqual(formats, ['json_schema', 'json_object']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('structured output can use JSON Object mode without a schema-mode round trip', async () => {
  const originalFetch = globalThis.fetch;
  const formats: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const payload = JSON.parse(String(init?.body));
    formats.push(payload.response_format.type);
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };

  try {
    const result = await requestStructuredCompletion({
      apiKey: 'server-only-test-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      schemaName: 'test_object',
      schema: { type: 'object' },
      maxTokens: 100,
      responseMode: 'json-object',
    });
    assert.equal(result, '{"ok":true}');
    assert.deepEqual(formats, ['json_object']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('provider health requires access to the configured model', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ data: [{ id: 'some-other-model' }] });

  try {
    await assert.rejects(
      checkBAIHealth('server-only-test-key'),
      (cause: unknown) => cause instanceof BAIError
        && cause.status === 403
        && cause.message.includes(BAI_MODEL),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('extracts a JSON object from fenced or prefaced provider output', () => {
  assert.deepEqual(
    parseJsonObjectText<{ ok: boolean }>('Here is the result:\n```json\n{"ok":true}\n```'),
    { ok: true },
  );
  assert.throws(
    () => parseJsonObjectText('{"broken":"value}'),
    /unterminated/i,
  );
});

test('uses the first complete object when a provider appends duplicate JSON', () => {
  assert.deepEqual(
    parseJsonObjectText<{ courseTitle: string }>(
      '{"courseTitle":"Digital Signal Processing"}\n{"courseTitle":"Duplicate"}',
    ),
    { courseTitle: 'Digital Signal Processing' },
  );
});

test('balanced JSON extraction ignores braces and escaped quotes inside strings', () => {
  assert.deepEqual(
    parseJsonObjectText<{ mission: string }>(
      'prefix {"mission":"Compare {FIR} and \\"IIR\\" responses."} trailing {noise}',
    ),
    { mission: 'Compare {FIR} and "IIR" responses.' },
  );
});

test('truncated outer JSON never falls through to a balanced inner fragment', () => {
  assert.throws(
    () => parseJsonObjectText('{"courseTitle":"DSP","nodes":[{"id":"inner"}]'),
    /unterminated json object/i,
  );
});
