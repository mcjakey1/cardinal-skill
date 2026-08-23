import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { missionsForNode } from '@/features/skilltree/missions';
import { resolveQuestName, type ResolvedName } from '@/features/skilltree/naming';
import { fetchTree } from '@/features/skilltree/queries';
import type { SkillNode } from '@/features/skilltree/types';
import { usePrefs } from '@/lib/prefs';
import { useQuestNames } from '@/lib/questNames';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { DitherField } from '@/ui/Dither';
import { Bevel, PixelButton, PixelInput, PixelText } from '@/ui/pixel';

/**
 * The companion: a chat surface that is honest about not being one.
 *
 * There is no model behind this screen. Wiring a real one is out of scope for
 * this package, and the API key could not live here even if it were in scope —
 * `BAI_API_KEY` never reaches the client (see AGENTS.md → Secrets never
 * reach the client). Every reply is picked from a fixed set, so the one thing
 * this screen cannot afford to get wrong is pretending otherwise: the prototype
 * banner is not a footnote, and no reply below claims to know anything about the
 * student, their course, or the node beyond what was actually fetched for the
 * context bar.
 *
 * Opens with a node when the chart links here, and with nothing when Settings
 * does. Both are working states, not an error — the context bar just says
 * which one it got.
 */

interface Message {
  id: string;
  from: 'you' | 'companion';
  text: string;
}

interface Prompt {
  label: string;
  reply: string;
}

// Every typed message gets the same honest reply. Matching keywords to fake
// understanding is the academic-integrity guardrail this package was told not
// to bring back — it read as protection and a rephrase walked straight through
// it. Saying plainly that nothing is read is the version that is actually true.
const FALLBACK_REPLY =
  "This is a prototype: replies are canned and nothing you type is read. Try one of the prompts above, or look at the node's own description and missions on the chart.";

const CONTEXT_COPY: Record<'none' | 'loading' | 'missing' | 'found', string> = {
  none: "Opened with no node, so there's nothing to ask about specifically. Open this chat from a node on the chart, or ask about the app in general below.",
  loading: 'Reading the node you opened this from…',
  missing: "Couldn't find that node. Ask about the app in general below, or reopen this chat from the chart.",
  // Unused: the 'found' state renders the resolved name instead of this copy.
  found: '',
};

/**
 * The only branching in this file: which fixed set of prompts to show. Every
 * reply is either data already fetched for the context bar — so this is not a
 * new claim about the node — or a plain statement of what the prototype cannot
 * do. Never a generated question, and never a fact this screen was not given.
 */
function buildPrompts(node: SkillNode | undefined, name: ResolvedName | null, missionCount: number): Prompt[] {
  if (!node || !name) {
    return [
      {
        label: 'What is this screen?',
        reply:
          'A prototype chat. Every reply is canned — nothing you type is read or sent anywhere. Open this chat from a node on the chart to ask about that node specifically.',
      },
      {
        label: 'Where do I find real help?',
        reply:
          "Not here yet — this is a prototype. The chart, a node's own description, and its missions are the real content in this app.",
      },
    ];
  }

  const description = node.description.trim();

  return [
    {
      label: 'What is this node about?',
      reply: description
        ? `Straight from the chart: "${description}"`
        : `${name.text} doesn't have a description on the chart yet.`,
    },
    {
      label: 'How much work is on this node?',
      reply:
        missionCount > 0
          ? `${name.text} has ${missionCount} mission${missionCount === 1 ? '' : 's'} attached. Open Missions to see them.`
          : `${name.text} has no missions logged yet.`,
    },
    {
      label: 'What should I do next?',
      reply: "This prototype can't read your progress. Open the chart to see what it's unlocked for you.",
    },
    {
      label: "I'm stuck",
      reply:
        "This prototype can't actually help yet. Reread the node's description on the chart, or check its missions for the concrete next step.",
    },
  ];
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function Companion() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { lowBandwidth, motionOff } = usePrefs();
  const { courseId, nodeId } = useLocalSearchParams<{ courseId?: string; nodeId?: string }>();
  const hasParams = Boolean(courseId && nodeId);

  const { data, isPending } = useQuery({
    queryKey: ['tree', courseId],
    queryFn: () => fetchTree(courseId!),
    enabled: Boolean(courseId),
  });
  const { overrides } = useQuestNames(courseId);

  const node = data?.tree.nodes.find((n) => n.id === nodeId);
  const name = node ? resolveQuestName(node, overrides[node.id]) : null;
  const missionCount = node && data ? missionsForNode(data.missions, node.id).length : 0;

  const contextState: 'none' | 'loading' | 'missing' | 'found' = !hasParams
    ? 'none'
    : isPending
      ? 'loading'
      : node
        ? 'found'
        : 'missing';

  const prompts = useMemo(() => buildPrompts(node, name, missionCount), [node, name, missionCount]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const nextId = useRef(0);
  const scrollRef = useRef<ScrollView>(null);

  const send = (userText: string, reply: string) => {
    const trimmed = userText.trim();
    if (!trimmed) return;
    nextId.current += 1;
    const question: Message = { id: `m${nextId.current}`, from: 'you', text: trimmed };
    nextId.current += 1;
    const answer: Message = { id: `m${nextId.current}`, from: 'companion', text: reply };
    setMessages((prev) => [...prev, question, answer]);
    setDraft('');
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.ground }]}>
      <DitherField variant="quiet" bands={7} flat={lowBandwidth} />
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: !motionOff })}
          contentContainerStyle={[styles.body, { paddingTop: insets.top + space.cell }]}
        >
          <Head>
            <title>Companion · Cardinal Skill</title>
            {/* The description says "prototype" too. A shared link should not
                promise a working study assistant. */}
            <meta
              name="description"
              content="A prototype study companion. Its replies are canned and nothing you type is read."
            />
          </Head>

          <PixelText variant="title">Companion</PixelText>

          <Bevel tone="panel" style={styles.context}>
            <PixelText variant="micro" colour={t.inkMuted}>
              {contextState === 'found' ? 'ASKING ABOUT' : 'CONTEXT'}
            </PixelText>
            {contextState === 'found' && node && name && data ? (
              <>
                <PixelText variant="body" colour={t.ink}>
                  {name.text}
                </PixelText>
                <PixelText variant="micro" colour={t.inkMuted}>
                  {data.title} · {capitalise(node.kind)}
                </PixelText>
              </>
            ) : (
              <PixelText variant="body" colour={t.ink}>
                {CONTEXT_COPY[contextState]}
              </PixelText>
            )}
          </Bevel>

          <Bevel tone="ink" depth="inset" style={styles.disclosure}>
            <PixelText variant="micro" colour={t.inkMuted}>
              PROTOTYPE
            </PixelText>
            <PixelText variant="body" colour={t.ink}>
              Every reply below is canned, not generated. Nothing you type is read, saved, or sent anywhere.
            </PixelText>
          </Bevel>

          <View style={styles.prompts}>
            {prompts.map((p) => (
              <PixelButton
                key={p.label}
                label={p.label}
                tone="panel"
                grow={false}
                onPress={() => send(p.label, p.reply)}
              />
            ))}
          </View>

          <View style={styles.log} accessibilityLiveRegion="polite">
            {messages.length === 0 ? (
              <PixelText variant="body" colour={t.inkMuted}>
                Tap a prompt above or type your own message below. Every reply is canned.
              </PixelText>
            ) : (
              messages.map((m) => <MessageRow key={m.id} message={m} />)
            )}
          </View>

          <View style={styles.composer}>
            <View style={styles.composerInput}>
              <PixelInput
                label="Message"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={() => send(draft, FALLBACK_REPLY)}
                returnKeyType="send"
                placeholder="Type a message"
              />
            </View>
            <PixelButton
              label="Send"
              grow={false}
              disabled={!draft.trim()}
              onPress={() => send(draft, FALLBACK_REPLY)}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function MessageRow({ message }: { message: Message }) {
  const t = useTheme();
  const fromYou = message.from === 'you';
  return (
    <View style={[styles.messageRow, { alignItems: fromYou ? 'flex-end' : 'flex-start' }]}>
      <Bevel
        tone={fromYou ? 'brand' : 'panel'}
        depth="inset"
        style={styles.messageBubble}
        accessible
        accessibilityLabel={`${fromYou ? 'You' : 'Companion, canned reply'}: ${message.text}`}
      >
        <PixelText variant="micro" colour={fromYou ? t.tone.brand.ink : t.inkMuted}>
          {fromYou ? 'YOU' : 'CANNED REPLY'}
        </PixelText>
        <PixelText variant="body" colour={fromYou ? t.tone.brand.ink : t.ink}>
          {message.text}
        </PixelText>
      </Bevel>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  body: {
    padding: space.md,
    gap: space.md,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: space.xxl,
  },
  context: { padding: space.md, gap: space.hair },
  disclosure: { padding: space.md, gap: space.hair },
  prompts: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  log: { gap: space.cell },
  messageRow: { gap: space.hair },
  messageBubble: { padding: space.cell, maxWidth: '85%', gap: space.hair },
  composer: { flexDirection: 'row', gap: space.cell, alignItems: 'flex-end' },
  composerInput: { flex: 1 },
});
