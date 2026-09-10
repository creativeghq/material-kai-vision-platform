/**
 * The Agent Studio surface: one chat, and an artifact you OPEN.
 *
 * WHAT THIS REPLACED. The canvas was a permanent left-docked PANE, so the chat spent every
 * conversation as a 400px right rail. `handleSendMessage` selected the turn's run before a single
 * tool had reported, so EVERY turn put a tab on the strip and took the screen — and most turns
 * produce prose. Conversation d3ec683e is four of those in a row: four canvas pages holding a
 * checklist of nothing, beside a column of text a third of the window wide.
 *
 * Three things have to stay true for that not to come back, and each of them failed once already
 * in some other form:
 *
 * 1. STARTING a turn opens nothing; PRODUCING something opens it. (agentRunProgress.test.ts pins
 *    the run half; this file pins the surface.)
 * 2. An artifact is named ONCE. The stream used to hand-write thirty `<ArtifactChip kind="…"
 *    title="…">` calls — a second copy of the mapping `getCanvasArtifact` makes — so a result
 *    could be called one thing on its chip and another on its tab, and a new kind needed four
 *    edits to appear everywhere.
 * 3. Anything that gets a chip can be DRAWN. `ClarifyCard` had an artifact kind, a tab and a chip
 *    and no renderer, so clicking it opened a blank pane and nothing failed — the renderer's
 *    fallback returns null for a payload it does not know, which looks like an empty canvas
 *    rather than an error.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const HUB_PATH = 'src/components/features/ai/AgentHub.tsx';
const CANVAS_PATH = 'src/components/features/ai/CanvasPanel.tsx';
const hub = stripComments(read(HUB_PATH));
const canvas = stripComments(read(CANVAS_PATH));

/** The source between two markers, so a section can be asserted about on its own. */
function between(src: string, startMarker: string, endMarker: string): string {
  const a = src.indexOf(startMarker);
  expect(a, `marker not found, re-point this guard: ${startMarker}`).toBeGreaterThan(-1);
  const b = src.indexOf(endMarker, a);
  expect(b, `marker not found, re-point this guard: ${endMarker}`).toBeGreaterThan(a);
  return src.slice(a, b);
}

/** Every `message.<payload>` / `m.<payload>` a section reads. */
function payloadKeys(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/\b(?:m|message)\.([a-zA-Z_]+Data|generation_job)\b/g)].map((x) => x[1]),
  );
}

describe('an artifact is named once', () => {
  it('the stream derives its chip instead of typing one out', () => {
    expect(hub).toContain('const renderArtifactChip');
    const chipHelper = between(hub, 'const renderArtifactChip', 'const renderCanvasArtifact');
    expect(chipHelper, 'the chip must come from the same derivation the modal opens on')
      .toContain('getCanvasArtifact(message)');
  });

  it('nobody hand-writes a chip’s kind or title again', () => {
    // The exact shape that shipped thirty times. `ArtifactChip` takes the artifact now, so a
    // `kind=` on it cannot even typecheck — this is here to say why, and to catch a new prop
    // being added back for the convenience of one call site.
    expect(hub, 'a hand-written ArtifactChip kind= is a second copy of getCanvasArtifact')
      .not.toMatch(/<ArtifactChip[^>]*\skind=/);
    expect(canvas, 'ArtifactChip must take the derived artifact, not a kind and a title')
      .toMatch(/artifact:\s*CanvasArtifact/);
  });

  it('the chip renders the kind’s own label rather than restating it', () => {
    expect(canvas).toMatch(/KIND_LABEL\[artifact\.kind\]/);
  });
});

describe('anything that gets a chip can be drawn', () => {
  it('every artifact payload has a renderer — no blank modal', () => {
    const artifactKeys = payloadKeys(between(hub, 'const getCanvasArtifact', 'const visibleMessages'));
    // The renderer plus the shared body it falls through to. `renderDataCardBody` exists exactly
    // so the same markup serves both surfaces, so it counts as coverage.
    const drawable = new Set([
      ...payloadKeys(between(hub, 'const renderCanvasArtifact', 'const renderCanvasInspector')),
      ...payloadKeys(between(hub, 'const renderDataCardBody', 'const renderArtifactChip')),
    ]);

    expect(artifactKeys.size, 'no artifact payloads found — re-point this guard').toBeGreaterThan(20);
    const undrawable = [...artifactKeys].filter((k) => !drawable.has(k)).sort();
    expect(
      undrawable,
      'these get a chip and a modal tab that renderCanvasArtifact cannot draw: the modal opens '
        + 'empty and nothing fails, because the renderer returns null for a payload it does not know',
    ).toEqual([]);
  });

  it('the renderer keeps its shared-body fallback', () => {
    const renderer = between(hub, 'const renderCanvasArtifact', 'const renderCanvasInspector');
    expect(renderer, 'without the fallback, eleven data-card kinds lose their renderer at once')
      .toContain('return renderDataCardBody(message);');
  });
});

describe('there is one chat and no second layout', () => {
  it('the docked pane and everything that sized against it are gone', () => {
    for (const ghost of ['canvasHidden', 'chatCollapsed', 'railMode', 'canvasPaneVisible', 'chatPaneHidden']) {
      expect(hub, `${ghost} is back — the chat is the whole window now, there is nothing to dock`)
        .not.toContain(ghost);
    }
    expect(hub, 'the 400px chat rail is back').not.toContain('max-w-[400px]');
  });

  it('the artifact opens in the app’s own overlay, not a hand-rolled one', () => {
    // `SocialPostEditorDialog` / `DocumentEditor` are the language: the shared Radix dialog on a
    // flat scrim. A second overlay idiom here is one more thing to keep in step with the rest of
    // the app, and it would not follow a change to the primitive.
    expect(canvas).toMatch(/from '@\/components\/core\/ui\/dialog'/);
    expect(canvas, 'a hand-rolled fixed overlay is not the app’s dialog')
      .not.toMatch(/fixed inset-0 z-50 bg-background\/80/);
  });

  it('the modal is mounted only when something is open', () => {
    // There is no empty canvas holding welcome copy any more: the chat is never behind anything.
    expect(canvas).toMatch(/open=\{Boolean\(group\)\}/);
  });

  it('the panel holds its height and the BODY scrolls', () => {
    // DialogContent puts `overflow-y-auto` on itself as a mobile-safety floor for content-sized
    // dialogs. On a fixed-height workspace that scrolls the header and the sub-tabs off the top
    // along with the artifact.
    expect(canvas).toMatch(/overflow-hidden/);
    expect(canvas).toMatch(/min-h-0 flex-1 overflow-auto/);
  });
});

describe('the chat still says what is happening', () => {
  it('the run line survives the rebuild', () => {
    // "We keep the other line that shows details of generations" — this is that line.
    expect(hub).toContain('<RunChip');
  });

  it('you can still ask about what you are looking at', () => {
    // The one thing the docked pane gave that a modal takes away: a Radix dialog makes what is
    // behind it inert, so reading a result and typing about it stopped being possible at once.
    // It must route through the SAME send every result card uses — a second composer here would
    // be a second place for attachments, toolkits and credits to drift out of step.
    expect(canvas).toMatch(/onAsk\?:\s*\(text: string\) => void/);
    expect(hub).toMatch(/onAsk=\{handleCardAsk\}/);
    const submit = between(canvas, 'const submitAsk', '};');
    expect(submit, 'the modal must close before it sends, or the answer lands behind it')
      .toMatch(/onClose\(\);\s*onAsk\(text\);/);
  });

  it('the artifacts list is the way back to an earlier result', () => {
    // The tab strip used to be the only way; without it this is, so it must enumerate the same
    // groups the modal draws from rather than keep its own idea of what exists.
    expect(hub).toMatch(/canvasGroups\.map\(\(g\) => \{/);
    expect(hub).toContain('artifactKindLabel(');
  });
});
