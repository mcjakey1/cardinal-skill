import assert from 'node:assert/strict';
import test from 'node:test';

import { ditherFill, ditherId, instanceNamespace } from './dither.ts';

// The bug: every dithered field declared itself `csk-field-N`. Inactive routes
// stay mounted here, `url(#id)` takes the first match in the document, and so
// one screen drew another screen's colours — then lost its background entirely
// when that screen unmounted and took the only definition with it.

test('two mounted components never share a namespace', () => {
  const a = instanceNamespace('field', ':r1:');
  const b = instanceNamespace('field', ':r2:');
  assert.notEqual(a, b);
  assert.notEqual(ditherId(a, 8), ditherId(b, 8));
});

test('a namespace is a usable XML id, whatever useId returned', () => {
  for (const raw of [':r1:', '«r7»', '_R_2H_', 'r0']) {
    const id = ditherId(instanceNamespace('field', raw), 16);
    assert.match(id, /^[A-Za-z][A-Za-z0-9-]*$/, `${raw} produced ${id}`);
    assert.equal(ditherFill(instanceNamespace('field', raw), 16), `url(#${id})`);
  }
});

test('an id that scrubs down to nothing still produces one', () => {
  const id = ditherId(instanceNamespace('field', ':::'), 4);
  assert.match(id, /^[A-Za-z][A-Za-z0-9-]*$/);
});

test('the same component keeps the same namespace across renders', () => {
  assert.equal(instanceNamespace('field', ':r1:'), instanceNamespace('field', ':r1:'));
});
