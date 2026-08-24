import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { missionStates, type MissionState } from '@/features/skilltree/missions';
import { deriveStatuses } from '@/features/skilltree/progression';
import { fetchLiveTree } from '@/features/skilltree/queries';
import { rollUpProgress } from '@/features/skilltree/rollup';
import type { Mission } from '@/features/skilltree/types';
import { usePrefs } from '@/lib/prefs';
import { useLocalProgress } from '@/lib/progress';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { usePixelTransition } from '@/ui/PixelTransition';
import { PixelButton, PixelIcon, PixelText, bevelStyle } from '@/ui/pixel';

/**
 * Every piece of work on the chart, as one list.
 *
 * The chart answers "where am I"; this answers "what can I actually sit down and
 * do in the next hour". Completion happens here as well as on the chart —
 * refusing to let a student tick something off the list they are reading is a
 * rule that serves the code, not them.
 */
const FILTERS = ['open', 'all', 'done', 'locked'] as const;
type Filter = (typeof FILTERS)[number];

interface Row {
  mission: Mission;
  state: MissionState;
  nodeTitle: string;
}

export default function Missions() {
  const { transition } = usePixelTransition();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lastCourseId, lowBandwidth } = usePrefs();
  const [filter, setFilter] = useState<Filter>('open');

  const { data, isPending } = useQuery({
    queryKey: ['tree', lastCourseId],
    queryFn: () => fetchLiveTree(lastCourseId!),
    enabled: Boolean(lastCourseId),
  });

  const { log, missionLog, toggleMission } = useLocalProgress(lastCourseId ?? undefined);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];

    const rolled = rollUpProgress({
      tree: data.tree,
      missions: data.missions,
      completedMissionIds: [...data.completedMissionIds, ...Object.keys(missionLog)],
      directlyCompletedIds: Object.keys(log),
      serverMasteredIds: data.masteredIds,
      serverXp: data.xp,
    });
    const { status } = deriveStatuses(data.tree, rolled.masteredIds);

    return data.tree.nodes.flatMap((node) =>
      missionStates(
        data.missions,
        node.id,
        rolled.completedMissionIds,
        status.get(node.id) !== 'locked',
      ).map(({ mission, state }) => ({ mission, state, nodeTitle: node.title })),
    );
  }, [data, log, missionLog]);

  const shown = rows.filter((r) => (filter === 'all' ? true : r.state === filter));

  if (!lastCourseId) {
    return (
      <Shell insets={insets.top} flat={lowBandwidth}>
        <Window title="No missions yet">
          <PixelText variant="body" colour={t.ink}>
            Open a chart and its work shows up here.
          </PixelText>
          <PixelButton label="Open my charts" onPress={() => transition(() => router.navigate('/courses'))} />
        </Window>
      </Shell>
    );
  }

  if (isPending || !data) {
    return (
      <Shell insets={insets.top} flat={lowBandwidth}>
        <Window title="Reading missions" live={false}>
          <PixelText variant="body" colour={t.inkMuted}>
            00: COLLECTING WORK ITEMS
          </PixelText>
        </Window>
      </Shell>
    );
  }

  return (
    <Shell
      insets={insets.top}
      flat={lowBandwidth}
      title={`Missions · ${data.title}`}
      description={`Every piece of work on ${data.title}, as one list.`}
    >
      <PixelText variant="title">Missions</PixelText>

      <View style={styles.filters}>
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${f} missions`}
              style={({ pressed }) => [
                styles.filter,
                bevelStyle(t, active ? 'brand' : 'panel', pressed || active ? 'inset' : 'raised'),
              ]}
            >
              <PixelText variant="micro" colour={active ? t.ink : t.inkMuted}>
                {f.toUpperCase()}
              </PixelText>
            </Pressable>
          );
        })}
      </View>

      {shown.length === 0 ? (
        <Window title="Nothing here" live={false}>
          <PixelText variant="body" colour={t.ink}>
            {filter === 'open'
              ? 'No work is open right now. Clear a prerequisite on the chart to open more.'
              : 'Nothing matches this filter.'}
          </PixelText>
        </Window>
      ) : (
        shown.map(({ mission, state, nodeTitle }) => (
          <Pressable
            key={mission.id}
            disabled={state === 'locked'}
            onPress={() => toggleMission(mission.id, state !== 'done')}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state === 'done', disabled: state === 'locked' }}
            accessibilityLabel={`${mission.title}, part of ${nodeTitle}, ${mission.xpReward} XP`}
            style={({ pressed }) => [
              styles.row,
              bevelStyle(t, 'panel', pressed && state !== 'locked' ? 'inset' : 'raised'),
            ]}
          >
            <View style={[styles.box, { backgroundColor: t.well }]}>
              {state === 'done' ? (
                <PixelIcon name="check" size={14} colour={t.earnedText} />
              ) : state === 'locked' ? (
                <PixelIcon name="lock" size={12} colour={t.inkMuted} />
              ) : null}
            </View>

            <View style={styles.body}>
              <PixelText variant="body" colour={state === 'locked' ? t.inkMuted : t.ink}>
                {mission.title}
              </PixelText>
              <PixelText variant="micro" colour={t.inkMuted}>
                {nodeTitle.toUpperCase()}
                {mission.estimatedMinutes ? ` · ${mission.estimatedMinutes} MIN` : ''}
              </PixelText>
            </View>

            <PixelText variant="micro" colour={state === 'done' ? t.earnedText : t.inkMuted}>
              {mission.xpReward} XP
            </PixelText>
          </Pressable>
        ))
      )}
    </Shell>
  );
}

/**
 * The page metadata lives here rather than in the ready branch, because the
 * empty and loading states return before it — and a student who lands on this
 * URL with nothing open would otherwise get an untitled page.
 */
function Shell({
  insets,
  flat,
  title = 'Missions · Cardinal Skill',
  description = 'Every piece of work on your chart, as one list.',
  children,
}: {
  insets: number;
  flat: boolean;
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
      </Head>
      <DitherField variant="quiet" bands={7} flat={flat} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets + space.cell }]}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: space.md, gap: space.cell, maxWidth: 560, width: '100%', alignSelf: 'center' },
  filters: { flexDirection: 'row', gap: space.xs, marginBottom: space.xs },
  filter: {
    minHeight: touch,
    paddingHorizontal: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    minHeight: touch + space.cell,
    paddingHorizontal: space.cell,
  },
  box: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: space.hair },
});
