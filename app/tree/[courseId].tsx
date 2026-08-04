import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SkillTree } from '@/features/skilltree/SkillTree';
import { evaluateSkillUnlockState, levelForXp, levelProgress, totalXp } from '@/features/skilltree/progression';
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

  const eligibility = useMemo(() => {
    if (!selected || !data?.tree) return null;
    return evaluateSkillUnlockState(selected.id, data.tree, data.masteredIds);
  }, [selected, data]);

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

  const isMastered = selected ? masteredIds.includes(selected.id) : false;
  const statusLabel = isMastered ? 'Mastered' : eligibility?.isUnlocked ? 'Available' : 'Locked';

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

        {selected && eligibility ? (
          <View style={styles.sheet} accessibilityLiveRegion="polite">
            <View style={styles.sheetHeader}>
              <Text style={styles.eyebrow}>{statusLabel.toUpperCase()}</Text>
              <Text style={styles.meta}>{selected.xpReward} XP</Text>
            </View>
            <Text style={styles.title}>{selected.title}</Text>
            <Text style={styles.body}>{selected.description}</Text>

            {selected.learningObjective ? (
              <Text style={styles.objective}>Objective: {selected.learningObjective}</Text>
            ) : null}

            {!eligibility.isUnlocked && !isMastered ? (
              <View style={styles.lockBox}>
                <Text style={styles.lockText}>
                  {eligibility.blockedReason || 'Complete prerequisites to unlock.'}
                </Text>
                {eligibility.incompletePrerequisites.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.prereqItem}
                    onPress={() => {
                      const target = tree.nodes.find((n) => n.id === p.id);
                      if (target) setSelected(target);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`View prerequisite ${p.title}`}
                  >
                    <Text style={styles.prereqText}>• Prerequisite: {p.title} (Incomplete)</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
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
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { ...type.eyebrow, color: palette.cardinal },
  title: { ...type.title, color: palette.parchment },
  body: { ...type.body, color: palette.haze },
  meta: { ...type.eyebrow, color: palette.haze },
  objective: { ...type.caption, color: palette.brass, marginTop: space.xs },
  lockBox: {
    marginTop: space.sm,
    padding: space.sm,
    borderRadius: radius.card,
    backgroundColor: 'rgba(152, 30, 47, 0.15)',
    borderColor: palette.cardinal,
    borderWidth: 1,
    gap: space.xs,
  },
  lockText: { ...type.body, color: palette.parchment, fontSize: 13, fontWeight: '700' },
  prereqItem: { paddingVertical: space.xs },
  prereqText: { ...type.caption, color: palette.brass, fontWeight: '600' },
  error: { ...type.body, color: palette.danger, textAlign: 'center', padding: space.lg },
});
