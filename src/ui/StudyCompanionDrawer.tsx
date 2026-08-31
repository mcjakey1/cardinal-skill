import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { Mission, SkillNode } from '@/features/skilltree/types';
import { DEMO_COURSE_ID } from '@/features/skilltree/demoTree';
import { demoCompanionAnswer } from '@/features/skilltree/demoCompanion';
import { callEdgeFunction } from '@/lib/edgeFunctions';
import { KEYBOARD_BEHAVIOR } from '@/ui/keyboard';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Window } from './Window';
import { PixelButton, PixelInput, PixelText } from './pixel';
import { CompanionMessageView } from './CompanionMessageView';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
}

interface CompanionResponse {
  answer: string;
  model?: string;
}

interface CompanionStatusResponse {
  status: 'online';
  model?: string;
}

type ModelStatus = 'checking' | 'online' | 'generating' | 'offline';

interface Props {
  visible: boolean;
  onClose: () => void;
  courseId: string;
  courseTitle: string;
  node: SkillNode;
  missions: readonly Mission[];
  prerequisites: readonly SkillNode[];
  reduceMotion?: boolean;
  initialPrompt?: { key: number; text: string } | null;
}

export function StudyCompanionDrawer({
  visible,
  onClose,
  courseId,
  courseTitle,
  node,
  missions,
  prerequisites,
  reduceMotion,
  initialPrompt,
}: Props) {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const wide = width >= 900;
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>('checking');
  const nextId = useRef(0);
  const handledInitialPrompt = useRef<number | null>(null);
  const hidden = useSharedValue(visible ? 0 : 1);

  useEffect(() => {
    hidden.value = withTiming(visible ? 0 : 1, {
      duration: reduceMotion ? 0 : 250,
      easing: Easing.inOut(Easing.cubic),
    });
  }, [hidden, reduceMotion, visible]);

  useEffect(() => {
    if (!visible) return;
    if (courseId === DEMO_COURSE_ID) {
      setModelStatus('online');
      setError(null);
      return;
    }
    let live = true;
    const checkModel = async () => {
      setModelStatus('checking');
      setError(null);
      try {
        const data = await callEdgeFunction<CompanionStatusResponse>(
          'study-companion',
          { action: 'status' },
          12_000,
        );
        if (data.status !== 'online') throw new Error('Offline.');
        if (live) {
          setModelStatus('online');
        }
      } catch (cause) {
        if (live) {
          setModelStatus('offline');
          setError(cause instanceof Error
            ? cause.message
            : 'The b.ai provider health check failed. Try again.');
        }
      }
    };
    void checkModel();
    return () => { live = false; };
  }, [courseId, visible]);

  const drawerMotion = useAnimatedStyle(() => ({
    opacity: 1 - hidden.value,
    transform: [
      wide
        ? { translateX: hidden.value * Math.min(520, width) }
        : { translateY: hidden.value * Math.min(680, height) },
    ],
  }), [height, wide, width]);

  const send = useCallback(async (prompt?: string) => {
    const text = (prompt ?? draft).trim();
    if (!text || busy) return;
    const user: Message = { id: nextId.current++, role: 'user', text };
    setMessages((current) => [...current, user]);
    setDraft('');
    setBusy(true);
    setError(null);
    setModelStatus('generating');

    if (courseId === DEMO_COURSE_ID) {
      setModelStatus('online');
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: 'assistant', text: demoCompanionAnswer(node.title, text) },
      ]);
      setBusy(false);
      return;
    }

    try {
      const data = await callEdgeFunction<CompanionResponse>('study-companion', {
        courseId,
        nodeId: node.id,
        course: courseTitle,
        node_title: node.title,
        node_description: node.description,
        syllabus_skill: node.moduleName ?? node.title,
        universal_skill: node.universalSkill,
        learning_objectives: node.learningObjectives
          ?? (node.learningObjective ? [node.learningObjective] : []),
        user_prompt: text,
        missions: missions.map((mission) => ({ title: mission.title, description: mission.description })),
        prerequisites: prerequisites.map((prerequisite) => prerequisite.title),
      });

      if (typeof data.answer !== 'string' || !data.answer.trim()) {
        throw new Error('The companion returned an empty answer. Try again.');
      }
      setModelStatus('online');
      setMessages((current) => [
        ...current,
        { id: nextId.current++, role: 'assistant', text: data.answer.trim() },
      ]);
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : 'The study companion could not be reached. Check your connection and try again.';
      setError(message);
      setModelStatus('offline');
      setDraft(text);
    } finally {
      setBusy(false);
    }
  }, [busy, courseId, courseTitle, draft, missions, node, prerequisites]);

  useEffect(() => {
    if (!visible) {
      handledInitialPrompt.current = null;
      return;
    }
    if (!initialPrompt || handledInitialPrompt.current === initialPrompt.key) return;
    handledInitialPrompt.current = initialPrompt.key;
    void send(initialPrompt.text);
  }, [initialPrompt, send, visible]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      style={[
        styles.panel,
        wide ? styles.panelWide : styles.panelNarrow,
        { backgroundColor: t.ground },
        drawerMotion,
      ]}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={KEYBOARD_BEHAVIOR}
      >
        <Window
          title="AI study companion"
          onClose={onClose}
          style={styles.drawer}
          bodyStyle={styles.drawerBody}
        >
          <ModelStatusPill status={modelStatus} reduceMotion={Boolean(reduceMotion)} />
          <PixelText variant="micro" colour={t.inkMuted}>
            CONTEXT · {courseTitle.toUpperCase()} · {node.title.toUpperCase()}
          </PixelText>
          <ScrollView style={styles.messages} contentContainerStyle={styles.messageContent}>
            {messages.length === 0 ? (
              <PixelText variant="body" colour={t.inkMuted}>
                Ask for an explanation, a worked example, or a short study plan. The current node and its syllabus context are included.
              </PixelText>
            ) : null}
            {messages.map((message) => (
              <Animated.View
                key={message.id}
                entering={reduceMotion ? undefined : FadeInUp.duration(180)}
                style={[
                  styles.message,
                  {
                    backgroundColor: message.role === 'user' ? t.brand : t.panel,
                    borderColor: message.role === 'user' ? t.brand : t.line,
                  },
                ]}
              >
                <PixelText variant="micro" colour={t.inkMuted}>
                  {message.role === 'user' ? 'YOU' : 'COMPANION'}
                </PixelText>
                <CompanionMessageView text={message.text} />
              </Animated.View>
            ))}
            {busy ? <TypingBubble reduceMotion={Boolean(reduceMotion)} /> : null}
          </ScrollView>
          {error ? (
            <View accessibilityRole="alert" style={[styles.errorNotice, { borderColor: t.alarm }]}>
              <PixelText variant="micro" colour={t.alarm}>LIVE API ERROR</PixelText>
              <PixelText variant="body" colour={t.ink}>{error}</PixelText>
            </View>
          ) : null}
          <PixelInput
            label="Question"
            value={draft}
            onChangeText={setDraft}
            multiline
            scrollEnabled
            style={styles.questionInput}
            placeholder={`Ask about ${node.title}`}
          />
          <PixelButton
            label={busy ? 'Thinking…' : 'Ask companion ▸'}
            disabled={busy || !draft.trim()}
            onPress={() => void send()}
          />
        </Window>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

function ModelStatusPill({ status, reduceMotion }: {
  status: ModelStatus;
  reduceMotion: boolean;
}) {
  const t = useTheme();
  const pulse = useSharedValue(1);
  const active = status === 'online';
  useEffect(() => {
    cancelAnimation(pulse);
    if (!active || reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.35, { duration: 1200 }), -1, true);
    return () => cancelAnimation(pulse);
  }, [active, pulse, reduceMotion]);
  const dotMotion = useAnimatedStyle(() => ({ opacity: pulse.value }));
  const colour = status === 'online' ? t.success : status === 'offline' ? t.alarm : t.warning;
  const label = status === 'online'
    ? 'AGENT CONNECTED'
    : status === 'generating'
      ? 'GENERATING…'
      : status === 'offline'
        ? 'API ERROR'
        : 'CHECKING API…';
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.modelStatus, { borderColor: colour }]}
    >
      <Animated.View style={[styles.statusDot, { backgroundColor: colour }, dotMotion]} />
      <PixelText variant="micro" colour={colour}>{label}</PixelText>
    </View>
  );
}

function TypingBubble({ reduceMotion }: { reduceMotion: boolean }) {
  const t = useTheme();
  const phase = useSharedValue(0);
  useEffect(() => {
    cancelAnimation(phase);
    if (reduceMotion) return;
    phase.value = withRepeat(withTiming(Math.PI * 2, { duration: 900, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(phase);
  }, [phase, reduceMotion]);
  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeInUp.duration(180)}
      accessibilityRole="progressbar"
      accessibilityLabel="Companion is generating guidance"
      style={[styles.typingBubble, { backgroundColor: t.panel, borderColor: t.warning }]}
    >
      {[0, 1, 2].map((index) => <TypingDot key={index} index={index} phase={phase} colour={t.warning} reduceMotion={reduceMotion} />)}
    </Animated.View>
  );
}

function TypingDot({ index, phase, colour, reduceMotion }: {
  index: number;
  phase: import('react-native-reanimated').SharedValue<number>;
  colour: string;
  reduceMotion: boolean;
}) {
  const motion = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1, transform: [{ translateY: 0 }] };
    const wave = (Math.sin(phase.value - index * 1.4) + 1) / 2;
    return { opacity: 0.35 + wave * 0.65, transform: [{ translateY: -wave * 4 }] };
  }, [index, reduceMotion]);
  return <Animated.View style={[styles.typingDot, { backgroundColor: colour }, motion]} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  panel: { position: 'absolute', zIndex: 60 },
  panelWide: { right: 0, top: 0, bottom: 0, width: 520 },
  panelNarrow: { left: 0, right: 0, bottom: 0, height: '78%' },
  drawer: { width: '100%', height: '100%', borderWidth: bevel },
  drawerBody: { flex: 1, minHeight: 0 },
  modelStatus: {
    minHeight: 28,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.cell,
  },
  statusDot: { width: 8, height: 8 },
  messages: { flex: 1, minHeight: 0 },
  messageContent: { gap: space.cell, paddingBottom: space.cell },
  message: { borderWidth: bevel, padding: space.cell, gap: space.xs },
  typingBubble: {
    width: 64,
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: bevel,
  },
  typingDot: { width: 6, height: 6 },
  errorNotice: { borderWidth: bevel, padding: space.cell, gap: space.xs },
  questionInput: { minHeight: 48, maxHeight: 72 },
});
