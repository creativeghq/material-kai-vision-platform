/**
 * A capability gated on an optional prop must be offered by EVERY host — or have ONE wiring site.
 *
 * THE DEFECT THIS EXISTS FOR
 * --------------------------
 * `InboundDocActionsMenu` gates entries on the handler being supplied:
 *
 *     const canAddDetail = needsDetail && … && !!onAddLineDetail && …;
 *     {canAddDetail && <DropdownMenuItem onClick={onAddLineDetail}>Add line detail</…>}
 *
 * A host that omits the prop does not get a disabled entry, or an error, or a type failure — the
 * entry is NOT THERE. The props must stay optional for the component to degrade, so the type
 * system cannot see the omission, and a render test would have to prove a negative about a
 * dropdown that is closed. Two tables rendered that menu, one passed `onAddLineDetail` and the
 * other never had, and "say what was actually on this document" was unreachable from two of three
 * surfaces on 1,161 of 1,769 received documents.
 *
 * `inboundDocActionsParity.test.ts` is that rule at one component. This is the rule everywhere,
 * and it caught three more (#378 F1–F3):
 *
 *   • `RecordPaymentDialog` — `fiscalDocKind` OFFERED the myDATA rows and `onIssueDoc` PERFORMED
 *     the filing, as two independent optionals. Pass the first without the second and the operator
 *     picks "Issue a retail receipt (ΑΛΠ) to myDATA", the payment saves, and nothing is issued
 *     under a success toast. Folded into one `issueDoc` object, so the pair is a type error.
 *   • `ContactSearchDropdown` / `CompanySearchDropdown` — `allowCreate` off on the three screens
 *     where a party that does not exist yet actually turns up. The dropdown IS the duplicate
 *     check, so its absence does not stop a create; it moves the create somewhere unchecked.
 *   • `PipelineBoard` — `canManageTypes` off on Real Estate, so its empty state said "Add one and
 *     its board appears here" with `action={undefined}`. Note `emptyStates.test.ts` could not see
 *     that: the surface IS `HubEmptyState` and it DOES pass `action` — conditionally, at one host.
 *
 * WHAT IT CHECKS, AND THE TWO REFINEMENTS THAT KEEP IT HONEST
 * ----------------------------------------------------------
 * For every component with two or more hosts: a prop that is optional AND used as a render gate
 * must be passed by all of them or none of them.
 *
 *   1. CO-GATED PROPS ARE ONE GROUP. `HubDataTable` computes
 *      `selectable = !!selected && !!onSelectedChange`, so a host that passes NEITHER has opted out
 *      of selection cleanly. Judging each prop alone reports that as a defect. A host must pass all
 *      of a group or none of it.
 *   2. A DEGENERATE MOUNT IS NOT A HOST. `IndustrySelect` renders a `readOnly` placeholder while it
 *      loads, with no options and a no-op handler. Requiring the create handler there is asking a
 *      spinner to offer a capability.
 *
 * Source-text on purpose, for the reason the inbound test already gives: the props are optional by
 * design and must stay that way.
 */
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
  'ProductDetailModal.onUseIn3DScene':
    'OPEN, tracked as #378 F4. The handler pushes its result into the agent chat stream, so outside '
    + 'the chat there is nowhere for the output to land. Needs a destination before a prop.',
  'ProductDetailModal.onGenerateVR': 'OPEN, #378 F4 — see onUseIn3DScene.',
  'ProductDetailModal.onGenerateVideo': 'OPEN, #378 F4 — see onUseIn3DScene.',
  'WorldViewer.onRetry':
    'PublicListingPage is correct to withhold it: retrying spends credits and a visitor must not. '
    + 'PropertyWorkbench is a real gap (#378 F5) — retry needs the source image off `vr_worlds`, '
    + 'which the workbench does not read yet.',
  'ProgressiveImageGrid.onZoneSelectedForReplacement':
    'The second mount is the direct-image modal (`jobId=""`, `modelCount={0}`), which shows one '
    + 'finished image rather than a job grid — there are no zones to select.',
  'PresetLighting.showBackground':
    'A lighting rig, not a capability: the room planner and the AR preview composite over their own '
    + 'scene, and painting the HDRI behind them would replace it.',
  'ProductCard.allowEmbeddedRetail':
    'Retail offers are shown where a retailer link is in scope (agent results), not on the public '
    + 'tools pages, which have no retailer context to resolve.',
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
  const patterns = [/!!\s*(\w+)/g, /\b(\w+)\s*&&/g, /Boolean\(\s*(\w+)\s*\)/g];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) if (optional.has(m[1])) gated.add(m[1]);
  }
  // A prop given a truthy default in the destructure is not withholdable.
  return new Set([...gated].filter((p) => !new RegExp(`\\b${p}\\s*=\\s*true`).test(src)));
}

/**
 * Refinement 1 — a gate that also needs host-owned STATE is configuration, not a capability.
 *
 * `HubDataTable` computes `selectable = !!selected && !!onSelectedChange`, where `selected` is the
 * Set of ids the HOST owns. A host with no selection state cannot opt in and has not silently lost
 * anything: bulk selection is a feature you wire up, not one the component decides to hide from
 * you. Contrast the shape this file exists for — `onAddLineDetail`, `allowCreate`,
 * `canManageTypes`, `issueDoc` — where the host supplies no data at all and the prop is purely a
 * switch, so omitting it can only ever be an oversight.
 *
 * So: a gating prop co-gated with a non-handler, non-flag optional prop is DROPPED from the check.
 */
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

/** Opening-tag text for every `<Name …>` in a source file. */
function openingTags(src: string, name: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${name}(?![A-Za-z0-9_])`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let depth = 0;
    let quote: string | null = null;
    let tag = '';
    for (let i = m.index + m[0].length; i < src.length; i++) {
      const c = src[i];
      tag += c;
      if (quote) { if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth <= 0) break;
    }
    out.push(tag);
  }
  return out;
}

const passes = (tag: string, prop: string) => new RegExp(`\\b${prop}(\\s*[=}]|\\s*/?>)`).test(tag);
/** Refinement 2 — a read-only/disabled placeholder is not a host that withheld a capability. */
const degenerate = (tag: string) => /\breadOnly(\s*[/>]|\s*$)/.test(tag) || /\breadOnly=\{true\}/.test(tag);
/** A spread could be carrying the prop; the scan cannot see through it, so it does not convict. */
const spreads = (tag: string) => /\{\s*\.\.\./.test(tag);

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
      const tags: string[] = [];
      for (const [hostFile, hostSrc] of SOURCES) {
        if (hostFile === file) continue;
        for (const tag of openingTags(hostSrc, name)) {
          if (degenerate(tag) || spreads(tag)) continue;
          tags.push(`${relative(ROOT, hostFile)} ${tag}`);
        }
      }
      if (tags.length < 2) continue;

      for (const unit of units) {
        if (unit.some((p) => EXEMPT[`${name}.${p}`])) continue;
        const on: string[] = [];
        const off: string[] = [];
        for (const entry of tags) {
          const [host, tag] = entry.split(' ');
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

  it('the fiscal pair travels as one object, so it cannot be half-passed', () => {
    // #378 F1 in its permanent form: `fiscalDocKind` offered the myDATA rows and `onIssueDoc`
    // performed the filing. Two optionals meant a caller could offer a document it could not
    // issue. This is the shape that must not come back.
    const dialog = SOURCES.get(join(SRC, 'modules', 'finance', 'components', 'RecordPaymentDialog.tsx'));
    expect(dialog, 'RecordPaymentDialog moved — re-point this check').toBeTruthy();
    expect(dialog, 'the offer and the issuer are separate props again').not.toMatch(/\bfiscalDocKind\?\s*:/);
    expect(dialog, 'the offer and the issuer are separate props again').not.toMatch(/\bonIssueDoc\?\s*:/);
    expect(dialog!, 'issueDoc must carry BOTH the kind and the issuer').toMatch(
      /issueDoc\?\s*:\s*\{[\s\S]*?kind:[\s\S]*?issue:[\s\S]*?\}/,
    );
  });
});
