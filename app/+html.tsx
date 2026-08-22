import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * The web page every route is rendered into. Native never sees this file.
 *
 * Metro's default shell ships an empty `<title>`, no description, and no colour
 * on `html`/`body` — so a near-black app opens with a white flash and lands in
 * the tab bar with no name. Next.js gets this for free; on Expo web it is this
 * file's job, and skipping it is most of what "the web build feels less
 * polished" actually meant.
 *
 * Per-route titles are set with `<Head>` from `expo-router/head`. This is only
 * the fallback and the frame.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* No <title> and no description here, and for the same reason: every
            route sets its own through `expo-router/head`, and a static copy in
            this shell would be emitted alongside it. A crawler reading two
            descriptions takes whichever came first, so the page most worth
            describing accurately — a course chart, the instructor view — would
            have been described as the home page. `og:type` stays because it is
            the one value that is true on every route. */}
        {/* Both, in order: the browser picks the one matching the device, so a
            phone in light mode paints cream and one in dark paints void. */}
        <meta name="theme-color" content="#0B0F19" />
        <meta name="color-scheme" content="dark" />

        <meta property="og:type" content="website" />

        {/* Keeps body scroll off so the app's own scroll views own it, which is
            what react-native-web expects. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BOOT_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Paint the ground before React mounts, and give the interface its web manners.
 *
 * `background` is the same `palette.void` the app uses. It is duplicated here as
 * a literal because this file is emitted into static HTML before any JavaScript
 * — including the token module — has run.
 */
const BOOT_CSS = `
/*
 * Light is the default, dark is the media query.
 *
 * This runs before any JavaScript, so it can only follow the device — the
 * student's own Auto/Light/Dark choice lives in storage and lands a moment
 * later. Following the device here means the first paint is right for almost
 * everyone and never a white flash on a dark phone.
 */
:root {
  --csk-ground: #0B0F19;
  --csk-ink: #F8FAFC;
  --csk-focus: #E0F2FE;
  --csk-track: #111827;
  --csk-thumb: #334155;
  --csk-thumb-hover: #38BDF8;
}

html, body, #root {
  background-color: var(--csk-ground);
}
body {
  color: var(--csk-ink);
  /* The face is loaded by expo-font at runtime; this is what the first paint
     uses, so text is legible immediately instead of invisible.
     DotGothic16_400Regular is named first because that is the family expo-font
     actually registers, and the one DESIGN.md declares. The bare name is kept
     behind it for a hand-loaded font-face, and the monospace stack is what the
     pre-mount paint really gets. */
  font-family: 'DotGothic16_400Regular', 'DotGothic16', ui-monospace, 'Cascadia Mono',
    'Segoe UI Mono', monospace;
  -webkit-font-smoothing: none;
  font-smooth: never;
}
::selection {
  background-color: #0284C7;
  color: #FFFFFF;
}
/* The focus ring is part of the design system, not a browser default. */
:focus-visible {
  outline: 2px solid var(--csk-focus);
  outline-offset: 2px;
}
::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
::-webkit-scrollbar-track {
  background: var(--csk-track);
}
::-webkit-scrollbar-thumb {
  background: var(--csk-thumb);
  border: 2px solid var(--csk-track);
}
::-webkit-scrollbar-thumb:hover {
  background: var(--csk-thumb-hover);
}
`;
