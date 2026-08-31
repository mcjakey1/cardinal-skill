interface DemoGuidance {
  explanation: string;
  example: string;
  questions: readonly [string, string, string];
}

const guidanceByTitle: Record<string, DemoGuidance> = {
  'logic foundations': {
    explanation: 'A proposition is a statement that is either true or false. Logical operators combine or modify propositions: NOT reverses a truth value, AND requires both parts to be true, OR requires at least one part to be true, and IF–THEN is false only when its first part is true and its second part is false.',
    example: 'Let p mean “I submitted the assignment” and q mean “I received credit.” The statement p → q means “If I submitted the assignment, then I received credit.” It is false only when p is true and q is false.',
    questions: ['Which sentences count as propositions?', 'When is p → q false?', 'How would you write “I studied and I passed” using symbols?'],
  },
  'truth tables': {
    explanation: 'A truth table checks every possible combination of truth values. Add one column for each simple proposition, then evaluate the expression from its innermost operation outward.',
    example: 'For p ∧ q, the four input pairs are TT, TF, FT, and FF. Only TT makes the conjunction true.',
    questions: ['How many rows are needed for two propositions?', 'Which row makes p ∧ q true?', 'What would show that two expressions are equivalent?'],
  },
  'set operations': {
    explanation: 'Union collects elements found in either set. Intersection keeps elements shared by both sets. A complement keeps elements in the universal set that are not in the named set.',
    example: 'If A = {1, 2} and B = {2, 3}, then A ∪ B = {1, 2, 3} and A ∩ B = {2}.',
    questions: ['What is A ∪ B?', 'What is A ∩ B?', 'Why must a complement name or imply a universal set?'],
  },
  'direct & contrapositive proofs': {
    explanation: 'A direct proof starts with the hypothesis and uses definitions and known facts to reach the conclusion. A contrapositive proof instead proves “not Q implies not P,” which is logically equivalent to “P implies Q.”',
    example: 'To prove that the square of an even integer is even, write n = 2m. Then n² = (2m)² = 4m² = 2(2m²), so n² is twice an integer.',
    questions: ['What definition should begin a proof that n is even?', 'Why is 2m² an integer?', 'When might the contrapositive be easier than a direct proof?'],
  },
};

const fallbackGuidance = (nodeTitle: string): DemoGuidance => ({
  explanation: `${nodeTitle} is best learned by identifying the objects involved, writing the relevant definition, and checking each inference against that definition.`,
  example: `Take one small case from ${nodeTitle}, label every part, and work through one operation at a time before generalizing.`,
  questions: [`What is the main definition used in ${nodeTitle}?`, 'Which step needs justification?', 'Can you test the idea with a smaller example?'],
});

/** Deterministic, node-aware companion copy for the bundled demo course. */
export function demoCompanionAnswer(nodeTitle: string, prompt: string): string {
  const guidance = guidanceByTitle[nodeTitle.toLocaleLowerCase()] ?? fallbackGuidance(nodeTitle);

  if (/quiz|practice|check/i.test(prompt)) {
    return `QUICK SELF-CHECK:\n1. ${guidance.questions[0]}\n2. ${guidance.questions[1]}\n3. ${guidance.questions[2]}\n\n▸ Answer one at a time and explain your reasoning.`;
  }

  if (/hint|without (?:revealing|solving)/i.test(prompt)) {
    return `HINT: ${guidance.explanation}\n\n▸ Start by writing the relevant definition. Then use it on the smallest part of the mission before continuing.`;
  }

  return `${nodeTitle.toUpperCase()}:\n${guidance.explanation}\n\nSHORT EXAMPLE:\n${guidance.example}\n\n▸ Check that every symbol in the example has a stated meaning.`;
}
