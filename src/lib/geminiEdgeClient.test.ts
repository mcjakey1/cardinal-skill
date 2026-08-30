import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkGeminiHealth,
  GEMINI_MODEL,
  GeminiError,
  requestGeminiCompletion,
} from '../../supabase/functions/_shared/gemini.ts';

test('Gemini parser requests structured JSON from the server-only model endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let captured: { input?: string | URL | Request; init?: RequestInit } = {};
  globalThis.fetch = async (input, init) => {
    captured = { input, init };
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };

  try {
    const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
    const result = await requestGeminiCompletion({
      apiKey: 'server-only-gemini-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      maxTokens: 100,
      seed: 12345,
      responseJsonSchema: schema,
    });
    assert.equal(result, '{"ok":true}');
    assert.equal(captured.input, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`);
    assert.equal(new Headers(captured.init?.headers).get('x-goog-api-key'), 'server-only-gemini-key');
    const payload = JSON.parse(String(captured.init?.body));
    assert.deepEqual(payload.systemInstruction, { parts: [{ text: 'Return JSON.' }] });
    assert.equal(payload.generationConfig.responseMimeType, 'application/json');
    assert.equal(payload.generationConfig.seed, 12345);
    assert.deepEqual(payload.generationConfig.responseJsonSchema, schema);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini health validates the configured model without inference', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async (input) => {
    requested = String(input);
    return Response.json({ name: `models/${GEMINI_MODEL}` });
  };
  try {
    await checkGeminiHealth('server-only-gemini-key');
    assert.equal(requested, `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini PDF requests send native inline PDF data', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };

  try {
    await requestGeminiCompletion({
      apiKey: 'server-only-gemini-key',
      system: 'Return JSON.',
      prompt: 'Read the attached syllabus.',
      maxTokens: 100,
      document: {
        base64: 'JVBERi0xLjQ=',
        mediaType: 'application/pdf',
        filename: 'course syllabus.pdf',
      },
    });
    const payload = JSON.parse(requestBody);
    assert.deepEqual(payload.contents[0].parts, [
      { text: 'Read the attached syllabus.' },
      { inlineData: { mimeType: 'application/pdf', data: 'JVBERi0xLjQ=' } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini quota errors stay actionable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: 'Quota exceeded' } }, { status: 429 });
  try {
    await assert.rejects(
      requestGeminiCompletion({
        apiKey: 'server-only-gemini-key',
        system: 'Return JSON.',
        prompt: 'Build the object.',
        maxTokens: 100,
      }),
      (cause: unknown) => cause instanceof GeminiError
        && cause.status === 429
        && cause.message.includes('quota'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini retries in JSON mode when a complex response schema is rejected', async () => {
  const originalFetch = globalThis.fetch;
  const payloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (payloads.length === 1) {
      // The retry is gated on the provider naming the field it rejected; a
      // generic 400 is a real error and must surface instead.
      return Response.json(
        { error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema".' } },
        { status: 400 },
      );
    }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };

  try {
    const result = await requestGeminiCompletion({
      apiKey: 'server-only-gemini-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      maxTokens: 100,
      seed: 24680,
      responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
      document: {
        base64: 'JVBERi0xLjQ=',
        mediaType: 'application/pdf',
        filename: 'course syllabus.pdf',
      },
    });

    assert.equal(result, '{"ok":true}');
    assert.equal(payloads.length, 2);
    const firstPayload = payloads[0];
    const retryPayload = payloads[1];
    assert.ok(firstPayload);
    assert.ok(retryPayload);
    const firstConfig = firstPayload.generationConfig as Record<string, unknown>;
    const retryConfig = retryPayload.generationConfig as Record<string, unknown>;
    assert.ok(firstConfig.responseJsonSchema);
    assert.equal('responseJsonSchema' in retryConfig, false);
    assert.equal(retryConfig.responseMimeType, 'application/json');
    assert.equal(firstConfig.seed, 24680);
    assert.equal(retryConfig.seed, 24680);
    assert.deepEqual(retryPayload.contents, firstPayload.contents);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gemini falls back to a minimal generation config but keeps JSON mode', async () => {
  const originalFetch = globalThis.fetch;
  const payloads: Record<string, unknown>[] = [];
  globalThis.fetch = async (_input, init) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    if (payloads.length === 1) {
      return Response.json({ error: { message: 'Invalid value at generation_config.seed.' } }, { status: 400 });
    }
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] });
  };

  try {
    const result = await requestGeminiCompletion({
      apiKey: 'server-only-gemini-key',
      system: 'Return JSON.',
      prompt: 'Read the attached syllabus.',
      maxTokens: 100,
      document: {
        base64: 'JVBERi0xLjQ=',
        mediaType: 'application/pdf',
        filename: 'course syllabus.pdf',
      },
    });

    assert.equal(result, '{"ok":true}');
    assert.equal(payloads.length, 2);
    assert.ok(payloads[0]?.generationConfig);
    // Dropping generationConfig outright also dropped JSON mode, so the model
    // answered in prose and every caller's parse failed. The minimal retry
    // keeps the two settings that are never the thing being rejected.
    const retryConfig = payloads[1]?.generationConfig as Record<string, unknown>;
    assert.equal(retryConfig.responseMimeType, 'application/json');
    assert.equal(retryConfig.maxOutputTokens, 100);
    assert.deepEqual(payloads[1]?.contents, payloads[0]?.contents);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
