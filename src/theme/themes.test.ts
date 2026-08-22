import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_THEME_ID,
  THEME_PRESETS,
  availableThemes,
  isThemePresetId,
  toLegacyTheme,
} from './themes.ts';

const HEX = /^#[0-9A-F]{6}$/i;

function luminance(hex: string): number {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

test('ships five unique, complete theme presets', () => {
  assert.equal(availableThemes.length, 5);
  assert.equal(new Set(availableThemes.map((theme) => theme.id)).size, 5);
  assert.equal(THEME_PRESETS[DEFAULT_THEME_ID].name, 'Obsidian Blueprint');

  for (const theme of availableThemes) {
    const colours = [
      theme.background,
      theme.surface,
      theme.surfaceHover,
      theme.border,
      theme.textPrimary,
      theme.textSecondary,
      theme.textMuted,
      ...Object.values(theme.nodeCompleted),
      ...Object.values(theme.nodeActive),
      ...Object.values(theme.nodeLocked),
      theme.edgeCompleted,
      theme.edgeActive,
      theme.edgeLocked,
      theme.hudBackground,
      theme.navActiveTab,
      theme.xpBarFill,
      theme.xpBarBackground,
    ];
    assert.ok(colours.every((colour) => HEX.test(colour)), `${theme.id} has an invalid colour`);
  }
});

test('primary and secondary text pass AA on canvas and surface roles', () => {
  for (const theme of availableThemes) {
    for (const ground of [theme.background, theme.surface]) {
      assert.ok(contrast(theme.textPrimary, ground) >= 4.5, `${theme.id} primary text`);
      assert.ok(contrast(theme.textSecondary, ground) >= 4.5, `${theme.id} secondary text`);
    }
  }
});

test('validates persisted IDs and maps node semantics without changing colours', () => {
  assert.equal(isThemePresetId('cyber-neon'), true);
  assert.equal(isThemePresetId('cardinal-old'), false);
  assert.equal(isThemePresetId(null), false);

  for (const preset of availableThemes) {
    const resolved = toLegacyTheme(preset);
    assert.equal(resolved.ground, preset.background);
    assert.equal(resolved.panel, preset.surface);
    assert.equal(resolved.node.mastered.fill, preset.nodeCompleted.background);
    assert.equal(resolved.node.available.fill, preset.nodeActive.background);
    assert.equal(resolved.node.locked.fill, preset.nodeLocked.background);
  }
});
