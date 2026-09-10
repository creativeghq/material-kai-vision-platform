/** A per-workspace credential table is written through a DEFINER RPC, never by upsert. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const revolut = read('src/modules/banking-revolut/services/revolutConfigService.ts');
const viva = read('src/modules/payments-viva/services/vivaConfigService.ts');

describe('the two provider config saves', () => {
  it('call their DEFINER RPC', () => {
    expect(revolut).toContain("supabase.rpc('save_workspace_revolut_config'");
    expect(viva).toContain("supabase.rpc('save_workspace_viva_config'");
  });

  it('no longer upsert the config table', () => {
    expect(revolut).not.toContain("from('workspace_revolut_config')");
    expect(viva).not.toContain("from('workspace_viva_config')");
  });

  it('send null for a blank field so a re-save cannot wipe a stored secret', () => {
    // The RPCs read NULL as "leave what is stored alone". Sending '' instead would overwrite a
    // saved credential with an empty string every time somebody pressed Save.
    for (const [name, src] of [['revolut', revolut], ['viva', viva]] as const) {
      expect(src, `${name} must map blank -> null`).toMatch(
        /const blank = \(v: string \| undefined\) => \(v === undefined \|\| v\.trim\(\) === '' \? null : v\)/,
      );
    }
  });
});

/**
 * The general rule, so the next credential table does not repeat it.
 *
 * Scoped to `workspace_*_config` because that is the shape with the property that matters: a table
 * whose secrets must never be readable by the client, and which therefore cannot have the SELECT
 * policy an upsert needs. A table the client CAN read is free to upsert.
 */
describe('no client-side upsert on a workspace credential table', () => {
  const files: string[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(p)) files.push(p);
    }
  })(join(ROOT, 'src'));

  /**
   * Shrink-only, one stated reason each.
   *
   * `workspace_email_config` carries a permissive `FOR ALL` policy, and a FOR ALL policy also
   * grants SELECT — so its upsert can read the conflicting row and genuinely works. It is exempt
   * from THIS failure, not endorsed: handing the client a whole credential row is still the
   * mass-assignment shape, and the same FOR ALL policy means a member can read the stored Resend
   * key. Moving it to an RPC is the right fix whenever that table is next touched.
   */
  const EXEMPT: Record<string, string> = {
    'src/modules/email/services/emailService.ts':
      'workspace_email_config has a permissive FOR ALL policy, which covers SELECT, so the upsert works.',
  };

  it('every offender writes through an RPC instead', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = stripComments(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
      // `.from('workspace_<x>_config')` followed by `.upsert(` within a few lines.
      const re = /from\(\s*['"]workspace_[a-z_]+_config['"]\s*\)[\s\S]{0,200}?\.upsert\(/g;
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (re.test(src) && !EXEMPT[rel]) offenders.push(rel);
    }
    expect(
      offenders,
      'These upsert a credential table that has no SELECT policy, so the write fails with '
      + '"new row violates row-level security policy" the moment a row exists. Add a SECURITY '
      + 'DEFINER save RPC with one parameter per allowed column and call that instead.',
    ).toEqual([]);
  });
});
