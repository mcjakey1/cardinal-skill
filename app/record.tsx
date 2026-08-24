import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { achievements, streakDays, type Achievement } from '@/features/skilltree/achievements';
import { learnerMode, paceTarget, personalXpPerLevel } from '@/features/skilltree/adaptive';
import { learnerSignals } from '@/features/skilltree/observed';
import { XP_PER_LEVEL, levelForXp, levelProgress, totalXp } from '@/features/skilltree/progression';
import { fetchLiveTree } from '@/features/skilltree/queries';
import { rollUpProgress } from '@/features/skilltree/rollup';
import { usePrefs } from '@/lib/prefs';
import { useLocalProgress } from '@/lib/progress';
import { useSignals } from '@/lib/signals';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Window } from '@/ui/Window';
import { usePixelTransition } from '@/ui/PixelTransition';
import { Bevel, Meter, PixelButton, PixelIcon, PixelText } from '@/ui/pixel';

/**
 * The record: what the student's effort has actually built.
 *
 * Every figure here is derived from the chart and the completion log at read
 * time. Nothing is stored, so nothing can drift out of agreement with what they
 * did — and no stamp pays XP, because two students doing identical work must end
 * up worth the same amount.
 */
export default function Record() {
  const { transition } = usePixelTransition();
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { lastCourseId, lowBandwidth } = usePrefs();
  const { log, missionLog } = useLocalProgress(lastCourseId ?? undefined);
  const { visits } = useSignals(lastCourseId ?? undefined);

  const { data, isPending } = useQuery({
    queryKey: ['tree', lastCourseId],
    queryFn: () => fetchLiveTree(lastCourseId!),
    enabled: Boolean(lastCourseId),
  });

  if (!lastCourseId) {
    return (
      <Shell insets={insets.top} flat={lowBandwidth}>
        <Window title="No record yet">
          <PixelText variant="body" colour={t.ink}>
            Open a chart and clear a node. What you finish is recorded here.
          </PixelText>
          <PixelButton label="Open my charts" onPress={() => transition(() => router.navigate('/courses'))} />
        </Window>
      </Shell>
    );
  }

  if (isPending || !data) {
    return (
      <Shell insets={insets.top} flat={lowBandwidth}>
        <Window title="Reading record" live={false}>
          <PixelText variant="body" colour={t.inkMuted}>
            00: COUNTING CLEARED NODES
          </PixelText>
        </Window>
      </Shell>
    );
  }

  const { masteredIds, xp } = rollUpProgress({
    tree: data.tree,
    missions: data.missions,
    completedMissionIds: [...data.completedMissionIds, ...Object.keys(missionLog)],
    directlyCompletedIds: Object.keys(log),
    serverMasteredIds: data.masteredIds,
    serverXp: data.xp,
  });
  const level = levelForXp(xp);
  const streak = streakDays([...Object.values(log), ...Object.values(missionLog)]);
  const stamps = achievements(data.tree, masteredIds, streak);
  const earned = stamps.filter((s) => s.earned).length;

  // Pacing, not assessment. Nothing below reads a grade or writes one, and none
  // of it changes the level shown above — it describes the stride, not the
  // ladder, because a level a student compares with a classmate has to mean the
  // same thing for both of them.
  const masteredAtById: Record<string, string> = {};
  for (const id of masteredIds) {
    const direct = log[id];
    if (direct) {
      masteredAtById[id] = direct;
      continue;
    }
    const times = data.missions
      .filter((m) => m.skillId === id)
      .map((m) => missionLog[m.id])
      .filter((at): at is string => Boolean(at))
      .sort();
    const last = times[times.length - 1];
    if (last) masteredAtById[id] = last;
  }

  const signals = learnerSignals(visits, masteredAtById, streak);
  const mode = learnerMode(data.tree, signals);
  const pace = paceTarget(signals);
  const stride = personalXpPerLevel(signals);

  return (
    <Shell
      insets={insets.top}
      flat={lowBandwidth}
      title={`Record · ${data.title}`}
      description={`Level ${level}, ${masteredIds.length} of ${data.tree.nodes.length} nodes cleared.`}
    >
      <PixelText variant="title">{data.title}</PixelText>

      <Bevel tone="panel" style={styles.readout}>
        <View style={styles.figureRow}>
          <Figure label="Level" value={String(level)} />
          <Figure label="XP" value={`${xp}/${totalXp(data.tree.nodes)}`} />
          <Figure label="Cleared" value={`${masteredIds.length}/${data.tree.nodes.length}`} />
          <Figure label="Streak" value={streak > 0 ? `${streak}d` : '—'} />
        </View>
        <Meter
          value={levelProgress(xp)}
          cells={20}
          label={`Level ${level}, ${Math.round(levelProgress(xp) * 100)} percent to the next level`}
        />
      </Bevel>

      <Bevel tone="panel" depth="inset" style={styles.pace}>
        <PixelText variant="micro" colour={t.inkMuted}>
          YOUR PACE
        </PixelText>
        <PixelText variant="body" colour={t.ink}>
          {MODE_COPY[mode]}
        </PixelText>
        <PixelText variant="body" colour={t.inkMuted}>
          About {pace} {pace === 1 ? 'node' : 'nodes'} a week.
          {stride === XP_PER_LEVEL
            ? ''
            : ` At that rate a level is ${stride} XP for you, against ${XP_PER_LEVEL} as standard.`}
        </PixelText>
      </Bevel>

      <View style={styles.stampsHeading}>
        <PixelText variant="title">Stamps</PixelText>
        <PixelText variant="micro" colour={t.inkMuted}>
          {earned} OF {stamps.length}
        </PixelText>
      </View>

      <View style={styles.stamps}>
        {stamps.map((s) => (
          <Stamp key={s.id} stamp={s} />
        ))}
      </View>
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
  title = 'Record · Cardinal Skill',
  description = 'What your effort on this course has actually built.',
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
      <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets + space.cell }]}>
        {children}
      </ScrollView>
    </View>
  );
}

/**
 * The learner mode as something a student would want said to them.
 *
 * Never "struggling". The engine's word for it is fine inside the engine, and it
 * is the wrong thing to put on a screen belonging to the person it describes.
 */
const MODE_COPY = {
  struggling: 'You are working through some hard material right now.',
  steady: 'You are moving at a steady pace.',
  fast: 'You are moving quickly and your streak is holding.',
} as const;

function Figure({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={styles.figure}>
      <PixelText variant="title" colour={t.ink}>
        {value}
      </PixelText>
      <PixelText variant="micro" colour={t.inkMuted}>
        {label.toUpperCase()}
      </PixelText>
    </View>
  );
}

function Stamp({ stamp }: { stamp: Achievement }) {
  const t = useTheme();
  return (
    <Bevel
      tone={stamp.earned ? 'earned' : 'panel'}
      depth={stamp.earned ? 'raised' : 'inset'}
      style={styles.stamp}
      accessible
      accessibilityLabel={`${stamp.title}. ${stamp.earned ? 'Earned' : 'Not earned'}. ${stamp.detail}`}
    >
      <View style={styles.stampHead}>
        <PixelIcon
          name={stamp.earned ? 'stamp' : 'lock'}
          size={16}
          colour={stamp.earned ? t.well : t.inkMuted}
        />
        <PixelText variant="label" colour={stamp.earned ? t.well : t.ink}>
          {stamp.title}
        </PixelText>
      </View>
      <PixelText variant="micro" colour={stamp.earned ? t.tone.earned.ink : t.inkMuted}>
        {stamp.detail}
      </PixelText>
      {stamp.earned ? null : (
        <Meter
          value={stamp.progress}
          cells={10}
          colour={t.brand}
          label={`${stamp.title}: ${Math.round(stamp.progress * 100)} percent`}
        />
      )}
    </Bevel>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { padding: space.md, gap: space.md, maxWidth: 560, width: '100%', alignSelf: 'center' },
  readout: { padding: space.md, gap: space.md },
  pace: { padding: space.md, gap: space.xs, marginTop: space.cell },
  figureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  figure: { minWidth: 72, gap: space.hair },
  stampsHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.cell,
  },
  stamps: { gap: space.cell },
  stamp: { padding: space.md, gap: space.cell },
  stampHead: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
});
