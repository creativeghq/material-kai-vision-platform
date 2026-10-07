/**
 * The materialshub look for every embed element: tokens, fonts and shared parts. A merchant can
 * re-skin a widget by setting the `--mk-*` properties on it; `theme="dark"` swaps to the dark palette.
 */
import { appOrigin } from './appOrigin';

const LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const LATIN_EXT = 'U+0100-02AF, U+0304, U+0308, U+0329, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';
const GREEK = 'U+0370-0377, U+037A-037F, U+0384-038A, U+038C, U+038E-03A1, U+03A3-03FF';

let fontsRequested = false;

/** Registers the brand faces on the host page once; shadow roots render with document fonts. */
export function loadBrandFonts(): void {
  if (fontsRequested || typeof FontFace === 'undefined' || !document.fonts) return;
  fontsRequested = true;
  const base = `${appOrigin()}/fonts`;
  const faces: Array<[string, string, FontFaceDescriptors]> = [
    ['MK Cavita', 'Cavita_Regular.woff2', { style: 'normal', weight: '400' }],
    ['MK Cavita', 'Cavita_Italic.woff2', { style: 'italic', weight: '400' }],
    ['MK Roboto', 'roboto-latin.woff2', { weight: '100 900', unicodeRange: LATIN }],
    ['MK Roboto', 'roboto-latin-ext.woff2', { weight: '100 900', unicodeRange: LATIN_EXT }],
    ['MK Roboto', 'roboto-greek.woff2', { weight: '100 900', unicodeRange: GREEK }],
  ];
  for (const [family, file, desc] of faces) {
    const face = new FontFace(family, `url(${base}/${file}) format("woff2")`, { display: 'swap', ...desc });
    document.fonts.add(face);
    face.load().catch(() => undefined);
  }
}

const TOKENS = `
:host {
  --mk-ink: oklch(18% .025 55);
  --mk-ink-2: oklch(48% .028 60);
  --mk-paper: oklch(98.5% .008 85);
  --mk-surface: oklch(99.6% .004 85);
  --mk-muted: oklch(95.5% .014 82);
  --mk-line: oklch(88% .018 78);
  --mk-line-strong: oklch(82% .02 78);
  --mk-accent: oklch(78% .055 78);
  --mk-accent-ink: oklch(22% .028 55);
  --mk-accent-soft: oklch(78% .055 78 / .18);
  --mk-danger: oklch(52% .15 35);
  --mk-ok: oklch(50% .09 150);
  --mk-radius: 14px;
  --mk-radius-sm: 10px;
  --mk-display: 'MK Cavita', 'MK Roboto', ui-serif, Georgia, serif;
  --mk-sans: 'MK Roboto', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  display:block; font-family:var(--mk-sans); color:var(--mk-ink); -webkit-font-smoothing:antialiased;
}
:host([theme="dark"]) {
  --mk-ink: oklch(97% .008 85);
  --mk-ink-2: oklch(76% .02 75);
  --mk-paper: oklch(17% .02 55);
  --mk-surface: oklch(21% .022 55);
  --mk-muted: oklch(24% .022 55);
  --mk-line: oklch(32% .02 60);
  --mk-line-strong: oklch(40% .02 60);
  --mk-accent-soft: oklch(78% .055 78 / .14);
  --mk-danger: oklch(72% .13 35);
  --mk-ok: oklch(74% .1 150);
}
`;

const BASE = `
* { box-sizing:border-box; }
h3 { font-family:var(--mk-display); font-weight:400; font-size:24px; line-height:1.1; letter-spacing:-.01em; margin:0 0 4px; }
h3 em, .mk-title em { font-style:italic; color:var(--mk-accent); }
.mk-title { font-family:var(--mk-display); font-weight:400; font-size:clamp(28px,4vw,40px); line-height:1.02; letter-spacing:-.02em; margin:0; }
.mk-eyebrow { display:flex; align-items:center; gap:10px; font-size:10.5px; letter-spacing:.28em; text-transform:uppercase; color:var(--mk-ink-2); margin:0; }
.mk-eyebrow::before { content:''; width:26px; height:1px; background:currentColor; opacity:.6; }
p.hint, .hint, .muted, .sub, .note { color:var(--mk-ink-2); }
button { font:inherit; }
button.go, .mk-btn-primary {
  display:inline-flex; align-items:center; gap:12px; justify-content:center; font-size:14px; font-weight:500;
  padding:7px 7px 7px 20px; min-height:44px; border-radius:999px; border:0; cursor:pointer;
  background:var(--mk-accent); color:var(--mk-accent-ink); transition:transform .15s ease, filter .15s ease;
}
button.go::after, .mk-btn-primary::after {
  content:'\\2192'; display:grid; place-items:center; width:30px; height:30px; border-radius:50%;
  background:var(--mk-ink); color:var(--mk-paper); font-size:14px;
}
:host([theme="dark"]) button.go::after { background:var(--mk-accent-ink); color:var(--mk-accent); }
button.go:hover:not(:disabled) { filter:brightness(1.04); transform:translateY(-1px); }
button.act, button.ghost, a.btn, .mk-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:6px; font-size:13.5px; min-height:38px;
  padding:7px 16px; border-radius:999px; border:1px solid var(--mk-line-strong); background:transparent;
  color:var(--mk-ink); cursor:pointer; text-decoration:none; transition:border-color .15s ease, background .15s ease;
}
button.act:hover:not(:disabled), button.ghost:hover:not(:disabled), a.btn:hover { border-color:var(--mk-ink); }
button:disabled { opacity:.45; cursor:default; }
.chip, .opt, .swatch, .sw-chip {
  font:inherit; font-size:13px; padding:6px 13px; border-radius:999px; border:1px solid var(--mk-line-strong);
  background:transparent; color:var(--mk-ink); cursor:pointer; transition:all .15s ease;
}
.chip[aria-pressed="true"], .opt[aria-pressed="true"], .swatch[aria-pressed="true"], button.act[aria-pressed="true"] {
  border-color:var(--mk-ink); background:var(--mk-accent-soft); box-shadow:none;
}
input, select, textarea {
  font:inherit; font-size:14px; width:100%; padding:10px 12px; border-radius:var(--mk-radius-sm);
  border:1px solid var(--mk-line-strong); background:var(--mk-surface); color:var(--mk-ink); outline:none;
  transition:border-color .15s ease, box-shadow .15s ease;
}
input:focus, select:focus, textarea:focus { border-color:var(--mk-ink); box-shadow:0 0 0 3px var(--mk-accent-soft); }
input[type="range"] { padding:0; border:0; background:transparent; accent-color:var(--mk-accent); box-shadow:none; }
label.f { display:grid; gap:5px; font-size:12px; color:var(--mk-ink-2); }
label.f > span { font-size:12px; color:var(--mk-ink-2); }
.card { border:1px solid var(--mk-line); border-radius:var(--mk-radius); background:var(--mk-surface); }
.err { color:var(--mk-danger); font-size:13px; margin:0; }
.ok { color:var(--mk-ok); font-size:13px; margin:0; }
.state { color:var(--mk-ink-2); font-size:13px; }
@keyframes mk-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
`;

/** The full stylesheet for one element: brand tokens, shared parts, then the element's own rules. */
export function brandStyle(local: string): string {
  return TOKENS + BASE + local;
}
