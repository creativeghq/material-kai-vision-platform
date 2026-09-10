// GENERATED MIRROR of src/modules/finance/invoice-templates/counterparty.ts — do not edit here.
// Regenerate: npm run finance:mirror (part of gen:all). Freshness is enforced by
// tests/unit/financeMirrors.test.ts, which fails the build on any drift.

/** Who a fiscal document is ADDRESSED TO, for printing. */

export interface PrintedParty {
  name: string;
  vatNumber: string | null;
  taxOffice: string | null;
  /** Trade/professional activity (ΑΑΔΕ "Δραστηριότητα"). */
  activity: string | null;
  street: string | null;
  streetNumber: string | null;
  postalCode: string | null;
  city: string | null;
  countryCode: string | null;
  email: string | null;
  phone: string | null;
  /** myDATA establishment/branch number, when the document is addressed to a sub-unit. */
  branch: number;
}

/** A CRM company/contact row, a `counterparty_snapshot.row`, or a `crm_address_units` row. */
type Row = Record<string, unknown> | null | undefined;

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/**
 * Apply the SEPARATE-BILLING-IDENTITY precedence, field for field as `partyFromCrm` does it:
 * ANY `billing_*` field being set turns the billing identity ON, and then each field prefers
 * its `billing_*` value where one exists and falls back to the party's own where it does not.
 * So a party with only `billing_vat` filled in is invoiced under that ΑΦΜ at its own address.
 */
export function partyFromCrmRow(c: Row): PrintedParty {
  const r: Record<string, unknown> = c ?? {};
  const hasBilling = !!(r.billing_vat || r.billing_name || r.billing_street || r.billing_city);
  const pick = (billing: string, own: string): string | null =>
    (hasBilling ? str(r[billing]) : null) ?? str(r[own]);

  const name = (hasBilling ? str(r.billing_name) : null)
    ?? str(r.name)
    ?? str([r.first_name, r.last_name].filter(Boolean).join(' '));

  return {
    name: name ?? '',
    vatNumber: pick('billing_vat', 'vat_number'),
    taxOffice: pick('billing_tax_office', 'tax_office'),
    // `profession` and nothing else: it is in the snapshot allowlist, and a `kad_*` fallback
    // would only ever fire on a draft, so the Activity line would change at issue.
    activity: str(r.profession),
    street: pick('billing_street', 'street') ?? str(r.address),
    streetNumber: pick('billing_street_number', 'street_number'),
    postalCode: pick('billing_postal_code', 'postal_code'),
    city: pick('billing_city', 'city'),
    countryCode: pick('billing_country_code', 'country_code'),
    email: str(r.email),
    phone: str(r.phone) ?? str(r.mobile),
    branch: 0,
  };
}

/**
 * The party to PRINT: the snapshot frozen at issue when there is one, else the live row.
 *
 * `capture_counterparty_snapshot` already walked an attached contact up to its primary company,
 * so a snapshot goes straight through with no second resolution step — exactly as the fiscal
 * builder does it. Drafts (never issued) and documents predating the column have no snapshot and
 * fall back to the live row, which is correct: they have no frozen identity to honour.
 */
export function resolvePrintedCounterparty(snapshotRow: Row, liveRow: Row): PrintedParty | null {
  if (snapshotRow) return partyFromCrmRow(snapshotRow);
  if (liveRow) return partyFromCrmRow(liveRow);
  return null;
}

/**
 * Re-address a party to a chosen sub-unit (branch / establishment), carrying its ΑΑΔΕ branch
 * number. Mirrors `applyCounterpartAddressUnit`. No-op when no unit was chosen — a document with
 * no sub-unit is addressed to the party's main address, not to a blank one.
 */
export function applyAddressUnit(party: PrintedParty, unit: Row): PrintedParty {
  const u: Record<string, unknown> | null = unit ?? null;
  if (!u) return party;
  return {
    ...party,
    branch: Number(u.branch_number ?? party.branch ?? 0) || 0,
    street: str(u.street) ?? str(u.address),
    streetNumber: str(u.street_number),
    postalCode: str(u.postal_code),
    city: str(u.city),
    countryCode: str(u.country_code) ?? party.countryCode,
  };
}

/**
 * The address lines for a party panel, in the order a Greek παραστατικό prints them.
 *
 * `compact` is for the DELIVERY panel: where the goods go needs the address, the ΑΦΜ and the
 * establishment number. Repeating the tax office, activity, ΓΕΜΗ and contact details there just
 * prints the same party twice on one page — the panels stop reading as two different facts.
 */
export function partyAddressLines(
  p: PrintedParty,
  L: Record<string, string>,
  opts: { compact?: boolean } = {},
): string[] {
  const full = !opts.compact;
  return [
    [p.street, p.streetNumber].filter(Boolean).join(' '),
    [p.postalCode, p.city].filter(Boolean).join(' '),
    p.vatNumber ? `${L.vatNo}: ${p.vatNumber}` : '',
    full && p.taxOffice ? `${L.taxOffice}: ${p.taxOffice}` : '',
    full && p.activity ? `${L.profession}: ${p.activity}` : '',
    full ? [p.phone ? `${L.phone} ${p.phone}` : '', p.email || ''].filter(Boolean).join('  ·  ') : '',
    p.branch > 0 ? `${L.establishment}: #${p.branch}` : '',
  ].filter(Boolean) as string[];
}
