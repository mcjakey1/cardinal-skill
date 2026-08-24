import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, View } from 'react-native';

import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText } from './pixel';

export interface FileDropzoneSelection {
  name: string;
  uri: string;
  mimeType?: string | null;
  size?: number;
}

interface Props {
  fileName?: string | null;
  status: string;
  statusTone?: 'idle' | 'ok' | 'bad';
  disabled?: boolean;
  onSelect: (file: FileDropzoneSelection) => Promise<void>;
}

/** Mobile file surface; the web sibling adds native browser drag-and-drop. */
export function FileDropzone({ fileName, status, statusTone = 'idle', disabled, onSelect }: Props) {
  const t = useTheme();
  const statusColour = statusTone === 'bad' ? t.alarm : statusTone === 'ok' ? t.success : t.info;

  const browse = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['text/plain', 'text/markdown', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets[0]) return;
    await onSelect(result.assets[0]);
  };

  return (
    <Pressable
      onPress={browse}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel="Choose a PDF, text, or Markdown syllabus file"
      accessibilityHint="Opens the document picker"
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        styles.dropzone,
        {
          backgroundColor: pressed ? t.panel : t.well,
          borderColor: statusTone === 'bad' ? t.alarm : fileName ? t.success : t.line,
        },
        disabled ? styles.disabled : null,
      ]}
    >
      <PixelIcon name="upload" size={24} colour={statusColour} />
      <View style={styles.copy}>
        <PixelText variant="label" colour={t.ink} centred>
          {fileName ?? 'Choose a syllabus file'}
        </PixelText>
        <PixelText variant="micro" colour={t.inkMuted} centred>
          PDF · TXT · MD
        </PixelText>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.statusCell, { backgroundColor: statusColour }]} />
        <PixelText variant="micro" colour={statusColour} style={styles.statusText}>
          {status.toUpperCase()}
        </PixelText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  dropzone: {
    width: '100%',
    minHeight: touch * 3,
    borderWidth: bevel,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.cell,
    padding: space.md,
  },
  copy: { width: '100%', alignItems: 'center', gap: space.xs },
  statusRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  statusText: { minWidth: 0, flexShrink: 1 },
  statusCell: { width: space.cell, height: space.cell },
  disabled: { opacity: 0.56 },
});
