import assert from 'node:assert/strict';
import test from 'node:test';

import { bytesToBase64 } from './base64.ts';

test('encodes file bytes without a browser or Node buffer', () => {
  assert.equal(bytesToBase64(new TextEncoder().encode('Cardinal Skill')), 'Q2FyZGluYWwgU2tpbGw=');
  assert.equal(bytesToBase64(new Uint8Array()), '');
});
