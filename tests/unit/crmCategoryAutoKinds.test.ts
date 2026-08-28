import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { AUTO_CATEGORY_KINDS, isHandAssignableKind } from '@/services/crmCategoryKinds';

/**
 * "Who is an employee" is DERIVED, and the write path has to say so (#353 CRM-22).
 *
 * `role` (from `workspace_members.role`) and `employment` (from `hr_employees`) are AUTO kinds:
 * `crm_resync_auto_category_members` derives their membership and only ever deletes rows it
 * wrote itself (`source='auto'`). A MANUAL row in one of those categories is therefore
 * permanent — a category that says "Sales Managers" while holding somebody who is not one, and
 * which the resync will never reclaim.
 *
 * The list page filtered its options through `isHandAssignableKind`. The SERVICE took a raw
 * category id and wrote it. CLAUDE.md's rule for that exact shape: the offer and the gate must
 * read the same answer.
 */

const ROOT = join(__dirname, '..', '..');
const SERVICE = 'src/services/crmCategoriesService.ts';
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

describe('#353 CRM-22 — the auto kinds are enforced, not just hidden', () => {
  const src = code(SERVICE);

  it('the vocabulary still names both derived kinds', () => {
    // If one drops out, its category silently becomes hand-assignable everywhere at once.
    expect([...AUTO_CATEGORY_KINDS].sort()).toEqual(['employment', 'role']);
    expect(isHandAssignableKind('role')).toBe(false);
    expect(isHandAssignableKind('employment')).toBe(false);
    expect(isHandAssignableKind('manual')).toBe(true);
  });

  it('every membership write checks first', () => {
    // All four, not just `addMember`: the three `setMembershipsFor*` methods each take a raw
    // list of category ids and reconcile it, so any one of them could write the row.
    for (const method of [
      'async addMember(',
      'async setMembershipsForUser(',
      'async setMembershipsForContact(',
      'async setMembershipsForCompany(',
    ]) {
      const i = src.indexOf(method);
      expect(i, `${method} not found`).toBeGreaterThan(-1);
      // The check must come before the first write in that method.
      const body = src.slice(i, i + 1400);
      const check = body.indexOf('assertHandAssignable');
      const write = Math.min(
        ...[body.indexOf('.insert('), body.indexOf('.delete(')].filter((n) => n > -1),
      );
      expect(check, `${method} does not call assertHandAssignable`).toBeGreaterThan(-1);
      expect(check < write, `${method} writes before it checks`).toBe(true);
    }
  });

  it('the check fails closed on a failed lookup', () => {
    // Falling through to the write would leave the trigger to reject it with a raw
    // check_violation three layers up, which is exactly the message this exists to replace.
    const fn = src.slice(src.indexOf('async assertHandAssignable'), src.indexOf('async addMember'));
    expect(fn).toMatch(/if \(error\) throw new Error/);
  });

  it('the message points at where the answer actually lives', () => {
    // A refusal that does not say "change it in Profile → Team" just reads as a broken button.
    const raw = readFileSync(join(ROOT, SERVICE), 'utf8');
    const fn = raw.slice(raw.indexOf('async assertHandAssignable'), raw.indexOf('async addMember'));
    expect(fn).toContain('Profile → Team');
    expect(fn).toContain('HR roster');
  });

  it('it reads the shared rule rather than restating the kinds', () => {
    // A hand-written `kind === 'role' || kind === 'employment'` here is a second copy of
    // AUTO_CATEGORY_KINDS, and the two would disagree the first time a third kind is added.
    const fn = src.slice(src.indexOf('async assertHandAssignable'), src.indexOf('async addMember'));
    expect(fn).toContain('isHandAssignableKind');
    expect(fn).not.toMatch(/'role'|'employment'/);
  });
});
