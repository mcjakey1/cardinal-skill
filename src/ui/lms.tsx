/**
 * The instructor surface's parts: text, panels, tables, badges, notices.
 *
 * These exist because the instructor screen is a different design from the rest
 * of the app on purpose (see `src/theme/lms.ts`), and because a table drawn
 * inline three times is a table that disagrees with itself by the third. Nothing
 * here is general — it is the set `app/instructor.tsx` actually uses, and a part
 * that stops being used should leave with its caller.
 *
 * Deliberately absent, because the brief says so: stat-card rows, progress
 * rings, eyebrows, and cards nested in cards.
 */

import { useId } from 'react';

import { Feather } from '@expo/vector-icons';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { lms } from '@/theme/lms';

const c = lms.colour;

export type IconName = React.ComponentProps<typeof Feather>['name'];

/** react-native-web hands `hovered` to the style callback; the types do not. */
type PressState = { pressed: boolean; hovered?: boolean };

// ----------------------------------------------------------------------- text

export function LText({
  variant = 'body',
  tone = 'ink',
  numeric,
  style,
  children,
  ...rest
}: {
  variant?: keyof typeof lms.type;
  tone?: 'ink' | 'muted' | 'brand' | 'ok' | 'attention' | 'onBrand';
  /** Aligns columns of figures. Tables and inspector values want this. */
  numeric?: boolean;
  style?: StyleProp<TextStyle>;
  children: React.ReactNode;
} & Omit<React.ComponentProps<typeof Text>, 'style' | 'children'>) {
  const colours: Record<string, string> = {
    ink: c.ink,
    muted: c.inkMuted,
    brand: c.brand,
    ok: c.ok,
    attention: c.attention,
    onBrand: c.brandInk,
  };
  return (
    <Text
      style={[
        lms.type[variant] as TextStyle,
        { color: colours[tone] },
        numeric ? styles.numeric : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function Icon({
  name,
  size = 16,
  tone = 'muted',
}: {
  name: IconName;
  size?: number;
  tone?: 'ink' | 'muted' | 'brand' | 'ok' | 'attention' | 'onBrand';
}) {
  const colours: Record<string, string> = {
    ink: c.ink,
    muted: c.inkMuted,
    brand: c.brand,
    ok: c.ok,
    attention: c.attention,
    onBrand: c.brandInk,
  };
  return <Feather name={name} size={size} color={colours[tone]} />;
}

// -------------------------------------------------------------------- surface

export function Panel({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function PanelHead({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <View style={styles.panelHead}>
      <LText variant="section">{title}</LText>
      {right ? <View style={styles.row}>{right}</View> : null}
    </View>
  );
}

// -------------------------------------------------------------------- buttons

export function LButton({
  label,
  icon,
  variant = 'default',
  size = 'md',
  hideLabel,
  disabled,
  style,
  ...rest
}: {
  label: string;
  icon?: IconName;
  variant?: 'default' | 'primary' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
  /** Icon-only. The label still reaches a screen reader through the role. */
  hideLabel?: boolean;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, 'style' | 'children'>) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const tone = disabled ? 'muted' : primary || danger ? 'onBrand' : 'ink';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      style={({ hovered }: PressState) => [
        styles.button,
        size === 'sm' ? styles.buttonSm : null,
        variant === 'quiet' ? styles.buttonQuiet : styles.buttonBordered,
        primary ? { backgroundColor: hovered ? c.brandHover : c.brand, borderColor: c.brand } : null,
        danger ? styles.buttonDanger : null,
        !primary && !danger && hovered ? { backgroundColor: c.surfaceHover } : null,
        // Disabled drops its lift and goes to half, as the brief asks.
        disabled ? styles.buttonDisabled : variant === 'quiet' ? null : lms.lift,
        style,
      ]}
      {...rest}
    >
      {icon ? <Icon name={icon} size={15} tone={tone} /> : null}
      {hideLabel ? null : (
        <LText
          variant="small"
          tone={tone}
          style={[styles.buttonLabel, danger ? styles.buttonDangerLabel : null]}
        >
          {label}
        </LText>
      )}
    </Pressable>
  );
}

// --------------------------------------------------------------------- badges

/** Always paired with a word — never a bare colour. */
export function Badge({
  label,
  tone = 'neutral',
  icon,
}: {
  label: string;
  tone?: 'neutral' | 'ok' | 'attention' | 'brand' | 'gold';
  icon?: IconName;
}) {
  const skin: Record<string, { bg: string; fg: string; line: string }> = {
    neutral: { bg: c.surfaceSunk, fg: c.inkMuted, line: c.line },
    ok: { bg: c.okWash, fg: c.ok, line: c.okWash },
    attention: { bg: c.attentionWash, fg: c.attention, line: c.attentionLine },
    brand: { bg: c.brandWash, fg: c.brand, line: c.brandWash },
    // Gold fills; `goldInk` sets the text. The Gold-Is-Not-Ink Rule.
    gold: { bg: c.goldWash, fg: c.goldInk, line: c.gold },
  };
  const s = skin[tone]!;
  return (
    <View style={[styles.badge, { backgroundColor: s.bg, borderColor: s.line }]}>
      {icon ? <Feather name={icon} size={12} color={s.fg} /> : null}
      <Text style={[lms.type.small as TextStyle, { color: s.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * A track, not a ring. A ring hides its own scale; a track reads left to right
 * like the number printed next to it.
 */
export function Meter({ percent, label }: { percent: number; label?: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <View style={styles.meter} accessibilityRole="progressbar" accessibilityValue={{ now: value }}>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            { width: `${value}%`, backgroundColor: value < 30 ? c.attention : c.brand },
          ]}
        />
      </View>
      <LText variant="small" tone="muted" numeric>
        {label ?? `${value}%`}
      </LText>
    </View>
  );
}

/**
 * Text that has to be wrapped before React Native will draw it.
 *
 * A notice body written as prose with one interpolation in it — `{course.title}
 * has no class` — is not a string, it is an array of strings, so a plain
 * `typeof children === 'string'` test misses it and the raw text reaches a
 * `View`. On web that is a console error and the words still paint, which is
 * why it survived; on iOS and Android it is a hard render failure. Checking
 * every child keeps the wrap where the wrap belongs — in this component, once,
 * rather than at each call site remembering.
 *
 * Children that are elements are left alone: a caller passing its own layout
 * knows what it is doing, and a `View` nested inside a `Text` is its own bug.
 */
function isPlainText(children: React.ReactNode): boolean {
  const parts = Array.isArray(children) ? children : [children];
  return parts.length > 0
    && parts.every((part) => typeof part === 'string' || typeof part === 'number');
}

/** State that is not a row: a caveat, a suppression, a validation failure. */
export function Notice({
  tone = 'neutral',
  title,
  children,
}: {
  tone?: 'neutral' | 'attention' | 'error';
  title?: string;
  children?: React.ReactNode;
}) {
  const skin = {
    neutral: { bg: c.surface, line: c.line, icon: 'info' as IconName, fg: 'muted' as const },
    attention: {
      bg: c.attentionWash,
      line: c.attentionLine,
      icon: 'alert-triangle' as IconName,
      fg: 'attention' as const,
    },
    error: {
      bg: c.brandWash,
      line: c.errorLine,
      icon: 'alert-triangle' as IconName,
      fg: 'brand' as const,
    },
  }[tone];

  return (
    <View style={[styles.notice, { backgroundColor: skin.bg, borderColor: skin.line }]}>
      <View style={styles.noticeIcon}>
        <Icon name={skin.icon} size={16} tone={skin.fg} />
      </View>
      <View style={styles.noticeBody}>
        {title ? (
          <LText variant="body" style={styles.noticeTitle}>
            {title}
          </LText>
        ) : null}
        {isPlainText(children) ? <LText variant="small">{children}</LText> : children}
      </View>
    </View>
  );
}

// --------------------------------------------------------------------- inputs

export function Field({
  label,
  hint,
  tall,
  error,
  style,
  ...rest
}: { label: string; hint?: string; tall?: boolean; error?: string } & TextInputProps) {
  // The line under the box is not a loose sibling of it. `aria-describedby` is
  // what makes a reader hear the hint, and hear the error replace it; without
  // `aria-invalid` the box goes red and announces exactly as it did before.
  const messageId = useId();
  const message = error ?? hint;
  return (
    <View style={styles.field}>
      <LText variant="small" style={styles.fieldLabel}>
        {label}
      </LText>
      <TextInput
        accessibilityLabel={label}
        aria-invalid={Boolean(error)}
        aria-describedby={message ? messageId : undefined}
        placeholderTextColor={c.inkMuted}
        multiline={tall}
        style={[styles.input, tall ? styles.inputTall : null, error ? styles.inputError : null, style]}
        {...rest}
      />
      {message ? (
        <LText
          nativeID={messageId}
          variant="small"
          tone={error ? 'attention' : 'muted'}
          role={error ? 'alert' : undefined}
        >
          {message}
        </LText>
      ) : null}
    </View>
  );
}

/** Filter and mode switches. `aria-pressed` comes through `accessibilityState`. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <View style={styles.segmented} accessibilityRole="tablist" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active ? [styles.segmentActive, lms.lift] : null]}
          >
            <LText variant="small" tone={active ? 'ink' : 'muted'}>
              {option.label}
            </LText>
          </Pressable>
        );
      })}
    </View>
  );
}

// --------------------------------------------------------------------- dialog

/**
 * The kit had no dialog. `CourseSelector.tsx:210` is the structure this copies —
 * backdrop, `accessibilityViewIsModal`, heading, right-aligned actions — but
 * every token here is an LMS token. That file draws in the student's pixel
 * grammar, and mixing the two is the one thing `CLAUDE.md` asks us not to do.
 */
export function LModal({
  visible,
  title,
  children,
  onRequestClose,
}: {
  visible: boolean;
  title: string;
  children: React.ReactNode;
  onRequestClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose}>
      <View style={styles.modalBackdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityLabel="Close"
          accessibilityRole="button"
          onPress={onRequestClose}
        />
        {/* A dialog, not an alert. `alert` is a live region: it made the whole
            card — heading, prose and the Cancel button with it — announce as one
            announcement rather than as the thing you are standing in. */}
        <View style={styles.modalCard} accessibilityViewIsModal role="dialog" aria-modal>
          <LText variant="section">{title}</LText>
          {children}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------- table

export interface Column {
  key: string;
  label: string;
  /** Right-aligned, tabular. Figures only. */
  num?: boolean;
  flex?: number;
}

export interface TableRow {
  key: string;
  cells: React.ReactNode[];
  onPress?: () => void;
  active?: boolean;
  /** What a screen reader announces for the whole row. */
  label?: string;
}

/**
 * The spine of every screen here.
 *
 * Scrolls sideways rather than crushing: a roster squeezed into a phone's width
 * is a roster nobody can read, and the brief says so in as many words.
 */
export function DataTable({
  columns,
  rows,
  caption,
  empty,
}: {
  columns: Column[];
  rows: TableRow[];
  caption?: string;
  empty?: React.ReactNode;
}) {
  return (
    <View>
      {caption ? (
        <View style={styles.caption}>
          <LText variant="micro" tone="muted">
            {caption}
          </LText>
        </View>
      ) : null}
      <ScrollView horizontal contentContainerStyle={styles.tableScroll}>
        <View style={styles.table}>
          <View style={styles.tableHead}>
            {columns.map((col) => (
              <View key={col.key} style={{ flex: col.flex ?? 1 }}>
                <LText variant="micro" tone="muted" style={col.num ? styles.right : undefined}>
                  {col.label}
                </LText>
              </View>
            ))}
          </View>

          {rows.length === 0 && empty ? <View style={styles.tableEmpty}>{empty}</View> : null}

          {rows.map((row) => {
            const cells = row.cells.map((cell, i) => {
              const col = columns[i]!;
              return (
                <View
                  key={col.key}
                  style={[{ flex: col.flex ?? 1 }, col.num ? styles.cellRight : null]}
                >
                  {typeof cell === 'string' || typeof cell === 'number' ? (
                    <LText variant="small" numeric={col.num}>
                      {cell}
                    </LText>
                  ) : (
                    cell
                  )}
                </View>
              );
            });

            // A row without an `onPress` is not a control, so it is not drawn as
            // one. Rendering every row as a `Pressable` gave web a
            // `tabindex="0"` div with a pointer cursor and no role: twenty inert
            // stops to tab past on the way to the buttons standing inside the
            // cells, and a cursor promising a click that never came.
            // Deliberately not `disabled={!row.onPress}` on a Pressable — on web
            // that renders `pointer-events: none` over the whole row and kills
            // those buttons too.
            if (!row.onPress) {
              return (
                <View
                  key={row.key}
                  style={[styles.tableRow, row.active ? { backgroundColor: c.brandWash } : null]}
                >
                  {cells}
                </View>
              );
            }

            return (
              <Pressable
                key={row.key}
                onPress={row.onPress}
                accessibilityRole="button"
                accessibilityLabel={row.label}
                style={({ hovered }: PressState) => [
                  styles.tableRow,
                  row.active ? { backgroundColor: c.brandWash } : null,
                  hovered ? { backgroundColor: c.surfaceHover } : null,
                ]}
              >
                {cells}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Loading is skeleton rows, not a spinner, so the layout does not jump. */
export function Skeleton({ width = '100%' }: { width?: number | `${number}%` }) {
  return <View style={[styles.skeleton, { width }]} />;
}

const styles = StyleSheet.create({
  numeric: { fontVariant: ['tabular-nums'] },
  right: { textAlign: 'right' },
  row: { flexDirection: 'row', alignItems: 'center', gap: lms.space.sm },

  panel: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: lms.radius.md,
    // A table header is a filled band flush with the panel's top edge, and
    // without this it prints two square corners over the 8px radius.
    overflow: 'hidden',
    ...lms.lift,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: lms.space.md,
    paddingHorizontal: lms.space.lg,
    paddingVertical: lms.space.md,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },

  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: lms.space.sm,
    // `lms.touch`, not a tighter number that looks right on a desktop. The floor
    // is the same 44dp the student app keeps, and `sm` buys narrower, not
    // shorter — a control this workspace ships on a phone too.
    minHeight: lms.touch,
    paddingHorizontal: lms.space.lg,
    borderRadius: lms.radius.sm,
    backgroundColor: c.surface,
  },
  buttonSm: { paddingHorizontal: lms.space.md },
  buttonBordered: { borderWidth: 1, borderColor: c.lineStrong },
  buttonQuiet: { backgroundColor: 'transparent' },
  buttonDanger: { backgroundColor: c.attention, borderColor: c.attention },
  buttonDangerLabel: { color: c.surface },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontWeight: '600' },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: lms.space.xs,
    alignSelf: 'flex-start',
    // One line of small text, plus the hairline it sits inside.
    minHeight: lms.type.small.lineHeight + lms.space.xs,
    paddingHorizontal: lms.space.sm,
    borderRadius: lms.radius.pill,
    borderWidth: 1,
  },

  meter: { flexDirection: 'row', alignItems: 'center', gap: lms.space.sm },
  meterTrack: {
    flex: 1,
    minWidth: 60,
    height: 6,
    borderRadius: lms.radius.xs,
    backgroundColor: c.surfaceSunk,
    overflow: 'hidden',
  },
  meterFill: { height: 6, borderRadius: lms.radius.xs },

  notice: {
    flexDirection: 'row',
    gap: lms.space.md,
    padding: lms.space.md,
    borderWidth: 1,
    borderRadius: lms.radius.sm,
  },
  noticeIcon: { paddingTop: 2 },
  noticeBody: { flex: 1, gap: lms.space.xs },
  noticeTitle: { fontWeight: '600' },

  field: { gap: lms.space.xs },
  fieldLabel: { fontWeight: '600' },
  input: {
    minHeight: lms.touch,
    paddingHorizontal: lms.space.md,
    paddingVertical: lms.space.sm,
    borderWidth: 1,
    borderColor: c.lineStrong,
    borderRadius: lms.radius.sm,
    backgroundColor: c.surface,
    color: c.ink,
    fontSize: lms.type.body.fontSize,
  },
  inputTall: { minHeight: 132, textAlignVertical: 'top' },
  inputError: { borderColor: c.attention },

  segmented: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: lms.space.xs,
    padding: 3,
    borderRadius: lms.radius.sm + 2,
    backgroundColor: c.surfaceSunk,
  },
  segment: {
    minHeight: lms.touch,
    justifyContent: 'center',
    paddingHorizontal: lms.space.md,
    borderRadius: lms.radius.sm,
  },
  segmentActive: { backgroundColor: c.surface },

  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(37,31,32,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: lms.space.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    gap: lms.space.md,
    padding: lms.space.lg,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.line,
    borderRadius: lms.radius.md,
    // A deeper cast of `lms.lift` — same ink, lifted further off the page.
    shadowColor: c.ink,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },

  caption: { paddingHorizontal: lms.space.lg, paddingVertical: lms.space.sm },
  tableScroll: { flexGrow: 1 },
  table: { flex: 1, minWidth: lms.tableMin },
  tableHead: {
    flexDirection: 'row',
    gap: lms.space.md,
    alignItems: 'center',
    paddingHorizontal: lms.space.lg,
    paddingVertical: lms.space.sm,
    backgroundColor: c.surfaceSunk,
  },
  tableRow: {
    flexDirection: 'row',
    gap: lms.space.md,
    alignItems: 'center',
    minHeight: lms.touch,
    paddingHorizontal: lms.space.lg,
    paddingVertical: lms.space.sm,
    borderTopWidth: 1,
    borderTopColor: c.line,
  },
  tableEmpty: { padding: lms.space.xl, alignItems: 'center' },
  cellRight: { alignItems: 'flex-end' },

  skeleton: { height: 12, borderRadius: lms.radius.xs, backgroundColor: c.surfaceSunk },
});
