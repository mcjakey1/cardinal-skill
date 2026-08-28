import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import type { CommunityVisibility } from '@/features/skilltree/courseCatalog';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelButton, PixelIcon, PixelInput, PixelText, bevelStyle, type IconName } from './pixel';
import { PracticeCopyPrompt } from './PracticeCopyPrompt';

type ActionKind = 'rename' | 'share' | 'reset' | 'duplicate' | 'copyToEdit' | 'delete';

interface Props {
  course: CourseOption;
  reduceMotion: boolean;
  disabled?: boolean;
  fillRow?: boolean;
  embedded?: boolean;
  onRename: (courseId: string, metadata: CourseMetadata) => Promise<void>;
  onReset: (courseId: string) => Promise<void>;
  onShare: (courseId: string, visibility: CommunityVisibility) => Promise<void>;
  onArchive: (courseId: string) => Promise<void>;
  onDuplicate: (courseId: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
}

interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An anchored row popover; protected actions continue in a focused dialog. */
export function CourseActionMenu({
  course,
  reduceMotion,
  disabled = false,
  fillRow = false,
  embedded = false,
  onRename,
  onReset,
  onShare,
  onArchive,
  onDuplicate,
  onDelete,
}: Props) {
  const t = useTheme();
  const { theme } = useAppTheme();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const triggerRef = useRef<View>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<ActionKind | null>(null);
  const [anchor, setAnchor] = useState<AnchorRect>({ x: 0, y: 0, width: touch, height: touch });
  const [title, setTitle] = useState(course.title);
  const [courseCode, setCourseCode] = useState(course.courseCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shareVisibility: CommunityVisibility = 'public';
  const [published, setPublished] = useState(false);

  useEffect(() => {
    setTitle(course.title);
    setCourseCode(course.courseCode ?? '');
  }, [course.courseCode, course.title]);

  const openMenu = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setMenuOpen(true);
    });
  };

  const closeDialog = () => {
    if (busy) return;
    setAction(null);
    setError(null);
    setPublished(false);
  };

  const choose = (next: ActionKind) => {
    setMenuOpen(false);
    setAction(next);
    setError(null);
    setPublished(false);
  };

  const submit = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      if (action === 'rename') {
        if (!title.trim()) throw new Error('Enter a course title.');
        await onRename(course.id, {
          courseCode: courseCode.trim(),
          title: title.trim(),
          term: course.term ?? '',
        });
      } else if (action === 'share') {
        await onShare(course.id, shareVisibility);
        setPublished(true);
        return;
      } else if (action === 'reset') {
        await onReset(course.id);
      } else if (action === 'duplicate' || action === 'copyToEdit') {
        await onDuplicate(course.id);
      } else if (course.kind !== 'practice') {
        await onArchive(course.id);
      } else {
        await onDelete(course.id);
      }
      setAction(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That course action failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const popoverWidth = Math.min(280, viewportWidth - space.md);
  const popoverHeight = touch * 5 + space.cell * 2;
  const popoverRight = Math.max(space.cell, viewportWidth - anchor.x - anchor.width);
  const belowTop = anchor.y + anchor.height + space.xs;
  const popoverTop = belowTop + popoverHeight <= viewportHeight - space.cell
    ? belowTop
    : Math.max(space.cell, anchor.y - popoverHeight - space.xs);
  const destructive = action === 'delete' && course.kind === 'practice';

  return (
    <>
      <Pressable
        ref={triggerRef}
        collapsable={false}
        onPress={openMenu}
        disabled={disabled}
        hitSlop={embedded ? space.cell - space.hair : undefined}
        accessibilityRole="button"
        accessibilityLabel={`Course actions for ${course.title}`}
        accessibilityState={{ disabled, expanded: menuOpen }}
        style={({ pressed, hovered }) => [
          styles.trigger,
          embedded ? styles.embeddedTrigger : fillRow ? styles.rowTrigger : null,
          embedded
            ? pressed || hovered
              ? { backgroundColor: theme.surfaceHover }
              : null
            : bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
          disabled ? styles.disabled : null,
        ]}
      >
        <PixelIcon name="more" size={16} colour={t.ink} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={() => setMenuOpen(false)}
      >
        <View style={styles.popoverLayer}>
          <Pressable
            style={styles.dismissLayer}
            onPress={() => setMenuOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close course actions"
          />
          <View
            accessibilityViewIsModal
            style={[
              styles.popover,
              {
                top: popoverTop,
                right: popoverRight,
                width: popoverWidth,
                backgroundColor: theme.hudBackground,
                borderColor: theme.border,
                shadowColor: theme.background,
              },
            ]}
          >
            <PopoverAction
              icon="edit"
              label={course.canEdit ? 'Rename course' : 'Edit course'}
              colour={t.ink}
              disabled={course.isFixture}
              onPress={() => choose(course.canEdit ? 'rename' : 'copyToEdit')}
            />
            <PopoverAction
              icon="undo"
              label="Reset progress"
              colour={t.ink}
              disabled={course.isFixture}
              onPress={() => choose('reset')}
            />
            <PopoverAction
              icon="link"
              label={course.kind === 'community' ? 'Community publishing' : 'Publish to Community'}
              colour={t.info}
              disabled={!course.canEdit || course.isFixture || course.kind === 'official'}
              onPress={() => choose('share')}
            />
            <PopoverAction
              icon="stack"
              label="Duplicate / fork chart"
              colour={t.ink}
              disabled={course.isFixture}
              onPress={() => choose('duplicate')}
            />
            <PopoverAction
              icon="trash"
              label={course.kind === 'practice' ? 'Delete course' : 'Archive shared course'}
              colour={course.kind === 'practice' ? t.alarm : t.warning}
              disabled={!course.canDelete}
              onPress={() => choose('delete')}
            />
          </View>
        </View>
      </Modal>

      <Modal
        visible={Boolean(action && action !== 'copyToEdit')}
        animationType={reduceMotion ? 'none' : 'fade'}
        presentationStyle="fullScreen"
        onRequestClose={closeDialog}
      >
        <SafeAreaView
          style={[styles.dialogBackdrop, { backgroundColor: theme.background }]}
          accessibilityViewIsModal
        >
          <View
            style={[
              styles.dialog,
              {
                backgroundColor: theme.hudBackground,
                borderColor: destructive ? t.alarm : theme.border,
              },
            ]}
          >
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <PixelText variant="title" colour={destructive ? t.alarm : t.ink} numberOfLines={2}>
                  {action ? headingFor(action, course.title, course.kind !== 'practice') : ''}
                </PixelText>
              </View>
              <Pressable
                onPress={closeDialog}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Close course action"
                style={({ pressed }) => [
                  styles.close,
                  bevelStyle(t, 'panel', pressed ? 'inset' : 'raised'),
                ]}
              >
                <PixelIcon name="close" size={14} colour={t.ink} />
              </Pressable>
            </View>

            {action === 'rename' ? (
              <View style={styles.fields}>
                <PixelInput
                  label="Course title"
                  value={title}
                  onChangeText={setTitle}
                  placeholder="Digital Signal Processing"
                />
                <PixelInput
                  label="Course code"
                  value={courseCode}
                  onChangeText={setCourseCode}
                  placeholder="CPE 122-4"
                />
              </View>
            ) : action === 'share' ? (
              <View style={styles.confirmCopy}>
                {published ? (
                  <PixelText variant="body" colour={t.ink}>
                    This student-made course is now listed in Community. Learners can discover and join it there.
                  </PixelText>
                ) : (
                  <>
                    <PixelText variant="body" colour={t.ink}>
                      Publish this Playground course to Community. Learners join the shared original; their leaderboard stays separate from official courses and your private Playground XP.
                    </PixelText>
                    <PixelText variant="micro" colour={t.inkMuted}>
                      Every signed-in learner can discover and join it from Community.
                    </PixelText>
                    <PixelText variant="micro" colour={t.warning}>
                      STUDENT MADE · UNOFFICIAL SCORING · AUTHOR EXCLUDED FROM LADDER
                    </PixelText>
                  </>
                )}
              </View>
            ) : action ? (
              <View style={styles.confirmCopy}>
                <PixelText variant="body" colour={t.ink}>
                  {confirmationFor(action, course.title, course.kind !== 'practice')}
                </PixelText>
                <PixelText
                  variant="micro"
                  colour={action === 'delete' ? (course.kind === 'practice' ? t.alarm : t.warning) : action === 'reset' ? t.warning : t.info}
                >
                  {action === 'delete'
                    ? course.kind === 'practice'
                      ? `DELETE ${course.title.toUpperCase()}? THIS CANNOT BE UNDONE`
                      : 'NEW LEARNERS CANNOT JOIN. EXISTING PROGRESS STAYS INTACT.'
                    : action === 'reset'
                      ? 'THE SKILL TREE STRUCTURE WILL STAY IN PLACE.'
                      : 'THE COPY STARTS WITH ZERO PROGRESS AND CAN BE EDITED.'}
                </PixelText>
              </View>
            ) : null}

            {error ? <PixelText variant="body" colour={t.alarm}>{error}</PixelText> : null}

            {action ? (
              <View style={styles.footer}>
                <PixelButton label={published ? 'Done' : 'Cancel'} tone="panel" grow={false} disabled={busy} onPress={closeDialog} />
                {published ? null : <ConfirmButton action={action} archive={course.kind !== 'practice'} busy={busy} onPress={submit} />}
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </Modal>

      <PracticeCopyPrompt
        visible={action === 'copyToEdit'}
        courseTitle={course.title}
        courseKind={course.kind}
        busy={busy}
        error={error}
        reduceMotion={reduceMotion}
        onCancel={closeDialog}
        onConfirm={submit}
      />
    </>
  );
}

function headingFor(action: ActionKind, title: string, archive: boolean): string {
  if (action === 'rename') return 'Rename course';
  if (action === 'share') return 'Publish student-made course';
  if (action === 'reset') return 'Reset progress?';
  if (action === 'duplicate') return 'Duplicate chart?';
  if (action === 'copyToEdit') return 'Create a Playground copy?';
  return archive ? `Archive ${title}?` : `Delete ${title}?`;
}

function confirmationFor(action: Exclude<ActionKind, 'rename'>, title: string, archive: boolean): string {
  if (action === 'share') return `Share ${title} as a student-made community course?`;
  if (action === 'reset') return `Clear completed nodes and course XP for ${title}?`;
  if (action === 'duplicate') return `Create an independent editable copy of ${title}?`;
  if (action === 'copyToEdit') return `Create a private editable copy of ${title}?`;
  return archive
    ? `Remove ${title} from discovery while preserving its learners and progress?`
    : `Permanently remove ${title}, its nodes, missions, and saved progress?`;
}

function PopoverAction({ icon, label, colour, disabled, onPress }: {
  icon: IconName;
  label: string;
  colour: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="menuitem"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed, hovered }) => [
        styles.popoverAction,
        pressed || hovered ? { backgroundColor: theme.surfaceHover } : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <PixelIcon name={icon} size={14} colour={disabled ? t.inkMuted : colour} />
      <PixelText variant="body" colour={disabled ? t.inkMuted : colour}>{label}</PixelText>
    </Pressable>
  );
}

function ConfirmButton({ action, archive, busy, onPress }: {
  action: ActionKind;
  archive: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const label = busy
    ? 'Working…'
    : action === 'rename'
      ? 'Save course'
      : action === 'reset'
        ? 'Reset progress'
        : action === 'duplicate'
          ? 'Create copy'
          : action === 'copyToEdit'
            ? 'Create Playground copy'
            : action === 'share'
              ? 'Publish course'
          : archive ? 'Archive course' : 'Delete course';

  if (action !== 'delete' || archive) {
    return <PixelButton label={label} grow={false} disabled={busy} onPress={onPress} />;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy }}
      style={({ pressed }) => [
        styles.deleteButton,
        { borderColor: t.alarm, backgroundColor: pressed ? t.alarm : t.panel },
        busy ? styles.disabled : null,
      ]}
    >
      {({ pressed }) => (
        <PixelText variant="label" colour={pressed ? t.ground : t.alarm}>{label}</PixelText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: { width: touch, minHeight: touch, alignItems: 'center', justifyContent: 'center' },
  rowTrigger: { width: touch + space.cell, height: '100%', alignSelf: 'stretch' },
  embeddedTrigger: {
    width: touch - space.cell - space.xs,
    height: touch - space.cell - space.xs,
    minHeight: touch - space.cell - space.xs,
    flexShrink: 0,
  },
  popoverLayer: { flex: 1 },
  dismissLayer: { ...StyleSheet.absoluteFillObject },
  popover: {
    position: 'absolute',
    zIndex: 9999,
    borderWidth: bevel,
    borderRadius: space.xs,
    paddingVertical: space.cell,
    overflow: 'hidden',
    shadowOpacity: 0.32,
    shadowRadius: space.cell,
    shadowOffset: { width: 0, height: space.xs },
    elevation: 18,
  },
  popoverAction: {
    minHeight: touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.cell,
    paddingVertical: space.cell,
    paddingHorizontal: space.md,
  },
  dialogBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md },
  dialog: { width: '100%', maxWidth: 540, borderWidth: bevel, padding: space.md, gap: space.md },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  headerCopy: { minWidth: 0, flex: 1 },
  close: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  fields: { gap: space.md },
  confirmCopy: { gap: space.cell },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: space.cell, flexWrap: 'wrap' },
  deleteButton: {
    minHeight: touch,
    justifyContent: 'center',
    borderWidth: bevel,
    paddingHorizontal: space.md,
  },
  disabled: { opacity: 0.45 },
});
