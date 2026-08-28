/**
 * Why an address may be mailed by a campaign — the vocabulary, its wording, and the split (#357 AE-8).
 *
 * Import-free on purpose: the derivation itself is SQL (`campaign_address_consent_basis`), and this
 * module only names and formats the answer, so a test can load it without a Supabase client.
 *
 * `crm_contacts.marketing_consent` existed all along. It is on the contact page and the real-estate
 * module honours it on every alert and digest; the campaign resolver — the one surface actually
 * labelled marketing — never read it, so a contact with the box unticked received every campaign,
 * and a pasted address matching nobody was mailed on no basis at all. Same shape as AE-5's
 * `auto_reply_enabled`: stored, shown, edited, never consulted.
 */

export type ConsentBasis =
  | 'workspace_member'  // a colleague — the working relationship, not a mailing list
  | 'contact_opt_in'    // crm_contacts.marketing_consent = true
  | 'b2b_company'       // a company's own business address (B2B soft opt-in)
  | 'no_consent'        // a contact with the box unticked
  | 'unverified';       // a typed address matching nobody in this workspace

/** Reader-facing wording. Formatting only — SQL owns the verdict AND which bases may send. */
export const CONSENT_BASIS_LABEL: Record<ConsentBasis, string> = {
  workspace_member: 'Workspace member',
  contact_opt_in: 'Marketing consent on file',
  b2b_company: 'Business address',
  no_consent: 'No marketing consent on their contact record',
  unverified: 'Typed address, not in your contacts',
};

/** What an operator can do about each kind of withholding. Absent = nothing to offer. */
export const CONSENT_BASIS_REMEDY: Partial<Record<ConsentBasis, string>> = {
  no_consent: 'Tick “Marketing consent” on their contact in CRM once you have a basis to.',
  unverified: 'Add them to CRM as a contact with marketing consent, so the basis is recorded.',
};

export interface ConsentRow {
  consent_basis: ConsentBasis | string;
  mailable: boolean;
}

export interface AudienceConsentSummary {
  /** Addresses that will actually be mailed. */
  mailable: number;
  /** Everything held back, by reason, largest first. Empty when nothing is held back. */
  withheld: Array<{ basis: string; label: string; remedy?: string; count: number }>;
}

/**
 * Split a resolved audience into "will be mailed" and "held back, and why".
 *
 * `mailable` comes from SQL and is never re-derived here — a second opinion about who may be
 * emailed is exactly the shape anti-regression rule 1 forbids. An audience that silently resolves
 * smaller than expected is the silent-zero shape wearing a compliance hat (rule 3): people work
 * around an unexplained count and act on an explained one.
 */
export function summarizeAudienceConsent(rows: ConsentRow[]): AudienceConsentSummary {
  const counts = new Map<string, number>();
  let mailable = 0;
  for (const r of rows) {
    if (r.mailable) { mailable++; continue; }
    const basis = String(r.consent_basis ?? 'unverified');
    counts.set(basis, (counts.get(basis) ?? 0) + 1);
  }
  const withheld = [...counts.entries()]
    .map(([basis, count]) => ({
      basis,
      label: CONSENT_BASIS_LABEL[basis as ConsentBasis] ?? basis,
      remedy: CONSENT_BASIS_REMEDY[basis as ConsentBasis],
      count,
    }))
    .sort((a, b) => b.count - a.count || a.basis.localeCompare(b.basis));
  return { mailable, withheld };
}
