import {
  useRef,
  useState,
  type ChangeEvent,
} from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { PixelIcon, PixelText } from './pixel';
import type { FileDropzoneSelection } from './FileDropzone';

interface Props {
  fileName?: string | null;
  status: string;
  statusTone?: 'idle' | 'ok' | 'bad';
  disabled?: boolean;
  onSelect: (file: FileDropzoneSelection) => Promise<void>;
}

/** Browser file surface with drag-and-drop and a keyboard-accessible file picker. */
export function FileDropzone({ fileName, status, statusTone = 'idle', disabled, onSelect }: Props) {
  const t = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const statusColour = statusTone === 'bad' ? t.alarm : statusTone === 'ok' ? t.success : t.info;

  const deliver = async (file?: File) => {
    if (!file || disabled) return;
    const uri = URL.createObjectURL(file);
    try {
      await onSelect({ name: file.name, uri, mimeType: file.type, size: file.size });
    } finally {
      URL.revokeObjectURL(uri);
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    void deliver(event.currentTarget.files?.[0]);
    event.currentTarget.value = '';
  };

  return (
    <div
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        void deliver(event.dataTransfer.files?.[0]);
      }}
      style={{ width: '100%', alignSelf: 'stretch', boxSizing: 'border-box' }}
    >
      <Pressable
        onPress={() => inputRef.current?.click()}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Drop a PDF, text, or Markdown syllabus file here, or choose a file"
        accessibilityHint="Opens the file picker"
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={({ pressed }) => [
          styles.dropzone,
          {
            backgroundColor: pressed || dragging ? t.panel : t.well,
            borderColor: statusTone === 'bad' ? t.alarm : dragging || fileName ? t.success : t.line,
          },
          disabled ? styles.disabled : null,
        ]}
      >
        <PixelIcon name="upload" size={24} colour={statusColour} />
        <View style={styles.copy}>
          <PixelText variant="label" colour={t.ink} centred>
            {dragging ? 'Release to check in this file' : fileName ?? 'Drop a syllabus here or choose a file'}
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
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        onChange={onInputChange}
        style={{ display: 'none' }}
        tabIndex={-1}
      />
    </div>
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
