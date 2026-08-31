import { StyleSheet, Text, View } from 'react-native';

import { companionTextBlocks } from '@/lib/cleanAiText';
import { parseInlineMarkdown } from '@/lib/inlineMarkdown';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelText } from './pixel';
import { EquationCallout } from './EquationCallout';

export function CompanionMessageView({ text }: { text: string }) {
  const t = useTheme();
  const blocks = companionTextBlocks(text);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          return (
            <PixelText key={index} variant="micro" colour={t.ink} style={styles.heading}>
              {block.text}
            </PixelText>
          );
        }
        if (block.kind === 'equation') {
          return <EquationCallout key={index} text={block.text} />;
        }
        if (block.kind === 'list') {
          return (
            <View key={index} style={styles.list}>
              {block.items.map((item, itemIndex) => (
                <View key={`${item.marker ?? 'bullet'}-${itemIndex}`} style={styles.listRow}>
                  {item.marker ? (
                    <InlineText text={`${item.marker}. ${item.text}`} tone="title" />
                  ) : (
                    <>
                      <View style={[styles.bullet, { backgroundColor: t.warning }]} />
                      <InlineText text={item.text} />
                    </>
                  )}
                </View>
              ))}
            </View>
          );
        }
        if (block.kind === 'subnote') {
          return (
            <View key={index} style={styles.subnote}>
              <PixelText variant="micro" colour={t.warning} style={styles.subnoteGlyph}>▸</PixelText>
              <InlineText text={block.text} tone="subnote" />
            </View>
          );
        }
        return <InlineText key={index} text={block.text} />;
      })}
    </View>
  );
}

function InlineText({ text, tone = 'body' }: {
  text: string;
  tone?: 'body' | 'title' | 'subnote';
}) {
  const t = useTheme();
  const colour = tone === 'title' ? t.warning : tone === 'subnote' ? t.inkMuted : t.ink;
  return (
    <PixelText
      variant="body"
      colour={colour}
      style={[styles.body, tone === 'title' ? styles.itemTitle : null, tone === 'subnote' ? styles.subnoteText : null]}
    >
      {parseInlineMarkdown(text).map((token, index) => {
        if (token.kind === 'text') return token.text;
        return (
          <Text
            key={`${token.kind}-${index}`}
            style={token.kind === 'code'
              ? [styles.code, { backgroundColor: t.well, color: t.earnedText }]
              : styles.emphasis}
          >
            {token.text}
          </Text>
        );
      })}
    </PixelText>
  );
}

const styles = StyleSheet.create({
  blocks: { gap: space.cell },
  heading: { marginTop: space.xs, marginBottom: space.cell, fontSize: 11, lineHeight: 18, fontWeight: '700' },
  list: { gap: space.xs },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.cell },
  bullet: { width: space.cell, height: space.cell, marginTop: space.cell },
  body: { flex: 1, fontSize: 12, lineHeight: 18 },
  itemTitle: { fontSize: 13, lineHeight: 18, fontWeight: '700' },
  subnote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.xs,
    marginLeft: space.cell + space.xs,
    marginTop: space.xs,
    marginBottom: space.cell,
  },
  subnoteGlyph: { width: space.md, fontSize: 12, lineHeight: 18 },
  subnoteText: { fontSize: 11, lineHeight: 18 },
  emphasis: { fontWeight: '700' },
  code: { paddingHorizontal: space.hair },
});
