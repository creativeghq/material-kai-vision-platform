import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';
import { COPY_WARNING_CODES, COPY_WARNING_LABELS } from '../../src/config/writingVocabulary';

const ROOT = process.cwd();
const src = (p: string) => strippedSource(join(ROOT, p));

describe('content quality ledger', () => {
  it.each([
    ['supabase/functions/generate-social-content/index.ts', 'social_content_generation'],
    ['supabase/functions/generate-email-copy/index.ts', 'email_copy_generation'],
  ])('%s records its outputs after checking them, under the producer it bills as', (file, producer) => {
    const code = src(file);
    const check = code.indexOf('checkCopy(');
    const record = code.indexOf('recordContentOutputs(');
    expect(check).toBeGreaterThan(-1);
    expect(record).toBeGreaterThan(check);
    expect(code).toContain(`producer: '${producer}'`);
    expect(code).toContain(`task: '${producer}'`);
  });

  it('publishing and sending record the outcome after the work happened', () => {
    const pub = src('supabase/functions/zernio-api/handlers/publish.ts');
    expect(pub.indexOf('markContentOutcome(')).toBeGreaterThan(pub.indexOf('zernioApi('));
    const proc = src('supabase/functions/campaign-processor/index.ts');
    expect(proc.indexOf('markContentOutcome(')).toBeGreaterThan(proc.indexOf('campaignPreflight('));
  });

  it('the ledger never fails the generation it describes', () => {
    const lib = src('supabase/functions/_shared/content-outputs.ts');
    expect(lib).not.toMatch(/\bthrow\b/);
  });

  it('every copy warning code has a dashboard label, and the check uses the shared list', () => {
    for (const c of COPY_WARNING_CODES) expect(COPY_WARNING_LABELS[c]).toBeTruthy();
    const check = src('supabase/functions/_shared/copy-check.ts');
    expect(check).not.toMatch(/type CopyWarningCode\s*=/);
    expect(check).toContain("from './writingVocabulary.generated.ts'");
  });
});
