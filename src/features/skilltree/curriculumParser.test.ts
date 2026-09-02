import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_PARSED_SKILLS,
  MIN_PARSED_SKILLS,
  expandSharedLeadTopic,
  missionDifficultyForTier,
  requireGranularSkillCount,
  requireSyllabusCoverage,
  requireSyllabusScaledSkillCount,
  requireUniqueParserNodeIds,
  repairNodeTarget,
  repairGenerationSeed,
  reconcileGroupedSyllabusCoverage,
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

test('shared-lead compound topics become explicit graph competencies', () => {
  assert.deepEqual(
    expandSharedLeadTopic('Proof by Contraposition & Contradiction'),
    ['Proof by Contraposition', 'Proof by Contradiction'],
  );
  assert.deepEqual(
    expandSharedLeadTopic('Paths, Circuits & Connectivity'),
    ['Paths, Circuits & Connectivity'],
  );
});

test('a repair uses a different but stable valid Gemini seed', () => {
  assert.equal(repairGenerationSeed(41), 42);
  assert.equal(repairGenerationSeed(0x7fff_ffff), 1);
});

test('a 14-week DSP syllabus cannot collapse to ten weekly-heading nodes', () => {
  assert.deepEqual(skillCountRangeForWeeks(14), { min: 18, max: 26 });
  assert.throws(
    () => requireSyllabusScaledSkillCount(new Array(10).fill(null), 14),
    /14-week syllabus requires 18 to 26 granular skills; the parser returned 10/i,
  );
  assert.equal(requireSyllabusScaledSkillCount(new Array(18).fill(null), 14).length, 18);
});

test('continued syllabus rows do not manufacture a node count', () => {
  const coverage = [
    { week: 9, topics: ['Discrete Fourier Transform'] },
    { week: 10, topics: ['Fast Fourier Transform'] },
    { week: 11, topics: ['Design of Digital Filter: FIR and IIR'] },
    { week: 12, topics: ['Design of Digital Filter: FIR and IIR'] },
    { week: 13, topics: ['Design of Digital Filter: FIR and IIR'] },
  ];

  assert.doesNotThrow(() => requireSyllabusCoverage([
    { unit: 'Discrete Fourier Transform' },
    { unit: 'Fast Fourier Transform' },
    { unit: 'Design of Digital Filter: FIR and IIR' },
  ], coverage));
});

test('repeated rows still require every distinct academic topic', () => {
  const coverage = [
    { week: 11, topics: ['Finite Impulse Response Filters', 'Infinite Impulse Response Filters'] },
    { week: 12, topics: ['Finite Impulse Response Filters', 'Infinite Impulse Response Filters'] },
    { week: 13, topics: ['Finite Impulse Response Filters', 'Infinite Impulse Response Filters'] },
  ];

  assert.throws(
    () => requireSyllabusCoverage([{ unit: 'Finite Impulse Response Filters' }], coverage),
    /omitted syllabus coverage: Infinite Impulse Response Filters/i,
  );
  assert.doesNotThrow(() => requireSyllabusCoverage([
    { unit: 'Finite Impulse Response Filters' },
    { unit: 'Infinite Impulse Response Filters' },
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

test('coverage validation never invents omitted content in an unrelated node', () => {
  assert.throws(
    () => requireSyllabusCoverage(
      [{ unit: 'Logic Gates' }, { unit: 'Graph Coloring' }],
      [{ week: 13, topics: ['Boolean Functions & Expressions'] }],
    ),
    /omitted syllabus coverage/i,
  );
});

test('coverage matching handles common singulars and ignores table filler', () => {
  assert.doesNotThrow(() => requireSyllabusCoverage(
    [{ unit: 'Random Process' }, { unit: 'Error Analysis' }],
    [{ week: 1, topics: ['Random Processes', 'Error Analyses', 'And The'] }],
  ));
});

test('coverage ignores course orientation and generic technique wording', () => {
  assert.doesNotThrow(() => requireSyllabusCoverage(
    [{ unit: 'Boolean Simplification', description: 'Simplify Boolean expressions.' }],
    [{
      week: 1,
      topics: ['Orientation and Introduction to the Course', 'Simplification Techniques'],
    }],
  ));
});

test('one compound proof topic may progress across sibling nodes', () => {
  assert.doesNotThrow(() => requireSyllabusCoverage([
    { unit: 'Proof by Contraposition', description: 'Construct a contrapositive proof.' },
    { unit: 'Proof by Contradiction', description: 'Derive and resolve a contradiction.' },
  ], [{ week: 4, topics: ['Proof by Contraposition & Contradiction'] }]));
});

test('an indirect-proofs node covers the combined contraposition and contradiction topic', () => {
  assert.doesNotThrow(() => requireSyllabusCoverage([{
    unit: 'Indirect Proofs',
    label: 'Indirect Proof Methods',
    description: 'Choose and construct an indirect proof for a proposition.',
  }], [{ week: 4, topics: ['Proof by Contraposition & Contradiction'] }]));

  assert.throws(() => requireSyllabusCoverage([{
    unit: 'Proof Methods',
    label: 'Proof Strategies',
  }], [{ week: 4, topics: ['Proof by Contraposition & Contradiction'] }]), /omitted syllabus coverage/i);
});

test('omitted dense subtopics reconcile only within their syllabus week', () => {
  const nodes = [
    { unit: 'Set Notation & Operations', description: 'Apply operations to finite sets.' },
    { unit: 'Basic Counting Principles', description: 'Use sum and product rules.' },
  ];
  const coverage = [
    { week: 5, topics: ['Set Notation & Operations', 'Venn Diagrams', 'Cartesian Products'] },
    { week: 9, topics: ['Basic Counting Principles', 'Combinations'] },
  ];
  const reconciled = reconcileGroupedSyllabusCoverage(nodes, coverage);

  assert.match(String(reconciled[0]?.description), /Venn Diagrams; Cartesian Products/);
  assert.match(String(reconciled[1]?.description), /Combinations/);
  assert.doesNotThrow(() => requireSyllabusCoverage(reconciled, coverage));
  assert.equal(nodes[0]?.description, 'Apply operations to finite sets.');
});

test('an unrelated omission is never reconciled across syllabus weeks', () => {
  const coverage = [
    { week: 5, topics: ['Venn Diagrams'] },
    { week: 9, topics: ['Basic Counting Principles'] },
  ];
  const reconciled = reconcileGroupedSyllabusCoverage(
    [{ unit: 'Basic Counting Principles' }],
    coverage,
  );

  assert.throws(() => requireSyllabusCoverage(reconciled, coverage), /Venn Diagrams/i);
});

test('duplicate provider node ids fail before edge normalization', () => {
  assert.throws(
    () => requireUniqueParserNodeIds([{ id: 'logic' }, { id: 'logic' }]),
    /duplicate node ids/i,
  );
  assert.doesNotThrow(() => requireUniqueParserNodeIds([{ id: 'logic' }, { id: 'sets' }]));
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
  assert.equal(
    repairNodeTarget(
      { min: 20, max: 26 },
      20,
      'The graph omitted syllabus coverage: Sec. 2 Filters; Z-Transform.',
    ),
    22,
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
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /weeks as a coverage inventory, not an edge order/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /branch point directly unlocks at least 2/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /16 or more nodes need at least 2 of each/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /exactly four integer tiers/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /at most one course-wide synthesis/i);
  assert.match(SYLLABUS_GRAPH_SYSTEM_PROMPT, /repeated or merged table cell alone never justifies invented skills/i);
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
