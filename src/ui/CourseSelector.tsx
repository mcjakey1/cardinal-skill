import { useEffect, useState, type ComponentProps, type ComponentType } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelButton, PixelIcon, PixelInput, PixelText, bevelStyle } from './pixel';

type PendingAction =
  | { kind: 'edit'; course: CourseOption }
  | { kind: 'reset'; course: CourseOption }
  | { kind: 'delete'; course: CourseOption }
  | null;

interface Props {
  open: boolean;
  currentCourseId: string;
  currentTitle: string;
  courses: readonly CourseOption[];
  reduceMotion: boolean;
  onToggle: () => void;
  onSelect: (courseId: string) => void;
  onUpdate: (courseId: string, metadata: CourseMetadata) => Promise<void>;
  onReset: (courseId: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
}

/** Course switching and course-level management share one anchored pixel rail. */
export function CourseSelector({
  open,
  currentCourseId,
  currentTitle,
  courses,
  reduceMotion,
  onToggle,
  onSelect,
  onUpdate,
  onReset,
  onDelete,
}: Props) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const { width: viewportWidth } = useWindowDimensions();
  const compact = viewportWidth < 640;
  const menuWidth = Math.min(620, viewportWidth - space.md * 2);
  const progress = useSharedValue(open ? 1 : 0);
  const [pending, setPending] = useState<PendingAction>(null);
  const rowHeight = touch + space.xs;
  const menuHeight = Math.min(460, courses.length * rowHeight + space.md);

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: reduceMotion ? 0 : 250,
      easing: Easing.inOut(Easing.cubic),
    });
    if (!open) setPending(null);
  }, [open, progress, reduceMotion]);

  const menuMotion = useAnimatedStyle(() => ({
    height: progress.value * menuHeight,
    opacity: progress.value,
    borderWidth: progress.value * bevel,
  }), [menuHeight]);

  return (
    <View style={styles.anchor}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`Course selector. Current course: ${currentTitle}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
        ]}
      >
        <PixelText variant="title" numberOfLines={1} style={styles.triggerTitle}>
          {currentTitle}
        </PixelText>
        <PixelText variant="micro" colour={t.info}>{open ? 'CLOSE' : 'SWITCH'}</PixelText>
      </Pressable>

      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
        style={[
          styles.menu,
          { width: menuWidth, backgroundColor: theme.hudBackground, borderColor: theme.border },
          menuMotion,
        ]}
      >
        <ScrollView contentContainerStyle={styles.menuContent} nestedScrollEnabled>
          {courses.map((course) => (
            <View key={course.id} style={styles.courseRow}>
              <TitledPressable
                title={`Open ${course.title}`}
                onPress={() => onSelect(course.id)}
                accessibilityRole="menuitem"
                accessibilityLabel={`Open ${course.title}`}
                style={({ pressed }) => [styles.courseIdentity, pressed ? styles.pressed : null]}
              >
                <PixelText
                  variant="body"
                  colour={course.id === currentCourseId ? t.info : t.ink}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {course.courseCode ? `${course.courseCode} · ${course.title}` : course.title}
                </PixelText>
                {course.term ? (
                  <PixelText variant="micro" colour={t.inkMuted} numberOfLines={1}>
                    {course.term.toUpperCase()}
                  </PixelText>
                ) : null}
              </TitledPressable>
              <CourseAction
                icon="edit"
                text="EDIT"
                colour={t.info}
                compact={compact}
                disabled={!course.canEdit}
                label={`Edit course details for ${course.title}`}
                onPress={() => setPending({ kind: 'edit', course })}
              />
              <CourseAction
                icon="undo"
                text="RESET"
                colour={t.warning}
                compact={compact}
                label={`Reset progress for ${course.title}`}
                onPress={() => setPending({ kind: 'reset', course })}
              />
              <CourseAction
                icon="trash"
                text="DELETE"
                colour={t.alarm}
                compact={compact}
                disabled={!course.canDelete}
                label={`Delete ${course.title}`}
                onPress={() => setPending({ kind: 'delete', course })}
              />
            </View>
          ))}
        </ScrollView>
      </Animated.View>

      <CourseActionModal
        action={pending}
        reduceMotion={reduceMotion}
        onClose={() => setPending(null)}
        onUpdate={onUpdate}
        onReset={onReset}
        onDelete={onDelete}
      />
    </View>
  );
}

const TitledPressable = Pressable as ComponentType<ComponentProps<typeof Pressable> & { title?: string }>;

function CourseAction({ icon, text, colour, compact, disabled = false, label, onPress }: {
  icon: 'edit' | 'undo' | 'trash';
  text: string;
  colour: string;
  compact: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <TitledPressable
      title={label}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.action,
        compact ? styles.actionCompact : null,
        bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
        disabled ? styles.disabled : null,
      ]}
    >
      <PixelIcon name={icon} size={12} colour={disabled ? t.inkMuted : colour} />
      {compact ? null : (
        <PixelText variant="micro" colour={disabled ? t.inkMuted : colour}>{text}</PixelText>
      )}
    </TitledPressable>
  );
}

function CourseActionModal({ action, reduceMotion, onClose, onUpdate, onReset, onDelete }: {
  action: PendingAction;
  reduceMotion: boolean;
  onClose: () => void;
  onUpdate: (courseId: string, metadata: CourseMetadata) => Promise<void>;
  onReset: (courseId: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const [courseCode, setCourseCode] = useState('');
  const [title, setTitle] = useState('');
  const [term, setTerm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCourseCode(action?.course.courseCode ?? '');
    setTitle(action?.course.title ?? '');
    setTerm(action?.course.term ?? '');
    setError(null);
  }, [action]);

  if (!action) return null;
  const destructive = action.kind === 'delete';
  const heading = action.kind === 'edit'
    ? 'Edit course metadata'
    : action.kind === 'reset'
      ? 'Reset course progress?'
      : 'Delete course tree?';

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (action.kind === 'edit') {
        if (!title.trim()) throw new Error('Enter the full course title.');
        await onUpdate(action.course.id, {
          courseCode: courseCode.trim(),
          title: title.trim(),
          term: term.trim(),
        });
      } else if (action.kind === 'reset') {
        await onReset(action.course.id);
      } else {
        await onDelete(action.course.id);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That course action failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      visible
      animationType={reduceMotion ? 'none' : 'fade'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent={false}
    >
      <SafeAreaView
        style={[styles.modalBackdrop, { backgroundColor: theme.background }]}
        accessibilityViewIsModal
      >
        <View style={[styles.modal, { backgroundColor: theme.hudBackground, borderColor: destructive ? t.alarm : theme.border }]}> 
          <View style={styles.modalHeading}>
            <PixelIcon
              name={action.kind === 'edit' ? 'edit' : action.kind === 'reset' ? 'undo' : 'trash'}
              size={16}
              colour={destructive ? t.alarm : action.kind === 'reset' ? t.warning : t.info}
            />
            <PixelText variant="title" colour={t.ink}>{heading}</PixelText>
          </View>

          {action.kind === 'edit' ? (
            <View style={styles.fields}>
              <PixelInput label="Course code" value={courseCode} onChangeText={setCourseCode} placeholder="CPE111" />
              <PixelInput label="Full title" value={title} onChangeText={setTitle} placeholder="Discrete Mathematics" />
              <PixelInput label="Semester description" value={term} onChangeText={setTerm} placeholder="AY 2026 · Term 1" />
            </View>
          ) : (
            <View style={styles.confirmCopy}>
              <PixelText variant="body" colour={t.ink}>
                {action.kind === 'reset'
                  ? `All cleared missions and earned XP for ${action.course.title} will return to zero.`
                  : `${action.course.title}, its nodes, missions, and saved device records will be permanently removed.`}
              </PixelText>
              <PixelText variant="micro" colour={action.kind === 'reset' ? t.warning : t.alarm}>
                {action.kind === 'reset' ? 'THE COURSE TREE WILL STAY IN PLACE.' : 'THIS CANNOT BE UNDONE.'}
              </PixelText>
            </View>
          )}

          {error ? <PixelText variant="body" colour={t.alarm}>{error}</PixelText> : null}
          <View style={styles.modalActions}>
            <PixelButton label="Cancel" tone="panel" grow={false} disabled={busy} onPress={onClose} />
            <ConfirmButton
              label={busy ? 'Working…' : action.kind === 'edit' ? 'Save course' : action.kind === 'reset' ? 'Reset progress' : 'Delete course'}
              danger={destructive}
              disabled={busy}
              onPress={submit}
            />
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ConfirmButton({ label, danger, disabled, onPress }: {
  label: string;
  danger: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  if (!danger) return <PixelButton label={label} grow={false} disabled={disabled} onPress={onPress} />;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.confirmButton,
        { borderColor: t.alarm, backgroundColor: pressed ? t.alarm : t.panel },
        disabled ? styles.disabled : null,
      ]}
    >
      {({ pressed }) => (
        <PixelText variant="label" colour={pressed ? t.ground : t.alarm}>{label}</PixelText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  anchor: { position: 'relative', zIndex: 40 },
  trigger: {
    minHeight: touch,
    maxWidth: 380,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    paddingHorizontal: space.cell,
  },
  triggerTitle: { minWidth: 0, flexShrink: 1 },
  menu: {
    position: 'absolute',
    top: '100%',
    left: 0,
    marginTop: space.hair,
    overflow: 'hidden',
  },
  menuContent: { padding: space.cell, gap: space.xs },
  courseRow: { minHeight: touch, flexDirection: 'row', alignItems: 'center', gap: space.xs },
  courseIdentity: { minWidth: 0, minHeight: touch, flex: 1, justifyContent: 'center', paddingHorizontal: space.cell },
  action: {
    minWidth: touch,
    height: touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    paddingHorizontal: space.cell,
  },
  actionCompact: { width: touch, paddingHorizontal: 0 },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  modal: { width: '100%', maxWidth: 540, borderWidth: bevel, padding: space.md, gap: space.md },
  modalHeading: { flexDirection: 'row', alignItems: 'center', gap: space.cell },
  fields: { gap: space.cell },
  confirmCopy: { gap: space.cell },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.cell },
  confirmButton: {
    minHeight: touch,
    justifyContent: 'center',
    borderWidth: bevel,
    paddingHorizontal: space.md,
  },
});
