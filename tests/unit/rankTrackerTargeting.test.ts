import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blankComments } from '../helpers/stripComments';
import { captureShare } from '@/components/core/Profile/seo/serpFeatures';

const read = (p: string) => blankComments(readFileSync(join(__dirname, '..', '..', p), 'utf8'));
const TRACKER = read('supabase/functions/seo-rank-tracker/index.ts');
const SERVICE = read('src/services/userWebsitesService.ts');

describe('a tracked keyword is checked for its own device and city', () => {
  it('the tracker sends device and a city location_code to the SERP call', () => {
    const params = TRACKER.match(/params: \{([\s\S]*?)\n\s{6}\},/);
    expect(params, 'serp params block').not.toBeNull();
    expect(params![1]).toMatch(/device: kw\.device/);
    expect(params![1]).toMatch(/location_code: kw\.location_code/);
  });

  it('every SERP call passes the whole keyword target, not loose strings', () => {
    expect(TRACKER).not.toMatch(/serp\(kw\.keyword,/);
    expect(TRACKER).not.toMatch(/serpWithRetry\(kw\.keyword,/);
  });

  it('the add path writes device and location, and conflicts on the full target', () => {
    expect(SERVICE).toMatch(/device: target\.device,/);
    expect(SERVICE).toMatch(/location_code: target\.location\?\.location_code \?\? null/);
    expect(SERVICE).toMatch(/onConflict: 'website_id,keyword,country_code,device,location_code'/);
  });
});

describe('a capture day with no answered check is unknown, never 0%', () => {
  it('returns null shares when nothing answered', () => {
    expect(captureShare({ answered: 0, present: 0, owned: 0 })).toEqual({ present: null, owned: null });
  });

  it('divides by answered checks, not by keywords sent', () => {
    expect(captureShare({ answered: 4, present: 2, owned: 1 })).toEqual({ present: 0.5, owned: 0.25 });
  });
});
