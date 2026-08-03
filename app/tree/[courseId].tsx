import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { levelForXp, levelProgress, totalXp } from '@/features/skilltree/progression';
import type { SkillNode, Tree } from '@/features/skilltree/types';
import { fetchTree } from '@/features/skilltree/queries';
import { palette, radius, space, type } from '@/theme/tokens';

export default function TreeScreen() {
  const { courseId } = useLocalSearchParams<{ courseId: string }>();
  const [selected, setSelected] = useState<SkillNode | null>(null);

  const { data, isPending, error } = useQuery({
    queryKey: ['tree', courseId],
    queryFn: () => fetchTree(courseId),
    enabled: Boolean(courseId),
  });

  if (isPending) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator color={palette.cardinal} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centred}>
        <Text style={styles.error}>Couldn&apos;t load this chart. Try again in a moment.</Text>
      </View>
    );
  }

  const { tree, masteredIds, xp }: { tree: Tree; masteredIds: string[]; xp: number } = data;
  const level = levelForXp(xp);

  return (
    <>
      <Stack.Screen options={{ title: 'Chart' }} />
      <View style={styles.screen}>
        <View style={styles.meter}>
          <Text style={styles.eyebrow}>LEVEL {level}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(levelProgress(xp) * 100)}%` }]} />
          </View>
          <Text style={styles.meta}>
            {xp} / {totalXp(tree.nodes)} XP
          </Text>
        </View>

        <SkillTree tree={tree} masteredIds={masteredIds} onSelectNode={setSelected} />

        {selected ? (
          <View style={styles.sheet} accessibilityLiveRegion="polite">
            <Text style={styles.eyebrow}>{selected.kind.toUpperCase()}</Text>
            <Text style={styles.title}>{selected.title}</Text>
            <Text style={styles.body}>{selected.description}</Text>
            <Text style={styles.meta}>{selected.xpReward} XP</Text>
          </View>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.ink },
  centred: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.ink },
  meter: { padding: space.md, gap: space.xs },
  track: { height: 4, borderRadius: radius.pill, backgroundColor: palette.slate, overflow: 'hidden' },
  fill: { height: 4, backgroundColor: palette.brass },
  sheet: {
    padding: space.lg,
    gap: space.xs,
    backgroundColor: palette.inkRaised,
    borderTopWidth: 1,
    borderTopColor: palette.slate,
  },
  eyebrow: { ...type.eyebrow, color: palette.cardinal },
  title: { ...type.title, color: palette.parchment },
  body: { ...type.body, color: palette.haze },
  meta: { ...type.eyebrow, color: palette.haze },
  error: { ...type.body, color: palette.danger, textAlign: 'center', padding: space.lg },
});
