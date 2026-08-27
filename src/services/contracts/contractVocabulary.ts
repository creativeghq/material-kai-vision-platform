/**
 * The contract value-sets, written ONCE (#391).
 *
 * `ContractContext` was declared in five files — `contractsService`,
 * `templates/adapters`, `contracts-api`, `contracts-tools`, and referenced by
 * `ContractsSection` — agreeing only by memory.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `contracts_context_check` admits exactly these four. A copy that drifts wider makes the
 * UI offer a context the write rejects with a raw 23514; one that drifts narrower makes a
 * legitimate context vanish. Pinned to the constraint text by
 * `tests/unit/contractVocabulary.test.ts`.
 *
 * `realestate` is ONE WORD, deliberately. Every other part of the platform spells this
 * domain `real-estate` or `real_estate`, so it is the value most likely to be "corrected"
 * into a copy that no longer matches the constraint. It is the database's spelling and
 * the database wins.
 *
 * THE SECOND CONSTRAINT IS NOT A VOCABULARY
 * ------------------------------------------
 * `contracts_subject_ck` says which subject column each context requires — hr needs
 * `hr_employee_id`, project needs `project_id`, and so on. That is a RULE about rows, not
 * a set of values, so it is not mirrored here: restating it in TypeScript would be a
 * second derivation of something Postgres already decides, and the failure mode of
 * getting it wrong is a rejected insert rather than a silently wrong list. It is recorded
 * here only so the next reader knows it exists and is deliberately not duplicated.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/** `contracts_context_check`. */
export const CONTRACT_CONTEXTS = ['hr', 'finance', 'project', 'realestate'] as const;
export type ContractContext = (typeof CONTRACT_CONTEXTS)[number];

export function isContractContext(v: unknown): v is ContractContext {
  return typeof v === 'string' && (CONTRACT_CONTEXTS as readonly string[]).includes(v);
}
