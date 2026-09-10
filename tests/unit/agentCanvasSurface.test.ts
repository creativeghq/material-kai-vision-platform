/** The Agent Studio surface: one chat, and an artifact you OPEN. */
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
    expect(hub).toContain('const renderArtifactCard');
    const chipHelper = between(hub, 'const renderArtifactCard', 'const renderCanvasArtifact');
    expect(chipHelper, 'the chip must come from the same derivation the modal opens on')
      .toContain('getCanvasArtifact(message)');
  });

  it('nobody hand-writes a chip’s kind or title again', () => {
    // The exact shape that shipped thirty times. `ArtifactCard` takes the artifact now, so a
    // `kind=` on it cannot even typecheck — this is here to say why, and to catch a new prop
    // being added back for the convenience of one call site.
    expect(hub, 'a hand-written ArtifactCard kind= is a second copy of getCanvasArtifact')
      .not.toMatch(/<ArtifactCard[^>]*\skind=/);
    expect(canvas, 'ArtifactCard must take the derived artifact, not a kind and a title')
      .toMatch(/artifact:\s*CanvasArtifact/);
  });

  it('the chip renders the kind’s own label rather than restating it', () => {
    expect(canvas).toMatch(/KIND_LABEL\[artifact\.kind\]/);
  });

  it('the card is rendered ONCE, and outside the message bubble', () => {
    /**
     * Inside the bubble it could not be seen, and that is a property of the bubble rather than
     * of the card: `.msg-assistant` is `--primary` on the dark themes and `--card` on the light
     * ones, so a card drawn in `bg-card` was a dark box on magenta in one and EXACTLY the
     * bubble's own colour in the other. The bubble also re-themes its children by attribute
     * selector (`html.light .msg-assistant [class*="bg-white"]`, …), so anything in there is
     * styled by where it sits instead of by what it is.
     */
    const calls = hub.split('renderArtifactCard(message)').length - 1;
    expect(calls, 'the artifact card must have exactly one placement in the stream').toBe(1);

    // The bubble's ACTUAL closing tag, by matching `<div>` depth from its opening tag. Anchoring
    // on the first `</div>` after `msg-assistant` looked equivalent and was not: that one closes
    // the routed-by-JARVIS label a few lines in, so the assertion held for a card put back
    // anywhere in the bubble below it. A guard that cannot fail for the regression it names is
    // worse than no guard, because it reports green while the thing walks back in.
    const bubbleClass = hub.indexOf('msg-assistant');
    expect(bubbleClass, 'the assistant bubble is gone — re-point this guard').toBeGreaterThan(-1);
    const bubbleOpen = hub.lastIndexOf('<div', bubbleClass);
    let depth = 0;
    let bubbleClose = -1;
    for (let i = bubbleOpen; i < hub.length; i++) {
      if (hub.startsWith('</div>', i)) {
        if (--depth === 0) { bubbleClose = i; break; }
      } else if (hub.startsWith('<div', i)) {
        // A self-closing `<div … />` opens nothing.
        const tagEnd = hub.indexOf('>', i);
        if (tagEnd > 0 && hub[tagEnd - 1] !== '/') depth++;
      }
    }
    expect(bubbleClose, 'could not match the bubble’s closing tag — re-point this guard')
      .toBeGreaterThan(bubbleOpen);
    expect(
      hub.indexOf('renderArtifactCard(message)'),
      'the card renders inside the message bubble again, where it cannot be seen',
    ).toBeGreaterThan(bubbleClose);
  });

  it('a bubble that would only repeat its card is not drawn', () => {
    // A pending question, an approval gate and a plain result carry their heading as `content`
    // AND as the artifact title, so once the card moved outside the bubble the turn said the
    // same sentence twice. Derived by comparing the two — naming the payloads would be the
    // per-payload branching the stream just lost twenty-one copies of.
    expect(hub).toContain('const bubbleRepeatsTheCard');
    expect(hub).toMatch(/\{!bubbleRepeatsTheCard\(message\) && \(/);
    const predicate = between(hub, 'const bubbleRepeatsTheCard', 'const renderArtifactCard');
    expect(predicate, 'the predicate must compare the prose against the title, not list payloads')
      .toMatch(/prose === artifact\.title\.trim\(\)/);
    expect(predicate, 'a hardcoded payload list here is the branching this file removed')
      .not.toMatch(/inputRequestData|actionConfirmationData|agentResultData/);
  });

  it('the card sizes itself, and the stream does not stretch it', () => {
    /**
     * It shipped as `w-full` inside a `max-w-[75%]` wrapper. On a full-width chat that is about
     * 1400px, so a 48px tile and two short lines became an empty bar with the action pinned a
     * whole viewport away from the title. A bubble can carry that width because it is full of
     * text; a card has nothing to fill it with.
     */
    expect(canvas, 'the card must carry its own max width').toMatch(/max-w-lg' : 'w-full max-w-md/);
    const placement = between(hub, 'const card = renderArtifactCard(message)', '})()}');
    expect(placement, 'a width imposed by the stream is what stretched it into a bar')
      .not.toMatch(/max-w-\[88%\]|sm:max-w-\[75%\]/);
    // …and lined up with the message text rather than sticking out to the left of every bubble.
    expect(placement).toContain('pl-11');
  });

  it('a question that BLOCKS the turn does not look like a finished result', () => {
    // `clarify` and `confirm` are the turn asking, and it does not continue until they are
    // answered. They shipped as the same grey card with the same passive "View" as a result
    // nobody has to act on — the quietest thing on screen was the one thing that stops.
    expect(canvas).toMatch(/PENDING_KINDS = new Set<CanvasArtifactKind>\(\['clarify', 'confirm'\]\)/);
    expect(canvas, 'a pending card must not read "View"').toMatch(/clarify: 'Answer'/);
    expect(canvas).toMatch(/confirm: 'Review'/);
    expect(canvas, 'the pending action needs the solid fill, not the quiet one')
      .toMatch(/pending\s*\?\s*'bg-primary text-primary-foreground'/);
  });

  it('the card says what it holds, and can be acted on without opening it', () => {
    // Counts only, derived where the artifact is derived. `primaryListCount` is AgentResultCard's
    // own "which list is this about", imported so the card's row count and the table's cannot
    // disagree.
    expect(canvas).toMatch(/meta\?:\s*string\[\]/);
    const artifact = between(hub, 'const getCanvasArtifact', 'const visibleMessages');
    expect(artifact).toContain('primaryListCount(');
    expect(
      artifact.split('meta:').length - 1,
      'no artifact carries meta — the card is back to a title and a kind',
    ).toBeGreaterThanOrEqual(5);
    // The kebab is a sibling of the open button, never nested inside it: a button inside a
    // button is invalid markup and unclickable.
    expect(canvas).toMatch(/onCloseArtifact\?: \(id: string\) => void;/);
    expect(hub).toMatch(/onCloseArtifact=\{handleCloseArtifact\}[\s\S]{0,120}onDeleteArtifact=\{handleDeleteArtifact\}/);
  });

  it('a table opened in the modal is a preview, not a dump', () => {
    // The modal body scrolls the whole artifact, so a table that scrolled with it took its own
    // column names off screen by row twenty, and a 500-row result rendered 500 rows.
    const card = stripComments(read('src/components/features/ai/AgentResultCard.tsx'));
    expect(card, 'the table needs its own bounded scroll region').toMatch(/max-h-\[26rem\]/);
    expect(card, 'the header must stay put while the rows scroll').toMatch(/sticky top-0 z-10/);
    expect(card, 'a wide table still scrolls horizontally').toContain('overflow-x-auto');
    expect(card).toContain('ROW_PREVIEW_CAP');
    expect(card, 'the capped rows must be what renders').toMatch(/\{visible\.map\(/);
    expect(card, 'the reader must be told how many there are').toMatch(/rows\.length === 1 \? 'row' : 'rows'/);
  });

  it('the card is a panel that is itself the click target', () => {
    // The design system's own answer for a panel you click through on: the border goes to the
    // accent and the ground warms a step, with no translation. Not a bespoke hover here.
    expect(canvas).toContain('panel-interactive');
  });

  it('a result you can recognise before you open it', () => {
    // For an image, a render or a board, the picture IS most of what was asked for; a line of
    // text naming it is a worse answer than the thing.
    expect(canvas).toMatch(/preview\?:\s*string/);
    expect(canvas).toMatch(/\{showPreview \?/);
    // A preview that fails to load falls back to the kind icon, in REACT state. Hiding the <img>
    // by writing `style.display` from the error handler is not a fallback: React never resets an
    // imperative style, so one transient failure left that card with an empty slot for good,
    // including after `preview` changed to a URL that works.
    expect(canvas, 'a failed preview must fall back, not leave a hole')
      .toMatch(/onError=\{\(\) => setPreviewFailed\(true\)\}/);
    expect(canvas).toMatch(/setPreviewFailed\(false\); \}, \[artifact\.preview\]\)/);
    const artifact = between(hub, 'const getCanvasArtifact', 'const visibleMessages');
    expect(
      artifact.split('preview:').length - 1,
      'no artifact carries a preview — the card is back to being a line of text',
    ).toBeGreaterThanOrEqual(5);
  });
});

describe('anything that gets a chip can be drawn', () => {
  it('every artifact payload has a renderer — no blank modal', () => {
    const artifactKeys = payloadKeys(between(hub, 'const getCanvasArtifact', 'const visibleMessages'));
    // The renderer plus the shared body it falls through to. `renderDataCardBody` exists exactly
    // so the same markup serves both surfaces, so it counts as coverage.
    const drawable = new Set([
      ...payloadKeys(between(hub, 'const renderCanvasArtifact', 'const renderCanvasInspector')),
      ...payloadKeys(between(hub, 'const renderDataCardBody', 'const renderArtifactCard')),
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

  it('the modal is the size of the thing in it', () => {
    // `h-[92dvh]` made every artifact the same height, so a result with three key/value rows
    // opened as ~130px of content above 800px of empty cream. A tall artifact still hits the
    // cap and behaves identically; a small one shrinks to fit.
    // Lookbehind, because `\bh-\[92dvh\]` also matches inside `max-h-[92dvh]` — the boundary
    // sits between the `-` and the `h`, so the assertion failed on the fix for it.
    expect(canvas, 'a fixed height gives every artifact the same empty sheet')
      .not.toMatch(/(?<!max-)h-\[92dvh\]/);
    expect(canvas).toMatch(/max-h-\[92dvh\]/);
  });

  it('the artifact is ONE surface, not a card inside a card', () => {
    // Every renderer draws its own frame because in the chat that frame separated a result from
    // the prose around it. In the modal the artifact IS the page, so the frame was a `bg-card`
    // box with a hairline inside a `bg-card` panel — one surface more than the ladder has.
    expect(canvas, 'the modal body must flatten the renderer’s own frame')
      .toContain('artifact-page');
    const css = read('src/index.css');
    expect(css, 'the .artifact-page rule is gone — the double frame is back')
      .toMatch(/\.artifact-page > \[class\*="bg-card"\]/);
  });

  it('the title is not printed three times', () => {
    // The modal header, the sub-tab and the card all rendered `agentResultData.title`.
    expect(hub).toMatch(/access=\{recordLinkAccess\} hideTitle/);
  });

  it('the panel holds its height and the BODY scrolls', () => {
    // DialogContent puts `overflow-y-auto` on itself as a mobile-safety floor for content-sized
    // dialogs. On a fixed-height workspace that scrolls the header and the sub-tabs off the top
    // along with the artifact.
    expect(canvas).toMatch(/overflow-hidden/);
    expect(canvas).toMatch(/min-h-0 flex-1 overflow-auto/);
  });
});

describe('the modal opens on the OUTCOME, and never mid-turn', () => {
  it('waits for the turn to finish before opening anything', () => {
    // Opening on the first artifact a stream emits gets two things wrong at once. It is
    // once-per-run, so "generate an SEO article" would open on the research card and never
    // advance to the article. And a Radix dialog makes what is behind it inert, so a modal
    // thrown up mid-turn hides every later message, silences the composer, and covers an
    // approve/decline gate for the rest of the run.
    const yieldEffect = hub.slice(hub.indexOf('const yieldedRunsRef'));
    const body = yieldEffect.slice(0, yieldEffect.indexOf('}, [canvasGroups'));
    expect(body, 'the yield must skip a run that is still going').toContain("run.status === 'running'");
    expect(body.indexOf("run.status === 'running'"))
      .toBeLessThan(body.indexOf('yieldedRunsRef.current.add'));
  });

  it('a chip never names one thing and opens another', () => {
    // `renderCanvasArtifact` draws a <video> for a gemini message that also carries videoData —
    // the image was animated — so the derivation must not call that "Generated image".
    const artifact = between(hub, 'const getCanvasArtifact', 'const visibleMessages');
    expect(artifact).toMatch(/m\.geminiImageData && !m\.videoData/);
  });
});

describe('the chat still says what is happening', () => {
  it('the run line survives the rebuild', () => {
    // "We keep the other line that shows details of generations" — this is that line.
    expect(hub).toContain('<RunChip');
  });

  it('only a RUNNING run is pinned above the stream', () => {
    // Left pinned after it finishes, the strip grows by one every turn and a long conversation
    // opens on a stack of finished checklists detached from the turns that made them.
    expect(hub).toMatch(/displayRuns\.some\(\(r\) => r\.status === 'running'\)/);
    expect(hub).toMatch(/displayRuns\.filter\(\(r\) => r\.status === 'running'\)/);
  });

  it('one workflow ask on screen, not two', () => {
    // The top wizard exists for a workflow booted on an EMPTY chat, where the empty state
    // would otherwise win. Once there are messages the tracker carries the same ask in its
    // bottomSlot, and both at once is two identical forms each auto-sending the same
    // continuation. The pairing was unreachable while the canvas pane was open by default;
    // making the chat the only surface made it the default.
    expect(hub).toMatch(/\{visibleMessages\.length === 0 && Object\.values\(workflows\)/);
  });

  it('the artifacts count excludes runs', () => {
    // Every send makes a run, and runs are members of `canvasArtifacts` so the modal can land
    // on one. Counting them made a conversation of pure prose announce "Artifacts 3" and offer
    // a menu of "How it ran" — the exact state the control exists to stay out of.
    expect(hub).toMatch(/canvasArtifacts\.filter\(\(a\) => a\.kind !== 'run'\)/);
    expect(hub).toMatch(/\{producedArtifacts\.length > 0 && \(/);
    expect(hub).toMatch(/\{producedGroups\.map\(\(g\) => \{/);
  });

  it('a per-product action a surface passes is a control the surface renders', () => {
    // `ProductStrip` declared onReplaceInImage and onPinMaterial and never destructured them,
    // so the canvas had been passing two handlers into nothing for as long as it had drawn the
    // component. Offered-vs-bound, one component wide: the call site reads as wired and the
    // button is simply absent.
    const strip = stripComments(read('src/components/features/ai/ProductStrip.tsx'));
    const declared = [...strip.matchAll(/^\s{2}(on[A-Z]\w*)\?:/gm)].map((m) => m[1]);
    expect(declared.length, 'no action props found — re-point this guard').toBeGreaterThan(2);
    const destructured = between(strip, 'export const ProductStrip', '}) => {');
    for (const prop of declared) {
      expect(destructured, `ProductStrip accepts ${prop} and never reads it`).toContain(prop);
      expect(strip, `ProductStrip reads ${prop} but renders no control for it`)
        .toContain(`{${prop} &&`);
    }
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
      .toMatch(/onClose\(\);\s*onAsk\(/);
    // The sentence goes into the conversation as an ordinary message, read against the END of
    // it — so "is this priced right?" asked about a quote reopened from six turns ago would be
    // answered about the latest turn unless the ask names what is open.
    expect(submit, 'the ask must name the artifact it is about').toContain('About the ${about}');
    // …and an abandoned sentence belongs to the artifact it was typed about: the component
    // stays mounted across opens, so it is one keypress from being sent about the wrong thing.
    expect(canvas).toMatch(/setAsk\(''\); \}, \[activeId\]\)/);
  });

  it('the artifacts list is the way back to an earlier result', () => {
    // The tab strip used to be the only way; without it this is, so it must enumerate the same
    // groups the modal draws from rather than keep its own idea of what exists.
    expect(hub).toMatch(/producedGroups\.map\(\(g\) => \{/);
    expect(hub).toContain('artifactKindLabel(');
  });
});
