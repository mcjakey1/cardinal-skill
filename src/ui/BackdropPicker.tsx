/**
 * Choosing what the skill tree is drawn on: a pattern from the palette, a link,
 * or a photo from this device.
 *
 * A photo is inlined, not referenced. The URI a picker hands back names a cache
 * the system is free to empty, means nothing after a web page reloads, and
 * means nothing at all on the student's second device — and the choice is kept
 * with the account, so it has to survive the trip.
 */

import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import {
  BACKDROP_IDS,
  BACKDROP_LABELS,
  DIM_STEPS,
  checkImageUri,
  imageLimitFor,
} from '@/theme/backdrops';
import type { DitherLevel } from '@/theme/dither';
import { useAppTheme } from '@/theme/ThemeProvider';
import { bevel, space, touch } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { Backdrop } from './Backdrop';
import { Bevel, PixelButton, PixelInput, PixelText, bevelStyle } from './pixel';

export function BackdropPicker() {
  const t = useTheme();
  const { theme, backdrop, setBackdrop, imageBroken } = useAppTheme();
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null);
  // The web keeps this in `localStorage`, which is far smaller than a device's
  // store and counts every character twice.
  const limit = imageLimitFor(Platform.OS === 'web' ? 'web' : 'native');

  const applyImage = (uri: string) => {
    const checked = checkImageUri(uri, limit);
    if (!checked.ok) {
      setNotice({ text: checked.reason, bad: true });
      return;
    }
    setBackdrop({ ...backdrop, id: 'image', imageUri: checked.uri });
    setNotice({ text: 'Image applied to the canvas.', bad: false });
  };

  const choosePhoto = async () => {
    setNotice(null);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setNotice({
        text: 'Photo access is off for Cardinal Skill. Turn it on in system settings, or paste a link instead.',
        bad: true,
      });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // Half quality is the difference between a wallpaper that fits in this
      // device's preference store and one that does not.
      quality: 0.5,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;

    // Inlined rather than referenced. `asset.uri` names a file on this handset;
    // the backdrop has to mean something on the student's other two devices.
    if (!asset.base64) {
      setNotice({ text: 'That photo could not be read. Try another, or paste a link.', bad: true });
      return;
    }
    // ponytail: a photo over the ceiling is refused, with the reason. Upload it
    // to a Storage bucket and keep the public URL instead if students hit this.
    applyImage(`data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}`);
  };

  const clearImage = () => {
    setBackdrop({ ...backdrop, id: 'field', imageUri: null });
    setLink('');
    setNotice({ text: 'Image removed. The canvas is back on its field.', bad: false });
  };

  return (
    <Bevel tone="panel" style={styles.section}>
      <View style={styles.copy}>
        <PixelText variant="title" colour={theme.textPrimary}>
          Canvas backdrop
        </PixelText>
        <PixelText variant="micro" colour={theme.textSecondary}>
          What the skill tree is drawn on. Saved to your account, so it follows you to every device you sign in on.
        </PixelText>
      </View>

      <View
        style={[styles.preview, { borderColor: theme.border }]}
        accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Backdrop />
      </View>

      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Canvas backdrop">
        {BACKDROP_IDS.map((id) => (
          <Chip
            key={id}
            label={BACKDROP_LABELS[id]}
            active={backdrop.id === id}
            onPress={() => {
              setNotice(null);
              if (id !== 'image') {
                setBackdrop({ ...backdrop, id });
                return;
              }
              if (backdrop.imageUri) setBackdrop({ ...backdrop, id });
              else setNotice({ text: 'Choose a photo or paste a link to use an image.', bad: false });
            }}
          />
        ))}
      </View>

      <View style={styles.imageBlock}>
        <PixelInput
          label="Image link"
          value={link}
          onChangeText={setLink}
          placeholder="https://…"
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          onSubmitEditing={() => applyImage(link)}
        />
        <View style={styles.buttons}>
          <PixelButton label="Use link" tone="panel" grow={false} onPress={() => applyImage(link)} />
          <PixelButton label="Choose photo" tone="panel" grow={false} onPress={choosePhoto} />
          {backdrop.imageUri ? (
            <PixelButton label="Remove image" tone="panel" grow={false} onPress={clearImage} />
          ) : null}
        </View>

        {backdrop.imageUri ? (
          <View style={styles.copy}>
            <PixelText variant="micro" colour={t.inkMuted}>
              DIM THE IMAGE SO NODE LABELS STAY READABLE
            </PixelText>
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Image dim">
              {DIM_STEPS.map((step) => (
                <Chip
                  key={step.label}
                  label={step.label}
                  active={backdrop.dim === step.value}
                  onPress={() => setBackdrop({ ...backdrop, dim: step.value as DitherLevel })}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* A selected choice that draws nothing is the confusing case: the
            chart has quietly fallen back to its field and only this can say
            why. It outranks the notice, which may be the "applied" line from
            the very image that then failed to load. */}
        {backdrop.id === 'image' && imageBroken ? (
          <PixelText variant="micro" colour={theme.danger}>
            That image will not load, so the chart is on its field. Check the link, or choose a photo.
          </PixelText>
        ) : notice ? (
          <PixelText variant="micro" colour={notice.bad ? theme.danger : theme.success}>
            {notice.text}
          </PixelText>
        ) : null}
      </View>
    </Bevel>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      style={({ pressed }) => [
        styles.chip,
        bevelStyle(t, active ? 'brand' : 'panel', active || pressed ? 'inset' : 'raised'),
      ]}
    >
      <PixelText variant="micro" colour={active ? t.tone.brand.ink : t.inkMuted}>
        {label.toUpperCase()}
      </PixelText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { padding: space.md, gap: space.md },
  copy: { gap: space.xs },
  preview: { height: 96, overflow: 'hidden', borderWidth: bevel },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
  chip: {
    minHeight: touch,
    paddingHorizontal: space.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageBlock: { gap: space.cell },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.cell },
});
