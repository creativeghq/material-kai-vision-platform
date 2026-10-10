/** A figure the collector could not fetch is UNKNOWN, and says so (#395, CLAUDE.md rule 3). */
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
const gscPanel = read('src/components/core/Profile/WebsiteGscPanel.tsx');

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
    expect(panel).toContain('source_status?.backlinks');
    // Every backlink figure goes through the verdict rather than printing a bare em dash.
    for (const label of ['Backlinks', 'Referring domains', 'Domain rank', 'Spam score', 'Broken backlinks']) {
      expect(panel, label).toContain(`<Figure label="${label}" value={s.`);
    }
    expect(panel.match(/status=\{blStatus\} \/>/g) ?? []).toHaveLength(6);
  });

  it('the "no links" empty state is not shown when the list FAILED', () => {
    // Otherwise a broken collector tells the reader nobody links to them.
    expect(panel).toContain(`listFailed = listStatus === 'failed'`);
    expect(panel).toMatch(/listFailed\s*\?\s*'Could not fetch/);
  });

  it('the tracker records a verdict for every source, and a refusal is a failure', () => {
    for (const source of ['overview', 'backlinks', 'ranked', 'backlink_list']) {
      expect(tracker, source).toContain(`settle('${source}'`);
    }
    expect(tracker).toContain(`sourceStatus[key] = 'failed'`);
    // MIVAA answers HTTP 200 + success:false + raw:{} on a DataForSEO 402: that must throw.
    expect(tracker).toContain('if (parsed?.success !== true)');
    expect(tracker).toMatch(/source_status: sourceStatus/);
    expect(tracker).toMatch(/source_errors: sourceErrors/);
  });

  it('and the client type carries it, so it cannot be dropped in the service layer', () => {
    expect(service).toMatch(/source_status\?: Record<string, string> \| null;/);
    expect(service).toMatch(/source_errors\?: Record<string, string> \| null;/);
  });
});

describe('#395 — Search Console figures are a value or a stated reason', () => {
  it('the panel asks the RPC whether the totals mean anything', () => {
    // Before: `t?.clicks ?? 0` over an RPC that coalesced to zero, so a never-synced site read
    // "0 clicks, 0 impressions, 0.0% CTR, Avg position 0.0" — and position 0.0 is better than
    // first place.
    expect(gscPanel).toMatch(/sourceStatusPresentation/);
    for (const label of ['Clicks', 'Impressions', 'Avg CTR', 'Avg position']) {
      expect(gscPanel, label).toContain(`<GscMetric label="${label}"`);
    }
    expect(gscPanel, 'a raw zero-defaulted metric is back')
      .not.toMatch(/<Metric label="Avg position" value=\{\(t\?\.position \?\? 0\)/);
  });

  it('every one of the four is given the verdict, not just some', () => {
    const uses = gscPanel.match(/status=\{summary\?\.status\}/g) ?? [];
    expect(uses).toHaveLength(4);
  });

  it('the type carries the verdict so the service cannot drop it', () => {
    expect(service).toMatch(/status\?: 'ok' \| 'no_data' \| 'not_collected' \| string;/);
    expect(service).toMatch(/rows\?: number;/);
  });
});
