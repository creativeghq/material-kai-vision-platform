/**
 * Cost code shape and the pure functions over it.
 *
 * IMPORT-FREE on purpose, exactly like `snagVocabulary`: `costCodesService` pulls in the Supabase
 * client, which throws at module load without env vars, so anything living beside it can only be
 * tested by mocking a database. The tree maths has nothing to do with a database — it is the part
 * a picker and a manager both depend on being right.
 *
 * `costCodesService` re-exports all of this, so callers import from wherever reads better.
 */

export interface CostCode {
  id: string;
  workspace_id: string;
  /** The operator's own numbering — '05.2', 'ELEC', 'M&E-01' are all real. Free text on purpose. */
  code: string;
  name: string;
  description: string | null;
  parent_id: string | null;
  sort: number;
  is_active: boolean;
}

/** A code with its children attached, for the manager and the picker's grouping. */
export interface CostCodeNode extends CostCode {
  children: CostCodeNode[];
}

/** How deep the DB lets the tree go. Mirrored from `_cost_codes_guard_hierarchy`. */
export const COST_CODE_MAX_DEPTH = 3;

/** `05.2 — Plumbing & drainage`. The one place the two halves are joined for display. */
export const costCodeLabel = (c: Pick<CostCode, 'code' | 'name'>): string => `${c.code} — ${c.name}`;

/**
 * Nest a flat list into parents and children.
 *
 * A code whose parent is missing from the list (archived, so absent from the ACTIVE list a picker
 * loads) is promoted to the top rather than dropped. Dropping it would silently remove a live code
 * from every picker, and the cost it should have carried would land uncoded with nothing on screen
 * to explain why.
 */
export function costCodeTree(codes: CostCode[]): CostCodeNode[] {
  const byId = new Map<string, CostCodeNode>();
  for (const c of codes) byId.set(c.id, { ...c, children: [] });

  const roots: CostCodeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const bySort = (a: CostCodeNode, b: CostCodeNode) => a.sort - b.sort || a.code.localeCompare(b.code);
  const sortDeep = (nodes: CostCodeNode[]) => {
    nodes.sort(bySort);
    for (const n of nodes) sortDeep(n.children);
  };
  sortDeep(roots);
  return roots;
}

/** Depth-first flatten, carrying the depth so a picker can indent without re-walking the tree. */
export function flattenCostCodes(nodes: CostCodeNode[], depth = 0): Array<{ code: CostCode; depth: number }> {
  const out: Array<{ code: CostCode; depth: number }> = [];
  for (const n of nodes) {
    out.push({ code: n, depth });
    out.push(...flattenCostCodes(n.children, depth + 1));
  }
  return out;
}
