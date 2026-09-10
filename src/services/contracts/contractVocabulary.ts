/** The contract value-sets, written ONCE (#391). */

/** `contracts_context_check`. */
export const CONTRACT_CONTEXTS = ['hr', 'finance', 'project', 'realestate'] as const;
export type ContractContext = (typeof CONTRACT_CONTEXTS)[number];

export function isContractContext(v: unknown): v is ContractContext {
  return typeof v === 'string' && (CONTRACT_CONTEXTS as readonly string[]).includes(v);
}
