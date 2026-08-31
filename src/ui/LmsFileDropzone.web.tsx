import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { lms, type LmsColour } from '@/theme/lms';
import { useLmsTheme } from '@/theme/useLmsTheme';
import { Icon, LText } from './lms';
import type { LmsFileSelection } from './LmsFileDropzone';

interface Props {
  fileName?: string | null;
  status: string;
  statusTone?: 'idle' | 'ok' | 'bad';
  disabled?: boolean;
  onSelect: (file: LmsFileSelection) => Promise<void>;
}

/** Browser sibling adds drag-and-drop without changing the native contract. */
export function LmsFileDropzone({
  fileName,
  status,
  statusTone = 'idle',
  disabled,
  onSelect,
}: Props) {
  const theme = useLmsTheme();
  const styles = useMemo(() => createStyles(theme.colour), [theme]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

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
        accessibilityLabel="Drop a PDF, text, or Markdown syllabus here, or choose a file"
        accessibilityHint="Opens the file picker"
        accessibilityState={{ disabled: Boolean(disabled) }}
        style={({ pressed }) => [
          styles.dropzone,
          pressed || dragging ? styles.pressed : null,
          statusTone === 'bad' ? styles.bad : dragging || fileName ? styles.ok : null,
          disabled ? styles.disabled : null,
        ]}
      >
        <Icon name="upload-cloud" size={22} tone={statusTone === 'bad' ? 'attention' : fileName ? 'ok' : 'brand'} />
        <View style={styles.copy}>
          <LText variant="body" style={styles.strong}>
            {dragging ? 'Release to upload this syllabus' : fileName ?? 'Drop a syllabus here or choose a file'}
          </LText>
          <LText variant="small" tone="muted">PDF, TXT, or Markdown · up to 15 MB</LText>
          <LText variant="small" tone={statusTone === 'bad' ? 'attention' : fileName ? 'ok' : 'muted'}>
            {status}
          </LText>
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

function createStyles(c: LmsColour) {
  return StyleSheet.create({
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
}
