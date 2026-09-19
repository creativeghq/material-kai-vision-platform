/** A create chip that lands on a list, and a form that opens with no role picked, fail the same way: the click "worked" and the record is wrong. */
import { describe, it, expect } from 'vitest';
import { posix, strippedSource, sourceIndex } from '../helpers/sourceIndex';
import { LAUNCHER_ACTIONS } from '@/config/launcher-sections';
import { CONTACT_TYPE_OPTIONS, NEW_CONTACT_KINDS } from '@/modules/crm/contactType';

const CRM_PAGE = 'src/modules/crm/pages/CRMPage.tsx';
const CONTACT_PAGE = 'src/modules/crm/pages/ContactDetailPage.tsx';
const MODAL = 'src/modules/crm/components/AddContactModal.tsx';
const INDEX = sourceIndex({ roots: ['src'] });

describe('launcher create actions', () => {
  it('every ?new= value is acted on where it is read', () => {
    // Windowed, not file-wide: an unrelated literal elsewhere in a reader would otherwise answer
    // for a value nobody compares against.
    const windows = INDEX.stripped().flatMap(([, src]) =>
      [...src.matchAll(/get\(\s*['"]new['"]\s*\)/g)].map((m) => src.slice(m.index!, m.index! + 400)));
    const inert: string[] = [];
    for (const [id, actions] of Object.entries(LAUNCHER_ACTIONS)) {
      for (const a of actions) {
        const value = new URLSearchParams(a.to.split('?')[1] ?? '').get('new');
        if (!value) continue;
        if (!windows.some((w) => w.includes(`'${value}'`) || w.includes(`"${value}"`))) {
          inert.push(`${id} → "${a.label}" (${a.to}): no page acts on new=${value}`);
        }
      }
    }
    expect(inert, inert.join('\n')).toEqual([]);
  });
});

describe('new contact asks the type first', () => {
  it('nothing but the modal reaches the blank form', () => {
    expect(strippedSource(CRM_PAGE)).toContain('AddContactModal');
    const bypass = INDEX.stripped()
      .filter(([, src]) => /['"`]\/crm\/contacts\/new['"`]/.test(src))
      .map(([file]) => posix(file))
      .filter((f) => f !== MODAL);
    expect(bypass, `these skip the type question the modal exists to ask: ${bypass.join(', ')}`).toEqual([]);
  });

  it('the form seeds itself from the choice', () => {
    expect(strippedSource(CONTACT_PAGE)).toMatch(/location\.state[\s\S]{0,120}prefill/);
    expect(strippedSource(MODAL)).toMatch(/state:\s*\{\s*prefill/);
  });

  it('every kind states both the side of the trade and the VAT treatment', () => {
    const legal = new Set<string | null>([...CONTACT_TYPE_OPTIONS.map((o) => o.value), null]);
    for (const kind of NEW_CONTACT_KINDS) {
      expect(kind.prefill.is_client, `${kind.id} leaves is_client unset`).toBeTypeOf('boolean');
      expect(kind.prefill.is_supplier, `${kind.id} leaves is_supplier unset`).toBeTypeOf('boolean');
      expect(legal.has(kind.prefill.contact_type ?? null), `${kind.id}: ${kind.prefill.contact_type}`).toBe(true);
    }
    const invoiced = NEW_CONTACT_KINDS.filter((k) => k.prefill.contact_type === 'company');
    expect(invoiced.length, 'no kind produces a contact that can be invoiced as a business').toBeGreaterThan(0);
  });
});
