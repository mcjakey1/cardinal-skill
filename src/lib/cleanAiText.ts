export type CompanionTextBlock =
  | { kind: 'heading' | 'equation' | 'paragraph' | 'subnote'; text: string }
  | { kind: 'list'; items: { marker: string | null; text: string }[] };

const SYMBOLS: readonly [RegExp, string][] = [
  [/\\geq\b/g, '≥'],
  [/\\leq\b/g, '≤'],
  [/\\neq\b/g, '≠'],
  [/\\times\b/g, '×'],
  [/\\(?:cdot|cdots|dots)\b/g, '...'],
  [/\\in\b/g, '∈'],
  [/\\forall\b/g, '∀'],
  [/\\exists\b/g, '∃'],
  [/\\(?:rightarrow|to)\b/g, '→'],
  [/\\Rightarrow\b/g, '⇒'],
  [/\\sum\b/g, '∑'],
  [/\\prod\b/g, '∏'],
  [/\\int\b/g, '∫'],
  [/\\pm\b/g, '±'],
  [/\\cup\b/g, '∪'],
  [/\\cap\b/g, '∩'],
  [/\\setminus\b/g, '∖'],
  [/\\subseteq\b/g, '⊆'],
  [/\\subset\b/g, '⊂'],
  [/\\emptyset\b/g, '∅'],
  [/\\land\b/g, '∧'],
  [/\\lor\b/g, '∨'],
  [/\\neg\b/g, '¬'],
  [/\\oplus\b/g, '⊕'],
];

const RETRO_RIGHT = '\uE000';
const RETRO_LEFT = '\uE001';
const RETRO_DOWN = '\uE002';
const RETRO_UP = '\uE003';
const RETRO_OK = '\uE004';
const RETRO_NO = '\uE005';
const RETRO_BULLET = '\uE006';

/** Defensive display cleanup for model output produced before prompt rules changed. */
export function sanitizeCompanionText(rawText: string): string {
  if (!rawText) return '';
  let text = rawText
    .replace(/[➡▶👉►]\uFE0F?/gu, RETRO_RIGHT)
    .replace(/[⬅◀👈]\uFE0F?/gu, RETRO_LEFT)
    .replace(/[⬇👇]\uFE0F?/gu, RETRO_DOWN)
    .replace(/[⬆👆]\uFE0F?/gu, RETRO_UP)
    .replace(/[💡⚡]\uFE0F?/gu, '*')
    .replace(/[⚠❗]\uFE0F?/gu, '!')
    .replace(/[✅✔✓]\uFE0F?/gu, RETRO_OK)
    .replace(/[❌✖]\uFE0F?/gu, RETRO_NO)
    .replace(/[📌🎯]\uFE0F?/gu, RETRO_BULLET)
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\uFE0F/g, '')
    .replaceAll(RETRO_RIGHT, '▸')
    .replaceAll(RETRO_LEFT, '◂')
    .replaceAll(RETRO_DOWN, '▾')
    .replaceAll(RETRO_UP, '▴')
    .replaceAll(RETRO_OK, '[✓]')
    .replaceAll(RETRO_NO, '[×]')
    .replaceAll(RETRO_BULLET, '•')
    .replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, '\n$1\n')
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\$\$\s*([\s\S]*?)\s*\$\$/g, '\n$1\n')
    .replace(/\$([^\n$]+)\$/g, '$1')
    .replace(/^#{1,4}\s+(.+)$/gm, (_match, title: string) => `${title.trim().replace(/:$/, '').toUpperCase()}:`)
    .replace(/^\s*-\s*\[[ xX]?\]\s*/gm, '• ')
    .replace(/\\(?:left|right)\b/g, '')
    .replace(/\\text\{([^{}]*)\}/g, '$1');

  for (const [pattern, replacement] of SYMBOLS) text = text.replace(pattern, replacement);
  text = text.replace(/\b([A-Za-z])\s+U\s+([A-Za-z])\b/g, '$1 ∪ $2');

  // Repeat because a provider can nest one simple fraction inside another.
  let previous = '';
  while (previous !== text) {
    previous = text;
    text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1 / $2)');
  }

  return formatMathExpressions(text)
    .replace(/\^\{2\}/g, '²')
    .replace(/\^\{3\}/g, '³')
    .replace(/_\{([^{}]+)\}/g, '₍$1₎')
    .replace(/\{([^{}]+)\}/g, '$1')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/^(\s*)▸\s*/gm, '$1▸ ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Converts common provider pseudo-math into readable Unicode notation. */
export function formatMathExpressions(text: string): string {
  if (!text) return '';
  return text
    .replace(
      /(?:\bsum|[∑Σ])_\{?\(?\s*([A-Za-z]\s*=\s*[A-Za-z0-9+\-]+)\s*\)?\}?\s*\^\{?\(?\s*([A-Za-z0-9+\-]+)\s*\)?\}?/g,
      (_match, lower: string, upper: string) => `∑(${compactMath(lower)} to ${compactMath(upper)}) `,
    )
    .replace(
      /(?:\bprod|∏)_\{?\(?\s*([A-Za-z]\s*=\s*[A-Za-z0-9+\-]+)\s*\)?\}?\s*\^\{?\(?\s*([A-Za-z0-9+\-]+)\s*\)?\}?/g,
      (_match, lower: string, upper: string) => `∏(${compactMath(lower)} to ${compactMath(upper)}) `,
    )
    .replace(/\^(?:\(|\{)k\s*\+\s*1(?:\)|\})/g, 'ᵏ⁺¹')
    .replace(/\^(?:\(|\{)n\s*\+\s*1(?:\)|\})/g, 'ⁿ⁺¹')
    .replace(/\^2\b/g, '²')
    .replace(/\^3\b/g, '³')
    .replace(/\^k\b/g, 'ᵏ')
    .replace(/\^n\b/g, 'ⁿ')
    .replace(/_(?:\(|\{)k\s*\+\s*1(?:\)|\})/g, 'ₖ₊₁')
    .replace(/_(?:\(|\{)n\s*\+\s*1(?:\)|\})/g, 'ₙ₊₁')
    .replace(/_k\b/g, 'ₖ')
    .replace(/_n\b/g, 'ₙ')
    .replace(/_0\b/g, '₀')
    .replace(/_1\b/g, '₁')
    .replace(/[ \t]*([+=])[ \t]*/g, ' $1 ')
    .replace(/[ \t]{2,}/g, ' ');
}

function compactMath(text: string): string {
  return text.replace(/\s+/g, '');
}

/** Converts clean text into the small set of blocks the terminal renderer owns. */
export function companionTextBlocks(rawText: string): CompanionTextBlock[] {
  const lines = sanitizeCompanionText(rawText).split('\n');
  const blocks: CompanionTextBlock[] = [];
  let paragraph: string[] = [];
  let listItems: { marker: string | null; text: string }[] = [];

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };
  const flushList = () => {
    if (listItems.length) blocks.push({ kind: 'list', items: listItems });
    listItems = [];
  };
  const pushEquation = (text: string) => {
    const previous = blocks[blocks.length - 1];
    if (previous?.kind === 'equation') previous.text += `\n${text}`;
    else blocks.push({ kind: 'equation', text });
  };

  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }
    const subnote = line.match(/^[▸→]\s*(.+)$/);
    if (subnote) {
      flushParagraph();
      flushList();
      blocks.push({ kind: 'subnote', text: subnote[1]!.trim() });
      continue;
    }
    const list = line.match(/^(?:[-•]\s+|(\d+)\.\s+)(.+)$/);
    if (list) {
      flushParagraph();
      listItems.push({ marker: list[1] ?? null, text: list[2]!.trim() });
      continue;
    }
    flushList();
    if (isHeading(line)) {
      flushParagraph();
      blocks.push({ kind: 'heading', text: line });
    } else if (isEquation(line)) {
      flushParagraph();
      pushEquation(line);
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function isHeading(line: string): boolean {
  return line.endsWith(':') && line === line.toUpperCase() && /[A-Z]/.test(line);
}

function isEquation(line: string): boolean {
  const operator = /[=≥≤≠→⇒∑∏∫]/.test(line);
  const expandedSeries = /^\[[^\]]+[+\-*/][^\]]+\](?:\s*[+\-*/].+)?$/.test(line);
  if (!operator && !expandedSeries) return false;
  const words = line.match(/[A-Za-z]{4,}/g) ?? [];
  return words.length <= 3 && /[0-9A-Za-z()[\]+\-*/²³ᵏⁿ₀₁ₖₙ∑∏∫]/.test(line);
}
