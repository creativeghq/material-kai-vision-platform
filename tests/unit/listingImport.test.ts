/**
 * Listing-import validation guard.
 *
 * The importer is the one place where a file a stranger emailed the agency becomes rows in
 * `properties`. Two things must hold, and neither is visible to the typecheck:
 *
 *  1. **The write is allowlisted.** `normaliseImportRow` builds its payload field by field from
 *     IMPORT_WRITABLE. If anyone ever "simplifies" it to a spread, a crafted CSV header could set
 *     `workspace_id`, `commission_pct`, `is_public` or `listing_agent_id` — invariant 8, the exact
 *     mass-assignment shape the security section exists to stop.
 *  2. **Bad rows are REPORTED, not silently coerced.** An importer that quietly turns a junk price
 *     into 0, or a junk energy class into a published listing, is worse than one that refuses: the
 *     agency finds out from a portal, months later.
 *
 * `normaliseImportRow` is dependency-free precisely so this test can import it; the XML half lives
 * in `real-estate-import-xml.ts` because its esm.sh import cannot resolve under a Node runner.
 */
import { describe, it, expect } from 'vitest';
import { normaliseImportRow, IMPORT_WRITABLE } from '../../supabase/functions/_shared/real-estate-import';

/** The minimum a row needs to be accepted, so each test can vary one thing. */
const valid = () => ({
  property_type: 'residential',
  transaction_type: 'sale',
  title: 'Sea-view apartment',
  price: '250000',
});

describe('listing import — the write is allowlisted', () => {
  it('never lets an incoming column reach a field outside IMPORT_WRITABLE', () => {
    const { payload } = normaliseImportRow({
      ...valid(),
      // Everything a crafted export could plausibly carry to escalate.
      workspace_id: '00000000-0000-0000-0000-000000000000',
      user_id: '00000000-0000-0000-0000-000000000000',
      created_by: '00000000-0000-0000-0000-000000000000',
      listing_agent_id: '00000000-0000-0000-0000-000000000000',
      is_public: 'true',
      listing_status: 'active',
      in_discovery: 'true',
      commission_pct: '99',
      cost_basis: '1',
      min_offer: '1',
      view_count: '99999',
      public_listing_token: 'stolen',
    });

    const allowed = new Set<string>([...IMPORT_WRITABLE, 'description_i18n']);
    const leaked = Object.keys(payload).filter((k) => !allowed.has(k));
    expect(
      leaked,
      'A field outside IMPORT_WRITABLE reached the payload. Build the object field by field — ' +
      'never spread the incoming row (security invariant 8).\n' + leaked.join(', '),
    ).toEqual([]);
  });

  it('specifically drops publish state, ownership and internal pricing', () => {
    const { payload } = normaliseImportRow({
      ...valid(), is_public: 'true', listing_status: 'active', in_discovery: 'true',
      commission_pct: '99', cost_basis: '1', min_offer: '1', listing_agent_id: 'x', workspace_id: 'y',
    });
    for (const forbidden of ['is_public', 'listing_status', 'in_discovery', 'commission_pct', 'cost_basis', 'min_offer', 'listing_agent_id', 'workspace_id']) {
      expect(payload[forbidden], `${forbidden} must not be settable by an imported row`).toBeUndefined();
    }
  });
});

describe('listing import — bad rows are reported, not coerced', () => {
  it('requires the two fields nothing else can infer', () => {
    expect(normaliseImportRow({ title: 'x', price: '1' }).errors).toEqual(
      expect.arrayContaining([expect.stringContaining('property_type'), expect.stringContaining('transaction_type')]),
    );
  });

  it('rejects an out-of-vocabulary property type instead of defaulting it', () => {
    const { errors } = normaliseImportRow({ ...valid(), property_type: 'villa' });
    expect(errors.join(' ')).toContain('property_type');
  });

  it('requires a price unless price_on_request is set', () => {
    expect(normaliseImportRow({ ...valid(), price: '' }).errors.join(' ')).toContain('price');
    expect(normaliseImportRow({ ...valid(), price: '', price_on_request: 'yes' }).errors).toEqual([]);
  });

  it('rejects a junk energy class — the publish gate only checks that it is non-empty', () => {
    // This is the one that matters: `checkPublishRequirements` asks whether energy_class is set,
    // not whether it means anything, so "N/A" would satisfy the GR compliance gate and reach a portal.
    expect(normaliseImportRow({ ...valid(), energy_class: 'N/A' }).errors.join(' ')).toContain('energy_class');
    expect(normaliseImportRow({ ...valid(), energy_class: 'a+' }).payload.energy_class).toBe('A+');
  });
});

describe('listing import — coercion matches what spreadsheets actually export', () => {
  it('reads both European and Anglo number formats', () => {
    expect(normaliseImportRow({ ...valid(), price: '250.000,50' }).payload.price).toBe(250000.5);
    expect(normaliseImportRow({ ...valid(), price: '250,000.50' }).payload.price).toBe(250000.5);
    expect(normaliseImportRow({ ...valid(), price: '€ 250000' }).payload.price).toBe(250000);
  });

  it('leaves an empty cell UNSET so a re-import cannot blank a good value', () => {
    // The re-import case: an agency exports, edits two rows, re-uploads. Empty cells in the other
    // rows must not wipe the town/price/beds that are already correct in the database.
    const { payload } = normaliseImportRow({ ...valid(), town: '', bedrooms: '', pool: '' });
    expect('town' in payload).toBe(false);
    expect('bedrooms' in payload).toBe(false);
    expect('pool' in payload).toBe(false);
  });

  it('reads Greek yes/no for booleans', () => {
    expect(normaliseImportRow({ ...valid(), pool: 'ΝΑΙ' }).payload.pool).toBe(true);
    expect(normaliseImportRow({ ...valid(), pool: 'Όχι' }).payload.pool).toBe(false);
  });

  it('splits a features cell on any of the three separators people use', () => {
    expect(normaliseImportRow({ ...valid(), features: 'sea view; parking | balcony' }).payload.features)
      .toEqual(['sea view', 'parking', 'balcony']);
  });

  it('folds the two description columns into description_i18n', () => {
    const { payload } = normaliseImportRow({ ...valid(), description_en: 'Bright flat', description_el: 'Φωτεινό διαμέρισμα' });
    expect(payload.description_i18n).toEqual({ en: 'Bright flat', el: 'Φωτεινό διαμέρισμα' });
  });
});
