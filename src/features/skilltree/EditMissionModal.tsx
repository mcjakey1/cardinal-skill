import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import { isMissionTitleCase, missionDifficulty, type MissionBoardRow } from './missionBoard';
import type { MissionUpdate } from './missionEditing';
import type { MissionDifficulty } from './types';
import { space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { StableScrollView } from '@/ui/StableScrollView';
import { Choice, PixelButton, PixelIcon, PixelInput, PixelText, bevelStyle } from '@/ui/pixel';

const DIFFICULTIES: readonly { value: MissionDifficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
];

export function EditMissionModal({
  row,
  saving,
  saveError,
  onClose,
  onSave,
}: {
  row: MissionBoardRow | null;
  saving: boolean;
  saveError: string | null;
  onClose: () => void;
  onSave: (update: MissionUpdate) => Promise<void>;
}) {
  const t = useTheme();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [xp, setXp] = useState('50');
  const [minutes, setMinutes] = useState('30');
  const [difficulty, setDifficulty] = useState<MissionDifficulty>('medium');
  const [validation, setValidation] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setTitle(row.mission.title);
    setDescription(row.mission.description);
    setXp(String(row.mission.xpReward));
    setMinutes(String(row.mission.estimatedMinutes ?? 30));
    setDifficulty(missionDifficulty(row.mission, row.node));
    setValidation(null);
  }, [row]);

  const submit = async () => {
    if (!row) return;
    const cleanTitle = title.trim();
    const xpReward = Number.parseInt(xp, 10);
    const estimatedMinutes = Number.parseInt(minutes, 10);
    if (!isMissionTitleCase(cleanTitle)) {
      setValidation('Use Title Case for the mission name, such as “Analyze the Signal Spectrum.”');
      return;
    }
    if (!Number.isInteger(xpReward) || xpReward < 10 || xpReward > 100) {
      setValidation('Set the XP reward from 10 to 100.');
      return;
    }
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes < 1 || estimatedMinutes > 600) {
      setValidation('Set an estimated time from 1 to 600 minutes.');
      return;
    }
    setValidation(null);
    await onSave({
      id: row.mission.id,
      skillId: row.node.id,
      title: cleanTitle,
      description: description.trim(),
      xpReward,
      estimatedMinutes,
      difficulty,
    });
  };

  return (
    <Modal
      transparent
      visible={Boolean(row)}
      animationType="none"
      onRequestClose={() => {
        if (!saving) onClose();
      }}
    >
      <KeyboardAvoidingView
        // iOS does not resize the root view for its keyboard; padding keeps the save controls reachable.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: t.ground }]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={saving ? undefined : onClose}
          accessibilityRole="button"
          accessibilityLabel="Close mission editor"
        />
        <View style={[styles.modal, bevelStyle(t, 'panel', 'raised')]}>
          <View style={styles.titleBar}>
            <View style={styles.titleCopy}>
              <PixelText variant="title" colour={t.ink}>Edit mission</PixelText>
              <PixelText variant="micro" colour={t.inkMuted} numberOfLines={1}>
                {row ? `${row.node.title.toUpperCase()} · UPDATES THE CHART` : ''}
              </PixelText>
            </View>
            <Pressable
              onPress={onClose}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel="Close mission editor"
              style={({ pressed }) => [styles.close, bevelStyle(t, 'panel', pressed ? 'inset' : 'raised')]}
            >
              <PixelIcon name="close" size={12} colour={t.ink} />
            </Pressable>
          </View>

          <StableScrollView
            showsVerticalScrollIndicator
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.form}
          >
            <PixelInput label="Mission title" value={title} onChangeText={setTitle} maxLength={120} />
            <PixelInput
              label="Objective / description"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={2000}
            />
            <View style={styles.numberRow}>
              <View style={styles.numberField}>
                <PixelInput label="XP gain (10–100)" value={xp} onChangeText={setXp} keyboardType="number-pad" />
              </View>
              <View style={styles.numberField}>
                <PixelInput label="Estimated minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
              </View>
            </View>
            <View style={styles.difficulty}>
              <PixelText variant="micro" colour={t.inkMuted}>DIFFICULTY LEVEL</PixelText>
              <Choice value={difficulty} options={DIFFICULTIES} onChange={setDifficulty} label="Difficulty level" />
            </View>
            {validation || saveError ? (
              <PixelText variant="body" colour={t.alarm} accessibilityLiveRegion="polite">
                {validation ?? saveError}
              </PixelText>
            ) : null}
            <View style={styles.actions}>
              <PixelButton label={saving ? 'Saving mission…' : 'Save mission'} disabled={saving} onPress={submit} />
              <PixelButton tone="panel" label="Cancel" disabled={saving} onPress={onClose} />
            </View>
          </StableScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: space.md },
  modal: { width: '100%', maxWidth: 640, maxHeight: '92%', alignSelf: 'center', overflow: 'hidden' },
  titleBar: { minHeight: touch + space.cell, flexDirection: 'row', alignItems: 'center', gap: space.cell, padding: space.cell },
  titleCopy: { minWidth: 0, flex: 1 },
  close: { width: touch, height: touch, alignItems: 'center', justifyContent: 'center' },
  form: { padding: space.md, gap: space.md },
  numberRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
  numberField: { minWidth: 180, flex: 1 },
  difficulty: { gap: space.xs },
  actions: { gap: space.cell },
});
