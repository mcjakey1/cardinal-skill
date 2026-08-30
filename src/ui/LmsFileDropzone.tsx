import * as DocumentPicker from 'expo-document-picker';
import { Pressable, StyleSheet, View } from 'react-native';

import { lms } from '@/theme/lms';
import { Icon, LText } from './lms';

export interface LmsFileSelection {
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
  onSelect: (file: LmsFileSelection) => Promise<void>;
}

/** Native syllabus picker using only the instructor workspace visual language. */
export function LmsFileDropzone({
  fileName,
  status,
  statusTone = 'idle',
  disabled,
  onSelect,
}: Props) {
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
        pressed ? styles.pressed : null,
        statusTone === 'bad' ? styles.bad : fileName ? styles.ok : null,
        disabled ? styles.disabled : null,
      ]}
    >
      <Icon name="upload-cloud" size={22} tone={statusTone === 'bad' ? 'attention' : fileName ? 'ok' : 'brand'} />
      <View style={styles.copy}>
        <LText variant="body" style={styles.strong}>
          {fileName ?? 'Choose a syllabus file'}
        </LText>
        <LText variant="small" tone="muted">PDF, TXT, or Markdown · up to 15 MB</LText>
        <LText variant="small" tone={statusTone === 'bad' ? 'attention' : fileName ? 'ok' : 'muted'}>
          {status}
        </LText>
      </View>
    </Pressable>
  );
}

const c = lms.colour;
const styles = StyleSheet.create({
  dropzone: {
    minHeight: lms.touch * 2,
    padding: lms.space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.md,
    backgroundColor: c.surfaceSunk,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: c.lineStrong,
    borderRadius: lms.radius.sm,
  },
  pressed: { backgroundColor: c.surfaceHover },
  ok: { borderColor: c.ok },
  bad: { borderColor: c.attentionLine },
  disabled: { opacity: 0.56 },
  copy: { flex: 1, minWidth: 0, gap: lms.space.xs },
  strong: { fontWeight: '600' },
});
