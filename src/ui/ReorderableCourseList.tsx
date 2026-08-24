import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import type { CourseMetadata, CourseOption } from '@/features/skilltree/courseQueries';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { CourseActionMenu } from './CourseActionMenu';
import { PixelText } from './pixel';

const ROW_HEIGHT = 72;
const ROW_STEP = ROW_HEIGHT + space.cell;

interface Props {
  courses: readonly CourseOption[];
  activeCourseId: string | null;
  reduceMotion: boolean;
  onOpen: (courseId: string) => void;
  onReorder: (courses: CourseOption[]) => void;
  onRename: (courseId: string, metadata: CourseMetadata) => Promise<void>;
  onReset: (courseId: string) => Promise<void>;
  onDuplicate: (courseId: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
  empty?: React.ReactElement | null;
}

export function ReorderableCourseList({
  courses,
  activeCourseId,
  reduceMotion,
  onOpen,
  onReorder,
  onRename,
  onReset,
  onDuplicate,
  onDelete,
  empty,
}: Props) {
  const [rows, setRows] = useState<CourseOption[]>([...courses]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const rowsRef = useRef(rows);
  const dragStartIndex = useSharedValue(-1);
  const dragTargetIndex = useSharedValue(-1);
  const dragOffset = useSharedValue(0);
  rowsRef.current = rows;

  useEffect(() => {
    if (!draggingId) setRows([...courses]);
  }, [courses, draggingId]);

  const resetDrag = useCallback(() => {
    dragStartIndex.value = -1;
    dragTargetIndex.value = -1;
    dragOffset.value = 0;
    setDraggingId(null);
  }, [dragOffset, dragStartIndex, dragTargetIndex]);

  const drop = useCallback((id: string, targetIndex: number) => {
    const current = rowsRef.current;
    const fromIndex = current.findIndex((course) => course.id === id);
    if (fromIndex < 0) {
      resetDrag();
      return;
    }
    const boundedTarget = Math.max(0, Math.min(current.length - 1, targetIndex));
    if (fromIndex === boundedTarget) {
      resetDrag();
      return;
    }
    const next = [...current];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) {
      resetDrag();
      return;
    }
    next.splice(boundedTarget, 0, moved);
    rowsRef.current = next;
    setRows(next);
    resetDrag();
    onReorder(next);
  }, [onReorder, resetDrag]);

  const moveAccessibly = useCallback((id: string, direction: -1 | 1) => {
    const current = rowsRef.current;
    const fromIndex = current.findIndex((course) => course.id === id);
    if (fromIndex < 0) return;
    drop(id, fromIndex + direction);
  }, [drop]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(course) => course.id}
      contentContainerStyle={styles.list}
      ListEmptyComponent={empty}
      removeClippedSubviews={false}
      scrollEnabled={!draggingId}
      renderItem={({ item, index }) => (
        <CourseLibraryRow
          course={item}
          index={index}
          count={rows.length}
          active={item.id === activeCourseId}
          dragging={item.id === draggingId}
          reduceMotion={reduceMotion}
          dragStartIndex={dragStartIndex}
          dragTargetIndex={dragTargetIndex}
          dragOffset={dragOffset}
          onBegin={setDraggingId}
          onDrop={drop}
          onCancel={resetDrag}
          onMoveAccessibly={moveAccessibly}
          onOpen={onOpen}
          onRename={onRename}
          onReset={onReset}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      )}
    />
  );
}

function CourseLibraryRow({
  course,
  index,
  count,
  active,
  dragging,
  reduceMotion,
  dragStartIndex,
  dragTargetIndex,
  dragOffset,
  onBegin,
  onDrop,
  onCancel,
  onMoveAccessibly,
  onOpen,
  onRename,
  onReset,
  onDuplicate,
  onDelete,
}: {
  course: CourseOption;
  index: number;
  count: number;
  active: boolean;
  dragging: boolean;
  reduceMotion: boolean;
  dragStartIndex: SharedValue<number>;
  dragTargetIndex: SharedValue<number>;
  dragOffset: SharedValue<number>;
  onBegin: (id: string) => void;
  onDrop: (id: string, targetIndex: number) => void;
  onCancel: () => void;
  onMoveAccessibly: (id: string, direction: -1 | 1) => void;
  onOpen: (courseId: string) => void;
  onRename: (courseId: string, metadata: CourseMetadata) => Promise<void>;
  onReset: (courseId: string) => Promise<void>;
  onDuplicate: (courseId: string) => Promise<void>;
  onDelete: (courseId: string) => Promise<void>;
}) {
  const t = useTheme();
  const { theme } = useAppTheme();

  const gesture = useMemo(() => Gesture.Pan()
    .minDistance(3)
    .onBegin(() => {
      dragStartIndex.value = index;
      dragTargetIndex.value = index;
      dragOffset.value = 0;
      runOnJS(onBegin)(course.id);
    })
    .onUpdate((event) => {
      const minOffset = -index * ROW_STEP;
      const maxOffset = (count - 1 - index) * ROW_STEP;
      const boundedOffset = Math.max(minOffset, Math.min(maxOffset, event.translationY));
      dragOffset.value = Math.round(boundedOffset / space.cell) * space.cell;
      dragTargetIndex.value = Math.max(
        0,
        Math.min(count - 1, Math.round((index * ROW_STEP + boundedOffset) / ROW_STEP)),
      );
    })
    .onEnd(() => {
      runOnJS(onDrop)(course.id, dragTargetIndex.value);
    })
    .onFinalize((_event, success) => {
      if (!success) runOnJS(onCancel)();
    }), [count, course.id, dragOffset, dragStartIndex, dragTargetIndex, index, onBegin, onCancel, onDrop]);

  const gridMotion = useAnimatedStyle(() => {
    const start = dragStartIndex.value;
    const target = dragTargetIndex.value;
    if (start < 0) return { transform: [{ translateY: 0 }] };
    if (index === start) return { transform: [{ translateY: dragOffset.value }] };
    if (start < target && index > start && index <= target) {
      return { transform: [{ translateY: -ROW_STEP }] };
    }
    if (start > target && index >= target && index < start) {
      return { transform: [{ translateY: ROW_STEP }] };
    }
    return { transform: [{ translateY: 0 }] };
  });

  const metadata = [course.courseCode, course.term].filter(Boolean).join(' · ');

  return (
    <Animated.View
      style={[
        styles.row,
        {
          backgroundColor: active ? theme.surfaceHover : theme.hudBackground,
          borderTopColor: dragging || active ? theme.nodeActive.border : t.tone.panel.light,
          borderLeftColor: dragging || active ? theme.nodeActive.border : t.tone.panel.light,
          borderRightColor: dragging || active ? theme.nodeActive.border : t.tone.panel.dark,
          borderBottomColor: dragging || active ? theme.nodeActive.border : t.tone.panel.dark,
          shadowColor: theme.background,
        },
        dragging ? styles.dragging : null,
        gridMotion,
      ]}
    >
      <GestureDetector gesture={gesture}>
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={`Reorder ${course.title}`}
          accessibilityHint="Drag vertically, or use the move up and move down actions."
          accessibilityActions={[
            { name: 'decrement', label: 'Move up' },
            { name: 'increment', label: 'Move down' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'decrement') onMoveAccessibly(course.id, -1);
            if (event.nativeEvent.actionName === 'increment') onMoveAccessibly(course.id, 1);
          }}
          style={({ pressed }) => [styles.grip, pressed ? styles.pressed : null]}
        >
          <PixelText variant="title" colour={dragging ? t.brand : t.inkMuted}>⠿</PixelText>
        </Pressable>
      </GestureDetector>

      <View style={styles.index}>
        <PixelText variant="micro" colour={active ? t.brand : t.inkMuted}>
          {String(index + 1).padStart(2, '0')}
        </PixelText>
      </View>

      <Pressable
        onPress={() => onOpen(course.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${course.title}${metadata ? `, ${metadata}` : ''}`}
        accessibilityState={{ selected: active }}
        style={({ pressed }) => [styles.identity, pressed ? styles.pressed : null]}
      >
        <View style={styles.titleLine}>
          <PixelText variant="body" numberOfLines={1} style={styles.title}>{course.title}</PixelText>
          {active ? (
            <View style={[styles.badge, { borderColor: t.brand, shadowColor: t.brand }]}>
              <PixelText variant="micro" colour={t.brand}>[ACTIVE]</PixelText>
            </View>
          ) : null}
        </View>
        {metadata ? (
          <PixelText variant="micro" colour={t.inkMuted} numberOfLines={1}>
            {metadata.toUpperCase()}
          </PixelText>
        ) : null}
      </Pressable>

      <CourseActionMenu
        course={course}
        reduceMotion={reduceMotion}
        embedded
        onRename={onRename}
        onReset={onReset}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { padding: space.md, paddingBottom: space.xxl, gap: space.cell },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: bevel,
    paddingRight: space.cell + space.xs,
  },
  dragging: {
    zIndex: 20,
    elevation: 12,
    shadowOpacity: 0.34,
    shadowRadius: space.xs,
    shadowOffset: { width: space.xs, height: space.xs },
  },
  grip: { width: touch, height: '100%', alignItems: 'center', justifyContent: 'center' },
  index: { minWidth: 30, alignItems: 'center' },
  identity: { minWidth: 0, flex: 1, height: '100%', justifyContent: 'center', paddingHorizontal: space.cell },
  titleLine: { minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.cell },
  title: { minWidth: 0, flexShrink: 1 },
  badge: {
    borderWidth: bevel,
    paddingHorizontal: space.cell,
    paddingVertical: space.hair,
    shadowOpacity: 0.46,
    shadowRadius: space.xs,
    shadowOffset: { width: 0, height: 0 },
  },
  pressed: { opacity: 0.72 },
});
