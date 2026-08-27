import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { MissionBoardRow } from './missionBoard';
import { COMPACT_AT } from '@/lib/layout';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText, type IconName } from '@/ui/pixel';

interface Props {
  row: MissionBoardRow;
  canEdit: boolean;
  onLocate: () => void;
  onToggle: () => void;
  onEdit: () => void;
}

export function MissionCardActions({ row, canEdit, onLocate, onToggle, onEdit }: Props) {
  const { mission, state } = row;
  const { width } = useWindowDimensions();
  const compact = width < COMPACT_AT;
  return (
    <View style={styles.actions}>
      <CardAction
        icon="chart"
        label="Locate on chart"
        accessibilityLabel={`Locate ${mission.title} on chart`}
        priority="primary"
        compact={compact}
        onPress={onLocate}
      />
      {state === 'open' ? (
        <CardAction
          icon="check"
          label="Complete"
          accessibilityLabel={`Complete ${mission.title} and claim ${mission.xpReward} XP`}
          priority="secondary"
          compact={compact}
          onPress={onToggle}
        />
      ) : state === 'done' ? (
        <CardAction
          icon="undo"
          label="Unmark"
          accessibilityLabel={`Unmark ${mission.title} for practice`}
          priority="secondary"
          compact={compact}
          onPress={onToggle}
        />
      ) : null}
      {canEdit ? (
        <CardAction
          icon="edit"
          accessibilityLabel={`Edit ${mission.title}`}
          priority="icon"
          compact={compact}
          onPress={onEdit}
        />
      ) : null}
    </View>
  );
}

function CardAction({ icon, label, accessibilityLabel, priority, compact, onPress }: {
  icon: IconName;
  label?: string;
  accessibilityLabel: string;
  priority: 'primary' | 'secondary' | 'icon';
  compact: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  const primary = priority === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.action,
        priority === 'primary' ? [styles.primary, compact ? styles.primaryCompact : null] : priority === 'secondary' ? styles.secondary : styles.icon,
        {
          backgroundColor: pressed ? t.panel : t.well,
          borderColor: primary ? t.warning : t.line,
        },
      ]}
    >
      <PixelIcon name={icon} size={12} colour={primary ? t.warning : t.inkMuted} />
      {label ? (
        <PixelText variant="micro" colour={primary ? t.warning : t.inkMuted} numberOfLines={1}>
          {label.toUpperCase()}
        </PixelText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'flex-end', gap: space.xs },
  action: {
    minHeight: touch,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
    borderWidth: bevel,
    paddingHorizontal: space.cell,
  },
  primary: { flex: 2 },
  primaryCompact: { flexBasis: '100%' },
  secondary: { flex: 1 },
  icon: { width: touch, paddingHorizontal: 0 },
});
