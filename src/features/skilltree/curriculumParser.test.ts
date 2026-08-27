import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  attachMissingSyllabusCoverage,
  MAX_PARSED_SKILLS,
  MIN_PARSED_SKILLS,
  missionDifficultyForTier,
  requireGranularSkillCount,
  requireSyllabusCoverage,
  requireSyllabusScaledSkillCount,
  repairNodeTarget,
  scaleMission,
  syllabusGraphRepairPrompt,
  SYLLABUS_GRAPH_SYSTEM_PROMPT,
  SYLLABUS_OUTLINE_SYSTEM_PROMPT,
  skillCountRangeForWeeks,
  stableGenerationSeed,
} from '../../../supabase/functions/_shared/curriculum.ts';

test('dynamic syllabus trees support mini-modules through comprehensive curricula', () => {
  assert.equal(requireGranularSkillCount(new Array(MIN_PARSED_SKILLS).fill(null)).length, 6);
  assert.equal(requireGranularSkillCount(new Array(MAX_PARSED_SKILLS).fill(null)).length, 40);
  assert.throws(() => requireGranularSkillCount(new Array(5).fill(null)), /between 6 and 40/);
  assert.throws(() => requireGranularSkillCount(new Array(41).fill(null)), /between 6 and 40/);
});

test('a 14-week DSP syllabus cannot collapse to ten weekly-heading nodes', () => {
  assert.deepEqual(skillCountRangeForWeeks(14), { min: 18, max: 26 });
  assert.throws(
    () => requireSyllabusScaledSkillCount(new Array(10).fill(null), 14),
    /14-week syllabus requires 18 to 26 granular skills; the parser returned 10/i,
  );
  assert.equal(requireSyllabusScaledSkillCount(new Array(18).fill(null), 14).length, 18);
});

test('multi-week DSP filter coverage must expand and cannot disappear behind padding', () => {
  const coverage = [
    { week: 9, topics: ['Discrete Fourier Transform'] },
    { week: 10, topics: ['Fast Fourier Transform'] },
    { week: 11, topics: ['Design of Digital Filter: FIR and IIR'] },
    { week: 12, topics: ['Design of Digital Filter: FIR and IIR'] },
    { week: 13, topics: ['Design of Digital Filter: FIR and IIR'] },
  ];

  assert.throws(
    () => requireSyllabusCoverage([
      { unit: 'Discrete Fourier Transform' },
      { unit: 'Fast Fourier Transform' },
      { unit: 'Design of Digital Filter: FIR and IIR' },
    ], coverage),
    /spans 3 weeks and requires at least 3 progressive skills/i,
  );
  assert.doesNotThrow(() => requireSyllabusCoverage([
    { unit: 'Discrete Fourier Transform' },
    { unit: 'Fast Fourier Transform' },
    { unit: 'Design of Digital Filter: FIR and IIR' },
    { unit: 'Design of Digital Filter: FIR and IIR' },
    { unit: 'Design of Digital Filter: FIR and IIR' },
  ], coverage));
});

test('a two-week unit range does not duplicate every subtopic inside that unit', () => {
  assert.doesNotThrow(() => requireSyllabusCoverage([
    { unit: 'Propositions & Logical Connectives' },
  ], [
    { week: 1, topics: ['Propositions & Logical Connectives'] },
    { week: 2, topics: ['Propositions & Logical Connectives'] },
  ]));
});

test('dense syllabus subtopics may share a node only when their content names each topic', () => {
  const coverage = [
    { week: 1, topics: ['Truth Tables', 'Rules of Inference'] },
    { week: 3, topics: ['Well-Ordering Principle'] },
    { week: 5, topics: ['Venn Diagrams'] },
  ];
  const grouped = [
    {
      unit: 'Propositions & Logical Connectives',
      label: 'Logic Foundations',
      description: 'Construct truth tables and validate arguments with inference rules.',
    },
    {
      unit: 'Mathematical Induction',
      description: 'Relate induction proofs to the well-ordering principle.',
    },
    {
      unit: 'Set Notation & Operations',
      mission: { description: 'Use Venn diagrams to visualize set operations.' },
    },
  ];

  assert.doesNotThrow(() => requireSyllabusCoverage(grouped, coverage));
  assert.throws(
    () => requireSyllabusCoverage(grouped.slice(0, 2), coverage),
    /graph omitted syllabus coverage: Venn Diagrams/i,
  );
});

test('the final parser deterministically attaches one omitted dense subtopic to its outline unit', () => {
  const coverage = [{
    week: 13,
    topics: ['Boolean Functions & Expressions', 'Logic Gates', 'Simplification Techniques'],
  }];
  const candidate = [
    { unit: 'Logic Gates', label: 'Digital Logic Gates', description: 'Model common gates.' },
    { unit: 'Graph Coloring', label: 'Graph Coloring', description: 'Solve scheduling problems.' },
    {
      unit: 'Simplification Techniques',
      label: 'Boolean Simplification',
      description: 'Minimize expressions with algebra and K-maps.',
    },
  ];

  const repaired = attachMissingSyllabusCoverage(candidate, coverage);
  assert.match(repaired[2]!.description, /Includes Boolean Functions & Expressions/i);
  assert.equal(repaired[0]!.description, candidate[0]!.description);
  assert.equal(repaired[1]!.description, candidate[1]!.description);
  assert.doesNotThrow(() => requireSyllabusCoverage(repaired, coverage));
  assert.equal(candidate[0]!.description, 'Model common gates.');
});

test('coverage repair can add room for omitted syllabus concepts', () => {
  assert.equal(
    repairNodeTarget(
      { min: 20, max: 26 },
      20,
      'The graph omitted syllabus coverage: Truth Tables; Rules Of Inference; Venn Diagrams.',
    ),
    23,
  );
  assert.equal(
    repairNodeTarget(
      { min: 20, max: 26 },
      25,
      'The graph omitted syllabus coverage: A; B; C; D.',
    ),
    26,
  );
});

test('an undersized graph repair targets an exact count and keeps the candidate', () => {
  const candidate = { nodes: new Array(15).fill(null).map((_, index) => ({ id: `skill-${index}` })) };
  const prompt = syllabusGraphRepairPrompt({
    outline: { estimatedWeeks: 13, coverage: [{ week: 1, topics: ['Foundations'] }] },
    candidate,
    failure: 'The parser returned 15 nodes.',
    targetCount: 17,
  });

  assert.match(prompt, /Return exactly 17 nodes/i);
  assert.match(prompt, /Count the final nodes array/i);
  assert.match(prompt, /"id":"skill-14"/);
  assert.match(prompt, /not a patch/i);
});

test('mission effort and XP stay aligned with difficulty', () => {
  assert.deepEqual(scaleMission('Easy', 45, 100), {
    difficulty: 'Easy', estimatedMinutes: 10, xpReward: 30,
  });
  assert.deepEqual(scaleMission('Medium', 5, 20), {
    difficulty: 'Medium', estimatedMinutes: 15, xpReward: 40,
  });
  assert.deepEqual(scaleMission('Hard', 10, 40), {
    difficulty: 'Hard', estimatedMinutes: 25, xpReward: 75,
  });
});

test('mission difficulty follows cognitive load and the graph tier', () => {
  assert.equal(missionDifficultyForTier(4, 'Integrate the course', 'Medium'), 'Hard');
  assert.equal(missionDifficultyForTier(3, 'Design and evaluate a filter', 'Medium'), 'Hard');
  assert.equal(missionDifficultyForTier(2, 'Apply a standard method', 'Easy'), 'Medium');
  assert.equal(missionDifficultyForTier(1, 'Identify basic notation', 'Easy'), 'Easy');
});

test('the same syllabus content receives the same Gemini seed', async () => {
  const first = await stableGenerationSeed('same syllabus bytes');
  const second = await stableGenerationSeed('same syllabus bytes');
  const different = await stableGenerationSeed('different syllabus bytes');

  assert.equal(first, second);
  assert.notEqual(first, different);
  assert.ok(first >= 1 && first <= 0x7fff_ffff);
});

test('the curriculum prompt is discipline-neutral and handles institutional tables', () => {
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /continuation markers/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /illustrative only/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /single-file railroad/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /exactly four integer tiers/i);
  assert.doesNotMatch(
    SYLLABUS_GRAPH_SYSTEM_PROMPT,
    /Boolean Algebra|K-Map|Combinatorics|Plate Tectonics|Renaissance Literature/i,
  );
});

test('outline recovery preserves weekly rows and multi-topic coverage before graph generation', () => {
  assert.match(SYLLABUS_OUTLINE_SYSTEM_PROMPT, /one coverage item for every numbered instructional week/i);
  assert.match(SYLLABUS_OUTLINE_SYSTEM_PROMPT, /distinct academic topic.*separate string/i);
  assert.match(SYLLABUS_OUTLINE_SYSTEM_PROMPT, /continuation.*repeat the full parent topic/i);
  assert.match(SYLLABUS_OUTLINE_SYSTEM_PROMPT, /do not merge several weeks/i);
});
