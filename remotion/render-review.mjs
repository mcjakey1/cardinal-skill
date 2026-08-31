import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition} from '@remotion/renderer';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, '..');
const outputDirectory = path.join(scriptDirectory, 'review-stills');
const frames = [45, 165, 315, 465, 630, 810, 1035, 1230, 1375];

await mkdir(outputDirectory, {recursive: true});

const serveUrl = await bundle({
  entryPoint: path.join(scriptDirectory, 'index.ts'),
  publicDir: path.join(projectDirectory, 'public'),
  onProgress: () => undefined,
});

const composition = await selectComposition({
  serveUrl,
  id: 'CardinalPitch',
  logLevel: 'error',
});

for (const frame of frames) {
  await renderStill({
    composition,
    serveUrl,
    frame,
    output: path.join(outputDirectory, `pitch-${String(frame).padStart(4, '0')}.png`),
    overwrite: true,
    logLevel: 'error',
  });
}
