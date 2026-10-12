import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

const INTEGRATIONS = [
  { file: 'supabase/functions/gsc-api/index.ts', prefix: 'gsc' },
  { file: 'supabase/functions/real-estate-calendar/index.ts', prefix: 'realestate_calendar' },
  { file: 'supabase/functions/gmail-api/index.ts', prefix: 'mail_account' },
] as const;

describe.each(INTEGRATIONS)('$file keeps the Google refresh token in Vault', ({ file, prefix }) => {
  const src = read(file);

  it('stores a new refresh token through the Vault RPC', () => {
    expect(src).toContain(`rpc('${prefix}_store_refresh_token'`);
  });

  it('never writes or reads a refresh token as a table column', () => {
    expect(src).not.toMatch(/refresh_token:\s*tok\.refresh_token/);
    expect(src).not.toMatch(/conn\??\.refresh_token\b/);
    expect(src).not.toMatch(/select\([^)]*\brefresh_token\b/);
    expect(src).not.toMatch(/\.not\('refresh_token'/);
  });
});

describe('a disconnect forgets the Vault secret', () => {
  it.each([
    ['supabase/functions/gsc-api/index.ts', 'gsc_forget_token'],
    ['supabase/functions/real-estate-calendar/index.ts', 'realestate_calendar_forget_token'],
  ])('%s calls %s', (file, rpc) => {
    expect(read(file)).toContain(`rpc('${rpc}'`);
  });
});
