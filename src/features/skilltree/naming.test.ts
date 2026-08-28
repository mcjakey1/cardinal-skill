import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MAX_NAME, normaliseOverride, resolveName, resolveQuestName } from './naming.ts';
import type { SkillNode } from './types';

function node(extra: Partial<SkillNode> = {}): SkillNode {
  return {
    id: 'n1',
    courseId: 'c1',
    trackId: null,
    title: 'Describing data',
    description: '',
    kind: 'topic',
    xpReward: 50,
    x: 0,
    y: 0,
    sortOrder: 0,
    ...extra,
  };
}

test('an instructor override beats the generated name', () => {
  assert.deepEqual(
    resolveName({ override: 'Week One', generated: 'The Shape of Numbers', syllabus: 'Describing data' }),
    { text: 'Week One', source: 'override' },
  );
});

test('the generated name is used when nobody has overridden it', () => {
  assert.deepEqual(
    resolveName({ generated: 'The Shape of Numbers', syllabus: 'Describing data' }),
    { text: 'The Shape of Numbers', source: 'generated' },
  );
});

test('the syllabus title is the last resort, so a node always has a name', () => {
  assert.deepEqual(resolveName({ syllabus: 'Describing data' }), {
    text: 'Describing data',
    source: 'syllabus',
  });
});

test('a blank override is not an override', () => {
  // Clearing the field is how an instructor reverts, so whitespace must fall
  // through rather than naming the node with an empty string.
  assert.deepEqual(
    resolveName({ override: '   ', generated: 'The Shape of Numbers', syllabus: 'Describing data' }),
    { text: 'The Shape of Numbers', source: 'generated' },
  );
});

test('a blank generated name falls through to the syllabus title', () => {
  assert.deepEqual(resolveName({ generated: '', syllabus: 'Describing data' }), {
    text: 'Describing data',
    source: 'syllabus',
  });
});

test('a node with nothing but a syllabus title resolves to it', () => {
  assert.deepEqual(resolveQuestName(node()), { text: 'Describing data', source: 'syllabus' });
});

test('a local override outranks the one stored on the node', () => {
  // Both are overrides. The local one is the edit this device just made and has
  // not pushed yet, so showing the server's would undo it in front of the person
  // who typed it.
  assert.deepEqual(
    resolveQuestName(node({ titleOverride: 'Server name', questTitle: 'Generated' }), 'Local name'),
    { text: 'Local name', source: 'override' },
  );
});

test('the override stored on the node still beats the generated name', () => {
  assert.deepEqual(
    resolveQuestName(node({ titleOverride: 'Server name', questTitle: 'Generated' })),
    { text: 'Server name', source: 'override' },
  );
});

test('an override is trimmed and capped, because the chart has to draw it', () => {
  assert.equal(normaliseOverride('  Week One  '), 'Week One');
  assert.equal(normaliseOverride('x'.repeat(MAX_NAME + 40))?.length, MAX_NAME);
});

test('an empty override normalises to null, which is how a revert is stored', () => {
  assert.equal(normaliseOverride('   '), null);
  assert.equal(normaliseOverride(''), null);
});
