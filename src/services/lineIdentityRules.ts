/**
 * Line identity — the pure rules (#347 phase 5.2).
 *
 * Deliberately free of any IO import. The projection below decides what a document prints and
 * what phase 6 will match warehouse stock on, so it has to be unit-testable without a Supabase
 * client in scope; `lineIdentityService` is the half that talks to the database.
 */

export interface LineIdentityOption {
  field_name: string;
  label: string;
  field_type: string;
  /** Every value this field may take for this product, already de-duplicated and sorted. */
  options: string[];
  /** The subset physically in stock. Empty for non-size fields. */
  stocked: string[];
}

/**
 * Which registry keys feed the two dedicated columns, in precedence order.
 *
 * Order is the contract, not an accident: six colour-ish fields are classified `identity` for
 * tiles today because phase 4's classifier has not run and the 3.1 seed was heuristic. When a
 * product carries several, the same one must win every time — "whichever key enumerated first"
 * is how the same product yields a different label on two screens.
 */
export const SIZE_KEYS = ['available_sizes', 'size', 'format_code'] as const;
export const COLOR_KEYS = ['color', 'available_colors', 'colors', 'primary_color'] as const;

/**
 * Project the attribute map onto the two dedicated columns.
 *
 * `selected_attributes` is the whole truth; `selected_size` / `selected_color` are the slices the
 * PDF templates and the warehouse read. Derived here, once, so the two can never disagree —
 * writing them independently is how a line ends up labelled 600x600 while its attributes say
 * 300x300.
 */
export function projectIdentity(
  attrs: Record<string, string> | null | undefined,
): { selected_size: string | null; selected_color: string | null } {
  const map = attrs ?? {};
  const pick = (keys: readonly string[]) => {
    for (const k of keys) {
      const v = map[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  return { selected_size: pick(SIZE_KEYS), selected_color: pick(COLOR_KEYS) };
}

/**
 * Stocked values first, then the rest — an operator picking a size that exists is the common
 * case, and burying it under catalogue sizes nobody can ship is how a line gets promised on
 * stock that was never there. Never drops a value: a size absent from the warehouse is still
 * orderable, it just should not be the easy default.
 */
export function rankIdentityOptions(opt: LineIdentityOption): string[] {
  if (!opt.stocked?.length) return opt.options;
  const inStock = new Set(opt.stocked);
  return [...opt.options.filter((v) => inStock.has(v)), ...opt.options.filter((v) => !inStock.has(v))];
}
