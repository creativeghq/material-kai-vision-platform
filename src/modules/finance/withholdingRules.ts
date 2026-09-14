/**
 * Public-sector withholding — the part with no I/O (#446). άρθρο 64 §2 ν.4172/2013.
 *
 * IMPORT-FREE on purpose: the service that fetches the derived figure pulls in the Supabase
 * client, which fails closed with no environment configured, so a hermetic unit test cannot
 * import it. The rule has no dependencies and lives here.
 */

export type WithholdingStatus = 'withheld' | 'not_withheld' | 'below_floor' | 'unclassified';

export interface WithholdingVerdict {
  status: WithholdingStatus;
  /** NULL when the rule cannot be applied — never 0, which would read as "nothing is withheld". */
  amount: number | null;
  reason: string;
  net?: number;
  rate?: number;
  floor?: number;
  supply_kind?: 'goods' | 'services' | 'mixed' | 'unknown' | null;
  legal_basis?: string;
}

/**
 * Does this verdict need a human before the document can be issued?
 *
 * Only `unclassified` does. `below_floor` and `not_withheld` are answers — the rule ran and said
 * nothing is withheld. `unclassified` is the absence of an answer, and treating it as zero is how
 * a €400 receivable goes missing.
 */
export function withholdingNeedsDecision(v: WithholdingVerdict | null): boolean {
  return v?.status === 'unclassified';
}
