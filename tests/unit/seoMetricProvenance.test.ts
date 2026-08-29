/**
 * A figure the collector could not fetch is UNKNOWN, and says so (#395, CLAUDE.md rule 3).
 *
 * `seo-domain-tracker` records a verdict per source — `ok` | `no_data` | `failed` — in
 * `seo_domain_snapshots.source_status`, precisely so a reader can tell "the backlink index has
 * no record of this domain" from "the backlinks call failed". `get_website_domain_intel` returns
 * the whole row, so the verdict reaches the client.
 *
 * `WebsiteDomainIntelPanel` ignored it. Every snapshot for the one connected site has NULL
 * backlinks, and the panel printed `—` for all of them — the same statement as hiding the row,
 * which is the defect this panel was already fixed for once. (The live verdicts say
 * `backlinks: no_data`: a real answer, and one worth showing as "None" rather than as nothing.)
 *
 * The vocabulary is exercised for real — `seoMetrics.ts` is import-free — because the part that
 * matters is behavioural: an unrecognised status must fail CLOSED, and the collector's word
 * `failed` must land on the same presentation a metric's `collector_failed` does. A second
 * translation living in a panel is how these surfaces drifted apart the first time.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { sourceStatusPresentation, statusPresentation } from '../../src/components/core/Profile/seo/seoMetrics';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const panel = read('src/components/core/Profile/WebsiteDomainIntelPanel.tsx');
const tracker = read('supabase/functions/seo-domain-tracker/index.ts');
const service = read('src/services/userWebsitesService.ts');

describe('#395 — the collector verdict reaches the reader', () => {
  it('nothing to say when the source answered, or when there is no verdict at all', () => {
    // An old snapshot carries no verdict; inventing a reason there would be this defect inverted.
    expect(sourceStatusPresentation(null)).toBeNull();
    expect(sourceStatusPresentation(undefined)).toBeNull();
    expect(sourceStatusPresentation('')).toBeNull();
    expect(sourceStatusPresentation('ok')).toBeNull();
  });

  it("the collector's word for a failure lands on the metric vocabulary's word", () => {
    // The tracker writes `failed`; a metric says `collector_failed`. One mapping, here.
    expect(sourceStatusPresentation('failed')).toEqual(statusPresentation('collector_failed'));
    expect(sourceStatusPresentation('failed')!.placeholder).toBe('Unknown');
    expect(sourceStatusPresentation('failed')!.tone).toBe('warning');
  });

  it('"no data" is a real answer and reads as one, not as a fault', () => {
    const p = sourceStatusPresentation('no_data')!;
    expect(p.placeholder).toBe('None');
    expect(p.tone).toBe('neutral');
    expect(p.actionable).toBe(false);
  });

  it('an unrecognised verdict fails closed rather than showing the raw number', () => {
    const p = sourceStatusPresentation('something_new_from_a_future_tracker')!;
    expect(p.placeholder).toBe('Unknown');
    expect(p.explain).toMatch(/does not recognise/);
  });

  it('the panel asks for the verdict per source and renders it', () => {
    expect(panel).toMatch(/sourceStatusPresentation/);
    expect(panel, 'the panel maps the collector words itself again')
      .not.toMatch(/status === 'failed' \? 'collector_failed'/);
    for (const source of ['overview', 'backlinks']) {
      expect(panel, source).toContain(`sourceVerdict(s, '${source}')`);
    }
    // …and the four tiles go through it rather than printing a bare em dash.
    expect(panel).toMatch(/<Metric label="Backlinks" value=\{<MetricValue/);
    expect(panel).toMatch(/<Metric label="Ranking keywords" value=\{<MetricValue/);
  });

  it('the "no data for this domain" empty state is not shown when a source FAILED', () => {
    // Otherwise a broken collector tells the reader their site has no search visibility.
    expect(panel).toMatch(/sourceVerdict\(s, 'overview'\) !== 'failed'/);
    expect(panel).toMatch(/sourceVerdict\(s, 'backlinks'\) !== 'failed'/);
  });

  it('the tracker still records a verdict for all three sources', () => {
    // The reader can only be honest about what the writer recorded.
    for (const source of ['overview', 'backlinks', 'ranked']) {
      expect(tracker, source).toContain(`verdict('${source}'`);
    }
    expect(tracker).toMatch(/source_status: sourceStatus/);
    expect(tracker).toMatch(/source_errors: sourceErrors/);
  });

  it('and the client type carries it, so it cannot be dropped in the service layer', () => {
    expect(service).toMatch(/source_status\?: Record<string, string> \| null;/);
    expect(service).toMatch(/source_errors\?: Record<string, string> \| null;/);
  });
});
