import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { fillImageSlot, imageSlots, removeImageSlot } from '@/services/seo/imageSlots';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('#401 W3.2 — a refresh drafts, a person applies', () => {
  const src = read('supabase/functions/seo-api/handlers/refresh.ts');
  const run = src.slice(src.indexOf('async function runRefresh('));

  it('reserves credits before the model call and settles after', () => {
    const reserve = run.indexOf('await reserveStage(');
    const call = run.indexOf('await callClaudeMessages(');
    const settle = run.indexOf('await settleStage(');
    expect(reserve).toBeGreaterThan(-1);
    expect(reserve).toBeLessThan(call);
    expect(call).toBeLessThan(settle);
  });

  it('the prompt is a database row and the output is schema-constrained', () => {
    expect(run).toContain("getToolPrompt(supabase, 'seo_article_refresher')");
    expect(run).toMatch(/output_config: \{ effort: 'low', format: \{ type: 'json_schema', schema: SCHEMA \} \}/);
    expect(run).toMatch(/res\.stop_reason === 'refusal'/);
  });

  it('every drafted change is a pending suggestion, never applied to the text', () => {
    expect(run).toContain("status: 'pending'");
    expect(run).not.toMatch(/applySuggestion\(/);
    expect(run).not.toMatch(/markdown_content:/);
  });

  it('a title/meta applies itself only with the workspace setting AND a live CMS post', () => {
    const auto = src.slice(src.indexOf('async function maybeAutoApplyMeta('));
    expect(auto).toMatch(/if \(!ctx\.workspaceId \|\| !ctx\.row\.publish_external_id \|\| !ctx\.row\.published_at\) return false;/);
    expect(auto).toMatch(/auto_apply_meta !== true\) return false;/);
  });

  it('the weekly sweep only refreshes articles that slipped, a few per site, in the background', () => {
    const cron = read('supabase/functions/seo-content-freshness/index.ts');
    expect(cron).toContain("const REFRESH_REASONS = new Set(['position_drop', 'clicks_drop'])");
    expect(cron).toContain('REFRESH_PER_SITE');
    expect(cron).toMatch(/action: 'refresh'[^}]*background: true/);
  });
});

describe('#401 W2.4 — picture slots', () => {
  const md = 'Intro.\n\n[IMAGE: Μπάνιο με πλακάκια | a bright bathroom with large porcelain tiles]\n\nMore.';

  it('reads, fills and removes a slot', () => {
    const [slot] = imageSlots(md);
    expect(slot).toMatchObject({ alt: 'Μπάνιο με πλακάκια', prompt: 'a bright bathroom with large porcelain tiles' });
    expect(fillImageSlot(md, slot, 'https://x.supabase.co/storage/v1/object/public/generation-images/a.png'))
      .toContain('![Μπάνιο με πλακάκια](https://x.supabase.co/storage/v1/object/public/generation-images/a.png)');
    expect(imageSlots(removeImageSlot(md, slot))).toHaveLength(0);
  });

  it('publishing refuses an empty slot and copies our images into the site', () => {
    const pub = read('supabase/functions/seo-publish/index.ts');
    const handler = pub.slice(pub.indexOf('async function handlePublish('));
    expect(handler.indexOf('EMPTY_IMAGE_SLOT')).toBeLessThan(handler.indexOf("wp(creds, 'POST', '/wp/v2/posts', payload)"));
    expect(handler).toContain('await uploadImage(creds, ours)');
    expect(pub).toMatch(/if \(new URL\(ourUrl\)\.host !== own\)/);
  });
});

describe('#401 W2.4 — a page that already ranks is updated, not duplicated', () => {
  it('the pipeline refuses before creating the article row', () => {
    const p = read('supabase/functions/seo-api/handlers/pipeline.ts');
    const gate = p.indexOf('searchConsoleOnly: true');
    const insert = p.indexOf("const { data: articleRow, error: insertError }");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(insert);
  });
});
