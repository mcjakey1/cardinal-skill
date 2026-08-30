export type InlineMarkdownKind = 'text' | 'strong' | 'emphasis' | 'code';

export interface InlineMarkdownToken {
  kind: InlineMarkdownKind;
  text: string;
}

const DELIMITERS = [
  { marker: '**', kind: 'strong' },
  { marker: '__', kind: 'strong' },
  { marker: '`', kind: 'code' },
  { marker: '*', kind: 'emphasis' },
  { marker: '_', kind: 'emphasis' },
] as const;

/**
 * Parses the small inline Markdown subset used by model responses. Keeping this
 * pure makes the same behavior available to React Native and the web renderer.
 */
export function parseInlineMarkdown(source: string): InlineMarkdownToken[] {
  const tokens: InlineMarkdownToken[] = [];
  let plain = '';
  let cursor = 0;

  const flushPlain = () => {
    if (!plain) return;
    tokens.push({ kind: 'text', text: plain });
    plain = '';
  };

  while (cursor < source.length) {
    if (source[cursor] === '\\' && isEscapable(source[cursor + 1])) {
      plain += source[cursor + 1];
      cursor += 2;
      continue;
    }

    const delimiter = DELIMITERS.find(({ marker }) => source.startsWith(marker, cursor));
    if (!delimiter) {
      plain += source[cursor];
      cursor += 1;
      continue;
    }

    const contentStart = cursor + delimiter.marker.length;
    const contentEnd = source.indexOf(delimiter.marker, contentStart);
    if (contentEnd <= contentStart) {
      plain += delimiter.marker;
      cursor += delimiter.marker.length;
      continue;
    }

    flushPlain();
    tokens.push({
      kind: delimiter.kind,
      text: source.slice(contentStart, contentEnd),
    });
    cursor = contentEnd + delimiter.marker.length;
  }

  flushPlain();
  return tokens;
}

function isEscapable(character: string | undefined): boolean {
  return character === '*' || character === '_' || character === '`' || character === '\\';
}
