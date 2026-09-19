/** A job title had two stores — crm_contacts.position and the crm_company_contacts.role beside it — and two boxes asking for it, so the same person was a CEO on one screen and an Owner on the other. */
import { describe, it, expect } from 'vitest';
import { sourceIndex, strippedSource } from '../helpers/sourceIndex';

const COMPANY_PAGE = 'src/modules/crm/pages/CompanyDetailPage.tsx';
const CRM_SERVICE = 'src/services/crm.service.ts';
const INDEX = sourceIndex({
  roots: ['src', 'supabase/functions'],
  filter: (p) => p !== 'src/integrations/supabase/types.ts',
});

// Every mention (the selects this closed are NESTED embeds); the generated types are not a use.
function junctionWindows(): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [file, src] of INDEX.stripped()) {
    for (const m of src.matchAll(/crm_company_contacts/g)) {
      out.push([file, src.slice(m.index!, m.index! + 400)]);
    }
  }
  return out;
}

describe('a job title has one store', () => {
  it('nothing writes one into the relationship', () => {
    const offenders = junctionWindows()
      .filter(([, w]) => /\brole\s*:/.test(w))
      .map(([file]) => file);
    expect(offenders, `crm_company_contacts.role is retired: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the retired column never reaches a client', () => {
    const leaks = junctionWindows()
      .filter(([, w]) => /(?:^|\n)\s*role\s*,?\s*(?:\n|$)/.test(w))
      .map(([file]) => file);
    expect(leaks, `still selected, so a reader can be written against it: ${leaks.join(', ')}`).toEqual([]);
  });

  it('the company page asks once and reads the person', () => {
    const src = strippedSource(COMPANY_PAGE);
    expect(src, 'the second box is back').not.toContain('Role at Company');
    expect(src).toContain('contact.contact_position');
    expect(src, 'a fallback onto the retired column').not.toContain('contact.role');
    const boxes = src.match(/id="[a-z-]*contact-position"/g) ?? [];
    expect(boxes, 'one box for the title, not one per tab').toHaveLength(1);
  });

  it('the attach call carries the title, not a role', () => {
    const src = strippedSource(CRM_SERVICE);
    const attach = src.slice(src.indexOf('async attachContact'), src.indexOf('async createAndAttachContact'));
    expect(attach).toContain('position');
    expect(attach, 'the junction column is not a parameter any more').not.toMatch(/\brole\b/);
  });
});
