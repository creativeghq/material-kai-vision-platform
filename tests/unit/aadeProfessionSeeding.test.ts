/**
 * `profession` on a CRM party is the FISCAL activity, not an app segmentation enum:
 * `partyFromCrm` copies it onto the myDATA counterpart and the invoice PDF prints it as
 * "Δραστηριότητα". On a contact it is the only home for that value at all —
 * `kad_primary_description` is in COMPANY_ONLY_FIELDS and gets stripped.
 *
 * So the ΑΑΔΕ mapper SEEDS it and then leaves it alone. It used to overwrite unconditionally,
 * which meant an operator who corrected the printed activity had it silently reverted by the
 * next lookup — invisible until a customer read their invoice. The registry's own copy still
 * lands in `kad_primary_description` every time, so nothing is lost by not clobbering.
 */
import { describe, it, expect, vi } from 'vitest';

// The module chain reaches the Supabase client at import time; this test only exercises a pure
// field mapper, so stub the client rather than requiring env.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { aadeFields } from '../../src/modules/crm/services/companyResearch';

const LOOKUP = {
  ok: true,
  source: 'aade',
  checked_at: '2026-08-10T00:00:00.000Z',
  valid_afm: true,
  basic_rec: {
    afm: '998174198', doy: '1', doy_descr: 'Α ΑΘΗΝΩΝ', i_ni_flag_descr: null,
    deactivation_flag: '1', deactivation_flag_descr: null, firm_flag_descr: null,
    onomasia: 'Π ΣΚΕΠΕΤΑΡΗΣ ΚΑΙ ΣΙΑ ΕΕ', commer_title: null, legal_status_descr: 'ΕΕ',
    postal_address: 'ΑΓΙΟΥ ΔΗΜΗΤΡΙΟΥ', postal_address_no: '12', postal_zip_code: '11111',
    postal_area_description: 'ΑΘΗΝΑ', regist_date: '2001-03-04', stop_date: null,
    normal_vat_system_flag: null,
  },
  activities: [
    { code: '46731500', description: 'ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ', kind: 1, kind_description: 'ΚΥΡΙΑ' },
    { code: '47521000', description: 'ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΣΙΔΗΡΙΚΩΝ', kind: 2, kind_description: 'ΔΕΥΤΕΡΕΥΟΥΣΑ' },
  ],
} as unknown as Parameters<typeof aadeFields>[0];

describe('aadeFields — profession is seeded, never clobbered', () => {
  it('fills profession from the primary ΚΑΔ when the party has none', () => {
    const patch = aadeFields(LOOKUP, {});
    expect(patch.profession).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ');
  });

  it('leaves a hand-set profession out of the patch entirely', () => {
    const patch = aadeFields(LOOKUP, { profession: 'ΕΜΠΟΡΙΑ ΕΙΔΩΝ ΥΓΙΕΙΝΗΣ' });
    expect('profession' in patch).toBe(false);
  });

  it('treats whitespace as unset', () => {
    expect(aadeFields(LOOKUP, { profession: '   ' }).profession).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ');
    expect(aadeFields(LOOKUP, { profession: null }).profession).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ');
  });

  it('still refreshes the registry copy on every lookup', () => {
    // kad_primary / kad_primary_description are ΑΑΔΕ's, not the operator's — they always update,
    // so the classification stays true even when the printed activity has been overridden.
    const patch = aadeFields(LOOKUP, { profession: 'ΚΑΤΙ ΑΛΛΟ', kad_primary_description: 'ΠΑΛΙΟ' });
    expect(patch.kad_primary).toBe('46731500');
    expect(patch.kad_primary_description).toBe('ΧΟΝΔΡΙΚΟ ΕΜΠΟΡΙΟ ΠΛΑΚΑΚΙΩΝ');
  });

  it('does not extend seed-once to the fields the registry owns', () => {
    // Guard against over-applying the rule: address and tax office are ΑΑΔΕ truth and must
    // keep refreshing, or a moved company keeps invoicing from its old address.
    const patch = aadeFields(LOOKUP, { street: 'ΠΑΛΙΑ ΟΔΟΣ', tax_office: 'ΠΑΛΙΑ ΔΟΥ' });
    expect(patch.street).toBe('ΑΓΙΟΥ ΔΗΜΗΤΡΙΟΥ');
    expect(patch.tax_office).toBe('Α ΑΘΗΝΩΝ');
  });
});
