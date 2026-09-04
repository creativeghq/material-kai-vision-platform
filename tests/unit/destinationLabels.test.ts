/**
 * A button that goes somewhere names the place by its TITLE.
 *
 * MEASURED 2026-09-04: BillingTab's empty state said "Go to quotes" and opened a tab titled
 * "Quotes"; the Quotes tab beside it said "Go to Quotes". One page, one place, two spellings — and
 * the lowercase one reads as a verb phrase ("go to quotes") rather than as a destination. Nothing
 * catches it: both are valid strings and both buttons work. Three more sat elsewhere ("Go to
 * sources", "Go to listings", "Go to platform"), each under a tab or nav item that is title-cased.
 *
 * Two rules, in order of strength:
 *
 *   1. A link to a PROJECT SECTION takes its label from `goToSectionLabel` — the same registry the
 *      page's strip renders from, so renaming a section renames every button that points at it.
 *      A hand-typed "Go to …" in a file that links to a section is exactly the drift this is for.
 *   2. Everywhere else, "Go to <Name>" is title-cased. Prose that says "Go to the Campaigns tab"
 *      is a sentence, not a label, and is left alone.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import {
  PROJECT_TABS, PROJECT_SECTION_LABELS, goToSectionLabel, projectSectionPath,
} from '../../src/modules/projects/projectSections';

const ROOT = join(__dirname, '..', '..');
const PAGE = 'src/modules/projects/pages/ProjectDetailPage.tsx';
const REGISTRY = 'src/modules/projects/projectSections.ts';

function sources(): Array<{ file: string; src: string }> {
  const out: Array<{ file: string; src: string }> = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', 'coverage']);
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(e.name)) continue;
      out.push({
        file: p.slice(ROOT.length + 1).replace(/\\/g, '/'),
        src: blankComments(readFileSync(p, 'utf8')),
      });
    }
  };
  walk(join(ROOT, 'src'));
  return out;
}

/** The file builds a link to a project section, by literal or through the helper. */
const LINKS_TO_SECTION = /\/projects\/[^'"`\s]*\?tab=|projectSectionPath\(/;
/** A "Go to …" written out rather than read from the registry. */
const HAND_TYPED = /Go to [A-Za-z]/;
/** "Go to listings" — a destination spelt as a common noun. `the` marks prose, which is allowed. */
const LOWERCASE_DESTINATION = /Go to (?!the\b)[a-z]/;

describe('a link to a place names it by its title', () => {
  it('the registry titles every section, title-cased, and builds the link', () => {
    for (const tab of PROJECT_TABS) {
      expect(PROJECT_SECTION_LABELS[tab], `no label for ${tab}`).toMatch(/^[A-Z]/);
    }
    expect(goToSectionLabel('quotes')).toBe('Go to Quotes');
    expect(projectSectionPath('p1', 'overview')).toBe('/projects/p1');
    expect(projectSectionPath('p1', 'requests', { request: 'r1' }))
      .toBe('/projects/p1?tab=requests&request=r1');
  });

  it('the page strip renders the registry labels, not a second copy', () => {
    const src = readFileSync(join(ROOT, PAGE), 'utf8');
    expect(src, `${PAGE} must import PROJECT_SECTION_LABELS from ${REGISTRY}`)
      .toMatch(/import \{[^}]*PROJECT_SECTION_LABELS[^}]*\} from '\.\.\/projectSections'/);
    expect(src, `${PAGE} must take PROJECT_TABS from ${REGISTRY} too`)
      .toMatch(/import \{[^}]*PROJECT_TABS[^}]*\} from '\.\.\/projectSections'/);
  });

  it('a file that links to a project section labels the link from the registry', () => {
    const offenders = sources()
      .filter(({ file }) => file !== REGISTRY)
      .filter(({ src }) => LINKS_TO_SECTION.test(src) && HAND_TYPED.test(src))
      .map(({ file }) => file);
    expect(
      offenders,
      'These files link to a project section and spell the destination by hand. Use '
      + `goToSectionLabel(tab) so the button reads what the tab reads:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('no "Go to <name>" anywhere spells the destination in lowercase', () => {
    const offenders = sources()
      .flatMap(({ file, src }) =>
        [...src.matchAll(new RegExp(LOWERCASE_DESTINATION.source, 'g'))]
          .map((m) => `${file}: "${src.slice(m.index, m.index! + 24).split('\n')[0]}…"`));
    expect(
      offenders,
      `A destination is a title — "Go to Listings", not "Go to listings":\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
