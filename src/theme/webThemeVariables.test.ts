import assert from 'node:assert/strict';
import test from 'node:test';

import { availableThemes } from './themes.ts';
import { webThemeVariables } from './webThemeVariables.ts';

test('browser chrome follows every active theme through semantic tokens', () => {
  for (const theme of availableThemes) {
    const variables = webThemeVariables(theme);
    assert.equal(variables['--csk-ground'], theme.background);
    assert.equal(variables['--csk-track'], theme.hudBackground);
    assert.equal(variables['--csk-track-edge'], theme.border);
    assert.equal(variables['--csk-thumb'], theme.edgeCompleted);
    assert.equal(variables['--csk-thumb-hover'], theme.edgeActive);
    assert.equal(variables['--csk-selection'], theme.navActiveTab);
  }
});
