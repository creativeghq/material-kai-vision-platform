/** A capability gated on an optional prop must be offered by EVERY host — or have ONE wiring site. */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/**
 * Deliberate asymmetries. Each entry names the component, the prop, and WHY a host may withhold
 * it — the claim has to be checkable by the next reader. SHRINK-ONLY: an entry comes off when the
 * capability is given a home, never on to quieten a new one.
 */
const EXEMPT: Record<string, string> = {
  'OrderLinkPicker.allowCostOf':
    'Each mount is a SEPARATE labelled control writing ONE column — Project, Trip, Property, For '
    + 'customer. The groups are off per control by design, and the one control that tried to write '
    + 'two columns printed a customer order number under the word "Project".',
  'OrderLinkPicker.allowProperty':
    'Same per-control design, plus: `invoices` has no `property_id`, so InvoiceActionsMenu offering '
    + 'the group would ship a row that silently does nothing — the failure the picker exists to avoid.',
  'ProductDetailModal.onGenerateVR':
    'Both of these SPEND CREDITS and their output has nowhere to land outside the agent chat yet '
    + '(#378 F4 / N7 — `generation_videos` links to no product, project or moodboard). A button '
    + 'that starts a paid job with no surface to show the result is worse than no button. The '
    + 'third action of that row, "place it in a room", needed no prop at all in the end: the Room '
    + 'Planner already accepts `?product=`, so the modal does it BY DEFAULT and the handler is '
    + 'only an override.',
  'ProductDetailModal.onGenerateVideo': 'See onGenerateVR — same credits, same missing surface.',
  'WorldViewer.onRetry':
    'PublicListingPage withholds it BECAUSE retrying spends 18 credits and an anonymous visitor '
    + 'must not be able to. PropertyWorkbench was the real gap and now passes it, gated on '
    + '`editable`, running the same `startWalkthrough` the Create button runs (#378 F5).',
  'ProgressiveImageGrid.onZoneSelectedForReplacement':
    'The second mount is the direct-image modal (`jobId=""`, `modelCount={0}`), which shows one '
    + 'finished image rather than a job grid — there are no zones to select.',
  'PresetLighting.showBackground':
    'A lighting rig, not a capability: the room planner and the AR preview composite over their own '
    + 'scene, and painting the HDRI behind them would replace it.',
  'ProductCard.allowEmbeddedRetail':
    'Retail offers are shown where a retailer link is in scope (agent results), not on the public '
    + 'tools pages, which have no retailer context to resolve.',
  'WorkflowInlineForm.onCancel':
    'The wizard gives the step RICHER escapes than a Cancel, in its own footer rather than in the '
    + 'form: "Or describe in your own words" (which swaps the structured form for free prose) and '
    + '"Skip step" when the step is skippable. In AgentHub the form is standalone, so cancelling '
    + 'means clearing the awaiting-input state; inside a wizard step that has no defined meaning — '
    + 'skip the step, or abort the run, both of which exist and say which they are.',
};

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(e)) walk(p, out); }
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const FILES = walk(SRC);
const SOURCES = new Map(FILES.map((f) => [f, blankComments(readFileSync(f, 'utf8'))]));

/** Optional props declared in a file: `onFoo?:` / `allowFoo?: boolean`. */
function optionalProps(src: string): Set<string> {
  return new Set([
    ...[...src.matchAll(/\b(on[A-Z]\w*)\?\s*:/g)].map((m) => m[1]),
    ...[...src.matchAll(/\b((?:allow|can|show|enable)[A-Z]\w*)\?\s*:\s*boolean/g)].map((m) => m[1]),
  ]);
}

/** Every optional prop, whatever its name — used only to recognise co-gated STATE (below). */
function allOptionalProps(src: string): Set<string> {
  return new Set([...src.matchAll(/\b([a-z]\w*)\?\s*:/g)].map((m) => m[1]));
}

/** Of those, the ones used as a RENDER GATE rather than merely read. */
function gatingProps(src: string, optional: Set<string>): Set<string> {
  const gated = new Set<string>();

  for (const line of src.split('\n')) {
    // `!!prop` / `Boolean(prop)` — the deliberate coercion, always a gate wherever it sits.
    for (const re of [/!!\s*(\w+)/g, /Boolean\(\s*(\w+)\s*\)/g]) {
      for (const m of line.matchAll(re)) if (optional.has(m[1])) gated.add(m[1]);
    }

    // `prop && …` — a gate unless it is the condition of an `if`, where the control still
    // renders and the prop only decides which branch runs.
    for (const m of line.matchAll(/\b(\w+)\s*&&/g)) {
      if (!optional.has(m[1])) continue;
      if (/\bif\s*\(/.test(line.slice(0, m.index))) continue;
      gated.add(m[1]);
    }

    // `prop ? <JSX…> : undefined | null` — renders NOTHING when withheld, which is exactly the
    // `HubEmptyState action={canManageTypes ? <Button/> : undefined}` shape that `emptyStates`
    // cannot see.
    for (const m of line.matchAll(/\b(\w+)\s*\?\s*<[^?]*?:\s*(undefined|null)\b/g)) {
      if (optional.has(m[1])) gated.add(m[1]);
    }
  }

  // A prop given a truthy default in the destructure is not withholdable.
  return new Set([...gated].filter((p) => !new RegExp(`\\b${p}\\s*=\\s*true`).test(src)));
}

/** Refinement 1 — a gate that also needs host-owned STATE is configuration, not a capability. */
function stateBackedGates(src: string, gated: Set<string>, everyOptional: Set<string>): Set<string> {
  const dropped = new Set<string>();
  const isSwitch = (p: string) => /^(on[A-Z]|allow|can|show|enable)/.test(p);
  for (const m of src.matchAll(/!!\s*(\w+)\s*&&\s*!!\s*(\w+)/g)) {
    const [, a, b] = m;
    const pair = [a, b];
    if (!pair.some((p) => gated.has(p))) continue;
    // One side is host-supplied state → the whole gate is configuration.
    if (pair.some((p) => everyOptional.has(p) && !isSwitch(p))) for (const p of pair) dropped.add(p);
  }
  return dropped;
}

/**
 * Opening-tag text for every `<Name …>` in a source file, plus whether the tag prop-SPREADS.
 *
 * The spread flag has to be depth-aware. A first cut tested the whole tag for `{...`, which also
 * matches an ordinary object spread inside a handler — `onCancel={() => setWorkflows((prev) => ({
 * ...prev, … }))}` — so a host that passed the prop was silently dropped from the comparison, the
 * component fell to one host, and the check skipped it. It hid a real asymmetry
 * (`WorkflowInlineForm.onCancel`) behind a rule meant to avoid false positives.
 */
function openingTags(src: string, name: string): Array<{ tag: string; spreads: boolean }> {
  const out: Array<{ tag: string; spreads: boolean }> = [];
  const re = new RegExp(`<${name}(?![A-Za-z0-9_])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote: string | null = null;
    let tag = '';
    let spreads = false;
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const c = src[i];
      tag += c;
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') {
        // A JSX prop-spread is `{...x}` at the top level of the tag. Anything deeper is an
        // object literal inside a prop value and says nothing about which props are passed.
        if (depth === 0 && /^\{\s*\.\.\./.test(src.slice(i, i + 8))) spreads = true;
        depth++;
      } else if (c === '}') depth--;
      else if (c === '>' && depth <= 0) break;
    }
    out.push({ tag, spreads });
  }
  return out;
}

const passes = (tag: string, prop: string) => new RegExp(`\\b${prop}(\\s*[=}]|\\s*/?>)`).test(tag);
/** Refinement 2 — a read-only/disabled placeholder is not a host that withheld a capability. */
const degenerate = (tag: string) => /\breadOnly(\s*[/>]|\s*$)/.test(tag) || /\breadOnly=\{true\}/.test(tag);

interface Violation { component: string; group: string[]; on: string[]; off: string[] }

function findViolations(): Violation[] {
  const found: Violation[] = [];
  for (const [file, src] of SOURCES) {
    const optional = optionalProps(src);
    if (!optional.size) continue;
    const gatedAll = gatingProps(src, optional);
    if (!gatedAll.size) continue;

    const configuration = stateBackedGates(src, gatedAll, allOptionalProps(src));
    const units: string[][] = [...gatedAll].filter((p) => !configuration.has(p)).map((p) => [p]);
    if (!units.length) continue;

    const names = new Set<string>();
    for (const m of src.matchAll(/export\s+(?:const|function)\s+([A-Z]\w*)/g)) names.add(m[1]);

    for (const name of names) {
      const mounts: Array<{ host: string; tag: string }> = [];
      for (const [hostFile, hostSrc] of SOURCES) {
        if (hostFile === file) continue;
        for (const { tag, spreads } of openingTags(hostSrc, name)) {
          // A real prop-spread could be carrying the prop and the scan cannot see through it.
          if (degenerate(tag) || spreads) continue;
          mounts.push({ host: relative(ROOT, hostFile), tag });
        }
      }
      if (mounts.length < 2) continue;

      for (const unit of units) {
        if (unit.some((p) => EXEMPT[`${name}.${p}`])) continue;
        const on: string[] = [];
        const off: string[] = [];
        for (const { host, tag } of mounts) {
          // A group is "offered" when the host passes ANY of it; withheld when it passes none.
          if (unit.some((p) => passes(tag, p))) on.push(host); else off.push(host);
        }
        if (on.length && off.length) found.push({ component: name, group: unit, on: [...new Set(on)], off: [...new Set(off)] });
      }
    }
  }
  return found;
}

describe('a gated capability is offered by every host', () => {
  it('the scan can see its haystack', () => {
    // A scan that reads nothing convicts nothing, and would pass silently forever.
    expect(FILES.length, 'no .tsx files found under src/ — the walk is broken').toBeGreaterThan(500);
  });

  it('no optional render-gate prop is passed by some hosts and withheld by others', () => {
    const violations = findViolations();
    const report = violations.map((v) =>
      `  ${v.component} · ${v.group.join(' + ')}\n`
      + `      offered by: ${v.on.join(', ')}\n`
      + `      withheld by: ${v.off.join(', ')}`).join('\n');
    expect(
      violations,
      'These hosts render the component WITHOUT a prop its own body uses as a render gate, so the\n'
      + 'capability is absent there — not disabled, not an error, not a type failure:\n\n'
      + `${report}\n\n`
      + 'Fix it by passing the prop, by giving the component ONE wiring site (see\n'
      + '`useInboundDocActions`), or — if the asymmetry is deliberate — add it to EXEMPT with the\n'
      + 'reason a reader can check.',
    ).toEqual([]);
  });

  it('every exemption still describes something real', () => {
    // An allowlist nobody prunes becomes a second source of truth. An entry whose component or
    // prop no longer exists is stale and must go.
    const stale: string[] = [];
    for (const key of Object.keys(EXEMPT)) {
      const [component, prop] = key.split('.');
      const declared = [...SOURCES.values()].some((src) =>
        new RegExp(`export\\s+(?:const|function)\\s+${component}\\b`).test(src)
        && new RegExp(`\\b${prop}\\?\\s*:`).test(src));
      if (!declared) stale.push(key);
    }
    expect(stale, `EXEMPT names props that no longer exist: ${stale.join(', ')}`).toEqual([]);
  });

  it('the fiscal offer is DERIVED from the order, not handed in by the host', () => {
    /**
     * #378 F1, in its final form. The offer (`fiscalDocKind`, which put the myDATA rows in the
     * picker) and the issuer (`onIssueDoc`) were two independent optional props, so a caller could
     * offer a document it had no way to issue — and only one of seven surfaces passed either.
     */
    const dialog = SOURCES.get(join(SRC, 'modules', 'finance', 'components', 'RecordPaymentDialog.tsx'));
    expect(dialog, 'RecordPaymentDialog moved — re-point this check').toBeTruthy();

    // Written as literal regexes, NOT built from a template string: inside a template literal
    // `\b` is a backspace and `\s` is a bare `s`, so a hand-assembled `new RegExp(`\b${x}\?\s*:`)`
    // matches nothing and the check passes on every input. It did, until this was watched to fire.
    const PROP_DECLARATIONS: Array<[string, RegExp]> = [
      ['fiscalDocKind', /\bfiscalDocKind\?\s*:/],
      ['onIssueDoc', /\bonIssueDoc\?\s*:/],
      ['issueDoc', /\bissueDoc\?\s*:/],
    ];
    for (const [gone, re] of PROP_DECLARATIONS) {
      expect(
        dialog,
        `\`${gone}\` is a prop again. The offer must be derived from the selected order, not `
        + 'supplied by the host — otherwise the surfaces that pick an order inside the dialog can '
        + 'never offer it, which is how this ended up on one screen of seven.',
      ).not.toMatch(re);
    }

    expect(dialog!, 'the dialog must resolve the offer itself').toMatch(/resolveOrderIssueOffer\(/);
    expect(dialog!, 'the dialog must issue through the same module that offered').toMatch(
      /issueSalesDocumentForOrder\(/,
    );

    // The two halves live together, so they cannot drift apart again.
    const svc = readFileSync(join(SRC, 'modules', 'finance', 'services', 'financeService.ts'), 'utf8');
    expect(svc, 'resolveOrderIssueOffer must live beside the issue call').toMatch(
      /resolveOrderIssueOffer[\s\S]{0,4000}issueSalesDocumentForOrder/,
    );
    // A voided document must not block a re-issue — that is the state an operator voids INTO.
    expect(svc, 'the offer must ignore voided documents').toMatch(/neq\('status', 'void'\)/);
  });
});
