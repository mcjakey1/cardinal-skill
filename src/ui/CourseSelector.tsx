import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import type { CommunityVisibility } from '@/features/skilltree/courseCatalog';
import { courseKindLabel } from '@/features/skilltree/courseDistribution';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, motion, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { CourseActionMenu } from './CourseActionMenu';
import { PixelIcon, PixelText, bevelStyle } from './pixel';

interface Props {
  open: boolean;
  currentCourseId: string;
  currentTitle: string;
  courses: readonly CourseOption[];
  currentProgress?: { cleared: number; total: number };
  reduceMotion: boolean;
  managementDisabled?: boolean;
  onToggle: () => void;
  onSelect: (courseId: string) => void;
  onUpdate: (courseId: string, metadata: CourseMetadata) => Promise<void>;
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

/** A row-only quick switcher; the navbar trigger is its only header. */
export function CourseSelector({
  open,
  currentCourseId,
  currentTitle,
  courses,
  currentProgress,
  reduceMotion,
  managementDisabled = false,
  onToggle,
  onSelect,
  onUpdate,
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
  const [anchor, setAnchor] = useState<AnchorRect>({ x: 0, y: 0, width: 280, height: touch });
  const reveal = useSharedValue(0);

  const measureTrigger = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
    });
  }, []);

  useEffect(() => {
    if (!open) {
      reveal.value = 0;
      return;
    }
    measureTrigger();
    reveal.value = reduceMotion
      ? 1
      : withTiming(1, { duration: motion.quick + 80, easing: Easing.out(Easing.cubic) });
  }, [measureTrigger, open, reduceMotion, reveal, viewportHeight, viewportWidth]);

  const menuMotion = useAnimatedStyle(() => {
    return {
      opacity: reduceMotion ? 1 : reveal.value,
      transform: [{ translateY: reduceMotion ? 0 : (1 - reveal.value) * -space.cell }],
    };
  }, [reduceMotion]);

  const toggle = () => {
    if (!open) measureTrigger();
    onToggle();
  };

  const menuWidth = Math.min(620, Math.max(280, viewportWidth - space.md * 2));
  const menuLeft = Math.max(space.cell, Math.min(anchor.x, viewportWidth - menuWidth - space.cell));
  const menuTop = Math.min(
    anchor.y + anchor.height + space.hair,
    Math.max(space.cell, viewportHeight - touch * 2),
  );
  const menuMaxHeight = Math.max(touch * 2, viewportHeight - menuTop - space.cell);

  return (
    <View style={styles.anchor}>
      <Pressable
        ref={triggerRef}
        collapsable={false}
        onPress={toggle}
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
        <PixelIcon name="stack" size={12} colour={t.info} />
        <PixelText variant="micro" colour={t.info}>SWITCH</PixelText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={onToggle}
      >
        <View style={styles.overlay}>
          <Pressable
            style={styles.dismissLayer}
            onPress={onToggle}
            accessibilityRole="button"
            accessibilityLabel="Close course switcher"
          />
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.menu,
              {
                top: menuTop,
                left: menuLeft,
                width: menuWidth,
                maxHeight: menuMaxHeight,
                backgroundColor: theme.hudBackground,
                borderColor: theme.border,
                shadowColor: theme.background,
              },
              menuMotion,
            ]}
          >
            <ScrollView contentContainerStyle={styles.menuContent} nestedScrollEnabled>
              {courses.map((course) => {
                const active = course.id === currentCourseId;
                const metadata = [
                  courseKindLabel(course.kind).toUpperCase(),
                  course.courseCode?.toUpperCase(),
                  active && currentProgress
                    ? `${currentProgress.cleared}/${currentProgress.total} CLEARED`
                    : null,
                  course.term?.toUpperCase(),
                ].filter(Boolean).join(' · ');

                return (
                  <View
                    key={course.id}
                    style={[
                      styles.courseRow,
                      {
                        backgroundColor: active ? theme.surfaceHover : theme.hudBackground,
                        borderColor: active ? theme.nodeActive.border : theme.border,
                      },
                    ]}
                  >
                    <Pressable
                      onPress={() => onSelect(course.id)}
                      accessibilityRole="menuitem"
                      accessibilityLabel={`Open ${course.title}${metadata ? `, ${metadata}` : ''}`}
                      accessibilityState={{ selected: active }}
                      style={({ pressed }) => [styles.courseIdentity, pressed ? styles.pressed : null]}
                    >
                      <PixelText
                        variant="body"
                        colour={active ? theme.nodeActive.border : t.ink}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {course.title}
                      </PixelText>
                      {metadata ? (
                        <PixelText
                          variant="micro"
                          colour={active ? theme.warning : t.inkMuted}
                          numberOfLines={1}
                        >
                          {metadata}
                        </PixelText>
                      ) : null}
                    </Pressable>
                    <CourseActionMenu
                      course={course}
                      reduceMotion={reduceMotion}
                      disabled={managementDisabled}
                      embedded
                      onRename={onUpdate}
                      onReset={onReset}
                      onShare={onShare}
                      onArchive={onArchive}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                    />
                  </View>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    </View>
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
  overlay: { flex: 1 },
  dismissLayer: { ...StyleSheet.absoluteFillObject },
  menu: {
    position: 'absolute',
    zIndex: 9998,
    borderWidth: bevel,
    overflow: 'hidden',
    shadowOpacity: 0.34,
    shadowRadius: space.md,
    shadowOffset: { width: 0, height: space.cell },
    elevation: 12,
  },
  menuContent: { padding: space.md, gap: space.cell },
  courseRow: {
    height: touch + space.cell + space.xs,
    minHeight: touch + space.cell,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.cell,
    borderWidth: bevel,
    paddingHorizontal: space.cell + space.xs,
    paddingVertical: space.cell,
  },
  courseIdentity: {
    minWidth: 0,
    flex: 1,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.72 },
});
