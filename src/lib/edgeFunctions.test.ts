import assert from 'node:assert/strict';
import test from 'node:test';

import { edgeErrorMessage } from './edgeFunctionError.ts';
import { readEdgeResponseText } from './edgeStream.ts';

test('preserves actionable JSON errors returned by Edge Functions', () => {
  assert.equal(
    edgeErrorMessage({ error: 'The model is not configured.' }, 'Fallback'),
    'The model is not configured.',
  );
  assert.equal(edgeErrorMessage({}, 'Fallback'), 'Fallback');
});

test('bounds non-JSON provider errors before showing them in the UI', () => {
  assert.equal(edgeErrorMessage('  upstream unavailable  ', 'Fallback'), 'upstream unavailable');
  assert.equal(edgeErrorMessage('x'.repeat(800), 'Fallback').length, 500);
});

test('reads response chunks and reports cumulative stream telemetry', async () => {
  const encoder = new TextEncoder();
  const chunks = [encoder.encode('{"ok":'), encoder.encode('true}')];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }));
  const events: { index: number; totalBytes: number }[] = [];

  const raw = await readEdgeResponseText(response, {
    onChunk: ({ index, totalBytes }) => events.push({ index, totalBytes }),
  });

  assert.equal(raw, '{"ok":true}');
  assert.deepEqual(events, [
    { index: 1, totalBytes: chunks[0]!.byteLength },
    { index: 2, totalBytes: chunks[0]!.byteLength + chunks[1]!.byteLength },
  ]);
});
