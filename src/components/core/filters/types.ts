/**
 * Shared filter model — the single vocabulary every filterable surface in the platform
 * describes itself with. A page declares `FilterGroupDef[]` (the sidebar categories in the
 * filter modal) and holds a flat `FilterValues` bag; `applyFilters` does the matching.
 *
 * Every field carries its own `accessor`, so the matcher is fully generic — it never needs
 * to know what a row is. That is what lets one modal serve payments, products, jobs and CRM.
 */
import type { LucideIcon } from 'lucide-react';
import { formatDate } from '@/utils/datetime';

export interface FilterOption {
  value: string;
  label: string;
  /** Optional result count rendered as a muted trailing number. */
  count?: number;
  /** Secondary line under the label (e.g. a VAT number under a supplier name). */
  hint?: string;
}

interface BaseField {
  key: string;
  label: string;
  /** Helper copy under the field label. */
  description?: string;
  /**
   * Pulls the comparable value(s) off a row — the CLIENT-side path. Omit and set `column`
   * instead to push the predicate into SQL; `applyFilters` then passes the field through.
   */
  accessor?: (row: any) => any;
  /**
   * DB column this field filters, for the SERVER-side path via `applyFiltersToQuery`.
   * Mutually exclusive with `accessor` — a field is matched in one place, never both.
   */
  column?: string;
}

/** Free-text contains-match. `accessor` may return a string or an array of strings. */
export interface TextField extends BaseField {
  type: 'text';
  placeholder?: string;
  /** Server-side only: OR an ilike across several columns (e.g. title + body). */
  columns?: string[];
}

/** Single choice. `''` means "no filter"; `NONE_VALUE` matches rows with an empty value. */
export interface SelectField extends BaseField {
  type: 'select';
  options: FilterOption[];
  placeholder?: string;
  /** Show a search box above the list. Auto-enabled past 8 options. */
  searchable?: boolean;
}

/** Many choices OR-ed together. Row matches if any selected value is present. */
export interface MultiField extends BaseField {
  type: 'multi';
  options: FilterOption[];
  /** Show a search box above the list. Auto-enabled past 8 options. */
  searchable?: boolean;
}

/** Numeric min/max, rendered as a dual slider plus two number inputs. */
export interface RangeField extends BaseField {
  type: 'range';
  min: number;
  max: number;
  step?: number;
  /** Suffix shown next to the inputs (e.g. '€', 'kg'). */
  unit?: string;
}

/** Inclusive date window on an ISO date/timestamp, with quick presets. */
export interface DateRangeField extends BaseField {
  type: 'dateRange';
}

/** Tri-state: undefined (off) / true / false. */
export interface BoolField extends BaseField {
  type: 'bool';
  trueLabel?: string;
  falseLabel?: string;
}

export type FilterField = TextField | SelectField | MultiField | RangeField | DateRangeField | BoolField;

export interface FilterGroupDef {
  key: string;
  label: string;
  icon?: LucideIcon;
  fields: FilterField[];
}

export type RangeValue = { min?: number; max?: number };
export type DateRangeValue = { from?: string; to?: string };
export type FilterValue = string | string[] | RangeValue | DateRangeValue | boolean | undefined;
export type FilterValues = Record<string, FilterValue>;

/** Sentinel for "value is null/empty" in a select — e.g. "Uncategorized". */
export const NONE_VALUE = '__none';

/** True when the field is carrying a user-set constraint (drives badges + chips). */
export function isFieldActive(field: FilterField, value: FilterValue): boolean {
  if (value === undefined || value === null || value === '') return false;
  switch (field.type) {
    case 'multi':
      return Array.isArray(value) && value.length > 0;
    case 'range': {
      const r = value as RangeValue;
      return r.min != null || r.max != null;
    }
    case 'dateRange': {
      const d = value as DateRangeValue;
      return !!d.from || !!d.to;
    }
    default:
      return true;
  }
}

/** Human-readable summary of one active field, used for the removable chips. */
export function describeValue(field: FilterField, value: FilterValue): string {
  const labelOf = (opts: FilterOption[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  switch (field.type) {
    case 'select':
      return value === NONE_VALUE ? `No ${field.label.toLowerCase()}` : labelOf(field.options, String(value));
    case 'multi': {
      const vals = value as string[];
      if (vals.length === 1) return labelOf(field.options, vals[0]);
      return `${field.label}: ${vals.length}`;
    }
    case 'range': {
      const r = value as RangeValue;
      const u = field.unit ?? '';
      if (r.min != null && r.max != null) return `${field.label} ${r.min}${u}–${r.max}${u}`;
      if (r.min != null) return `${field.label} ≥ ${r.min}${u}`;
      return `${field.label} ≤ ${r.max}${u}`;
    }
    case 'dateRange': {
      const d = value as DateRangeValue;
      const fmt = (s?: string) => (s ? formatDate(s) : '');
      if (d.from && d.to) return `${fmt(d.from)} – ${fmt(d.to)}`;
      if (d.from) return `${field.label} from ${fmt(d.from)}`;
      return `${field.label} to ${fmt(d.to)}`;
    }
    case 'bool':
      return value ? (field.trueLabel ?? field.label) : (field.falseLabel ?? `Not ${field.label.toLowerCase()}`);
    default:
      return `${field.label}: ${String(value)}`;
  }
}

/**
 * The fold every search box in the filter system compares through — case-insensitive AND
 * diacritic-insensitive.
 *
 * `toLowerCase()` alone is not enough for a Greek CRM. `Κώστας` and `ΚΩΣΤΑΣ` differ only by
 * accents, and the final sigma `ς` is a different codepoint from `σ`, so typing a name the
 * way it is actually spelled ("κωστάς") matched nothing in a list holding "ΚΩΣΤΑΣ ΑΛΕΞΙΟΥ".
 * Same for Latin accents (`Trendafil` vs `Трендафил` is a different alphabet and still
 * won't match — transliteration is not this function's job).
 */
export function foldForSearch(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining accents: ά→α, é→e
    .toLowerCase()
    .replace(/ς/g, 'σ'); // final sigma ς folds onto the medial σ
}

const normalize = foldForSearch;

/** Coerce whatever the accessor returned into the string set we compare against. */
function accessorValues(raw: any): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.filter((v) => v != null).map((v) => String(v));
  return [String(raw)];
}

function matchesField(field: FilterField, value: FilterValue, row: any): boolean {
  // Server-side field (no accessor) — the query already applied it.
  if (!field.accessor) return true;
  const raw = field.accessor(row);

  switch (field.type) {
    case 'text': {
      const q = normalize(value).trim();
      if (!q) return true;
      return accessorValues(raw).some((v) => normalize(v).includes(q));
    }
    case 'select': {
      const v = String(value);
      const vals = accessorValues(raw);
      if (v === NONE_VALUE) return vals.length === 0 || vals.every((x) => x === '');
      return vals.includes(v);
    }
    case 'multi': {
      const sel = value as string[];
      const vals = accessorValues(raw);
      return sel.some((s) => (s === NONE_VALUE ? vals.length === 0 : vals.includes(s)));
    }
    case 'range': {
      const { min, max } = value as RangeValue;
      const n = Number(raw);
      if (!Number.isFinite(n)) return false;
      if (min != null && n < min) return false;
      if (max != null && n > max) return false;
      return true;
    }
    case 'dateRange': {
      const { from, to } = value as DateRangeValue;
      if (!raw) return false;
      const t = new Date(raw).getTime();
      if (!Number.isFinite(t)) return false;
      if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
      if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
      return true;
    }
    case 'bool':
      return Boolean(raw) === Boolean(value);
    default:
      return true;
  }
}

/**
 * Client-side matcher. Fields with no `accessor` are skipped (already applied server-side),
 * so a page can mix both without branching.
 */
export function applyFilters<T>(rows: T[], groups: FilterGroupDef[], values: FilterValues): T[] {
  const active = groups
    .flatMap((g) => g.fields)
    .filter((f) => isFieldActive(f, values[f.key]));
  if (active.length === 0) return rows;
  return rows.filter((row) => active.every((f) => matchesField(f, values[f.key], row)));
}

/** How many constraints are set — the number on the Filter button badge. */
export function countActive(groups: FilterGroupDef[], values: FilterValues): number {
  return groups.flatMap((g) => g.fields).filter((f) => isFieldActive(f, values[f.key])).length;
}

/** Build distinct `FilterOption[]` from the loaded rows — for dimensions with no fixed enum. */
export function optionsFromRows<T>(
  rows: T[],
  accessor: (row: T) => any,
  labelFor: (value: string) => string = (v) => v,
): FilterOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const v of accessorValues(accessor(row))) {
      if (v === '') continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: labelFor(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
