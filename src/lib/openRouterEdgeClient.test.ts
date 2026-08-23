import assert from 'node:assert/strict';
import test from 'node:test';

import {
  checkOpenRouterHealth,
  OPENROUTER_MODEL,
  OpenRouterError,
  requestOpenRouterCompletion,
} from '../../supabase/functions/_shared/openrouter.ts';

test('OpenRouter parser requests use free Nemotron without exposing reasoning', async () => {
  const originalFetch = globalThis.fetch;
  let captured: { input?: string | URL | Request; init?: RequestInit } = {};
  globalThis.fetch = async (input, init) => {
    captured = { input, init };
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
  };

  try {
    const result = await requestOpenRouterCompletion({
      apiKey: 'server-only-openrouter-key',
      system: 'Return JSON.',
      prompt: 'Build the object.',
      maxTokens: 100,
    });
    assert.equal(result, '{"ok":true}');
    assert.equal(captured.input, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(new Headers(captured.init?.headers).get('Authorization'), 'Bearer server-only-openrouter-key');
    const payload = JSON.parse(String(captured.init?.body));
    assert.equal(payload.model, OPENROUTER_MODEL);
    assert.deepEqual(payload.reasoning, { effort: 'none', exclude: true });
    assert.equal('response_format' in payload, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter health validates the configured key endpoint', async () => {
  const originalFetch = globalThis.fetch;
  let requested = '';
  globalThis.fetch = async (input) => {
    requested = String(input);
    return Response.json({ data: { is_free_tier: true } });
  };
  try {
    await checkOpenRouterHealth('server-only-openrouter-key');
    assert.equal(requested, 'https://openrouter.ai/api/v1/key');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter PDF requests use one file message and the free parser plugin', async () => {
  const originalFetch = globalThis.fetch;
  let requestBody = '';
  globalThis.fetch = async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"ok":true}' } }] });
  };

  try {
    await requestOpenRouterCompletion({
      apiKey: 'server-only-openrouter-key',
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
    assert.deepEqual(payload.messages[1].content, [
      { type: 'text', text: 'Read the attached syllabus.' },
      {
        type: 'file',
        file: {
          filename: 'course syllabus.pdf',
          file_data: 'data:application/pdf;base64,JVBERi0xLjQ=',
        },
      },
    ]);
    assert.deepEqual(payload.plugins, [
      { id: 'file-parser', pdf: { engine: 'cloudflare-ai' } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OpenRouter free-tier errors stay actionable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: 'Rate limited' } }, { status: 429 });
  try {
    await assert.rejects(
      requestOpenRouterCompletion({
        apiKey: 'server-only-openrouter-key',
        system: 'Return JSON.',
        prompt: 'Build the object.',
        maxTokens: 100,
      }),
      (cause: unknown) => cause instanceof OpenRouterError
        && cause.status === 429
        && cause.message.includes('rate limit'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
