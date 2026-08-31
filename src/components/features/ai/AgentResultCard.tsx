import React, { createContext, useContext, useMemo, useState } from 'react';
import { ExternalLink, Plus, Link2 } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  RESULT_TYPE_CAPABILITY, RESULT_RECORD_KEY, RESULT_SETUP_DESTINATION,
  buildPageUrl, capabilityHubLabel, resultOffersCreate,
} from '@/config/capabilities';
import {
  canOpenRecordKind, labelKeyForIdKey, recordKindForIdKey, recordRoute, recordSpec,
  relatedRecordRefs, rowRecordRef, type RecordRef,
} from '@/config/recordLinks';
import { getDestination } from '@/config/appDestinations';
import { Badge } from '@/components/core/ui/badge';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import { labelizeValue, statusBadgeVariant, STATUS_KEYS } from '@/utils/recordDisplay';
import type { RecordLinkAccess } from '@/hooks/useRecordLinkAccess';
import { RecordPeekDialog } from './RecordPeekDialog';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { safeHref } from '@/utils/safeUrl';

/**
 * Generic structured renderer for agent result chunks that were
 * previously emitted but shown as plain text (graph tools, trip-expense,
 * job-research, misc). One card, consistent layout, handles arbitrary JSON
 * payloads so all 19 chunk types become visible without 19 bespoke cards.
 *
 * When the result maps to a page-backed capability, it also
 * renders a reverse "Open in {Hub}" handoff (deep-links to the record when the
 * payload carries its id), so any capability tool's card can jump to its page.
 */

const isScalar = (v: any) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const labelize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

// Hard ceiling on how deep nested objects may expand (via <details>) before we
// fall back to a plain "{N} fields" count — keeps recursion bounded regardless
// of payload shape/cycles.
const MAX_DEPTH = 4;
const ARRAY_INLINE_CAP = 8;

const URL_RE = /^https?:\/\//i;
const IMG_URL_RE = /^https?:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i;

// Plumbing the payload carries for the CLIENT's benefit, never the reader's.
// ~20 tools echo `workspace_id` back in their chunk (it is how they scoped the
// query), and this card renders whatever it is handed — so every one of them
// printed a raw tenant UUID as the first row of the canvas. Tenancy/identity is
// ambient here: the user is *in* that workspace, signed in as that user. Filtered
// at EVERY depth, since nested rows echo the same fields.
const HIDDEN_KEYS = new Set([
  'timestamp', 'type',
  'workspace_id', 'user_id', 'tenant_id', 'org_id', 'organization_id', 'account_id',
  'created_by', 'updated_by', 'owner_id',
  'session_id', 'request_id', 'correlation_id', 'trace_id',
  'jwt', 'access_token', 'refresh_token', 'api_key',
]);

// A raw UUID under an id-shaped key is a join key, not information — the row it
// points at is already rendered, and the "Open in {Hub}" handoff below reads the
// payload directly, so nothing here depends on it being visible. Deliberately
// narrow: an id-shaped key holding a HUMAN identifier ("INV-2026-014", a slug)
// still renders, because that one the reader can actually use.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isPlumbing = (k: string, v: unknown) =>
  HIDDEN_KEYS.has(k) || ((k === 'id' || k.endsWith('_id')) && typeof v === 'string' && UUID_RE.test(v));

// An ISO timestamp is not a thing to show a person. Rendering the payload verbatim printed
// `2026-08-18T20:02:46.275904+00:00` in a table cell — the single most "this is a debug view"
// detail in the whole card. `formatDate` is the canonical formatter with a PINNED locale (eleven
// hand-written copies preceded it, three of which let the browser decide), so this is the twelfth
// call site rather than the twelfth implementation.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// A stored enum reads as `quote_approved`. It is a value, not prose, and the reader should see
// "Quote approved" — the same labelize the column headers already get.
const ENUM_VALUE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;

function Scalar({ v }: { v: any }) {
  if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>;
  if (typeof v === 'string') {
    if (ISO_DATE_RE.test(v)) {
      // Time only when the value carries one — a date-only field gains nothing from "12:00 AM".
      return <span>{formatDate(v, { withTime: /[T ]\d{2}:\d{2}/.test(v) })}</span>;
    }
    if (ENUM_VALUE_RE.test(v)) return <span>{labelizeValue(v)}</span>;
    if (IMG_URL_RE.test(v)) {
      return (
        <a href={safeHref(v)} target="_blank" rel="noopener noreferrer" className="inline-block" aria-label="Open image in a new tab">
          <img
            src={v}
            alt=""
            loading="lazy"
            className="max-h-16 max-w-[8rem] rounded border border-border object-cover"
          />
        </a>
      );
    }
    if (URL_RE.test(v)) {
      return (
        <a href={safeHref(v)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
          {v}
        </a>
      );
    }
  }
  return <span>{String(v)}</span>;
}

// Renders a single array item (scalar → Scalar, object → inline KeyValues).
function ArrayItem({ item, depth }: { item: any; depth: number }) {
  return (
    <div className="rounded bg-muted/40 border border-border px-2 py-1 text-xs">
      {isScalar(item) ? <Scalar v={item} /> : <KeyValues obj={item} depth={depth + 1} inline />}
    </div>
  );
}

// One value, rendered to a sensible depth (objects expand via <details>, arrays
// cap inline with a "Show all" disclosure for the overflow).
function Value({ v, depth = 0, listKey }: { v: any; depth?: number; listKey?: string }) {
  if (isScalar(v)) return <Scalar v={v} />;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">None</span>;
    const cols = tabularColumns(v);
    // `listKey` is the key this array sits under — the one thing that says what its rows ARE. A
    // nested table inheriting the OUTER list's key is how a row of line items would end up
    // linking to an expense.
    if (cols) return <RecordTable rows={v} columns={cols} listKey={listKey} />;
    const shown = v.slice(0, ARRAY_INLINE_CAP);
    const rest = v.slice(ARRAY_INLINE_CAP);
    return (
      <div className="space-y-1">
        {shown.map((item, i) => (
          <ArrayItem key={i} item={item} depth={depth} />
        ))}
        {rest.length > 0 && (
          <details className="space-y-1">
            <summary className="cursor-pointer text-primary text-xs">Show all {v.length}</summary>
            <div className="space-y-1 mt-1">
              {rest.map((item, i) => (
                <ArrayItem key={i} item={item} depth={depth} />
              ))}
            </div>
          </details>
        )}
      </div>
    );
  }
  // object
  const fieldCount = Object.keys(v).length;
  if (depth >= 2) {
    // Beyond the inline depth budget: expand one more level on demand, but stop
    // at MAX_DEPTH so recursion stays bounded on deep/cyclic payloads.
    if (depth >= MAX_DEPTH) return <span className="text-muted-foreground">{fieldCount} fields</span>;
    return (
      <details>
        <summary className="cursor-pointer text-primary text-xs">{fieldCount} fields</summary>
        <div className="mt-1">
          <KeyValues obj={v} depth={depth + 1} />
        </div>
      </details>
    );
  }
  return <KeyValues obj={v} depth={depth + 1} />;
}


// ── A list of records is a TABLE, not a stack of chips ──────────────────────
//
// Every one of the 127 result types in AGENT_RESULT_TITLES renders through this card, and a list
// payload — `{ flows: [...] }`, `{ manufacturers: [...] }`, `{ deals: [...] }` — used to come out
// as one grey chip per row with `Name: x  Status: y` runs inside it. Readable for a single row,
// a wall at twenty, and impossible to scan down a column. That is most of why the Hub reads as a
// debug view rather than a product: the data was right and the shape was wrong.
//
// Design system (docs/design-system.md): sunken sticky header, hairline row separators, NO zebra,
// 11px semibold headers that are not uppercase, right-aligned tabular-nums for numbers, `—` for an
// absent value, status as a tinted squared Badge, and the whole thing in its own overflow-x
// container so a wide table scrolls instead of pushing the page sideways.

// Status tint and enum-to-prose live in `@/utils/recordDisplay` — the record peek dialog opened
// FROM this table renders the same words, and two copies is how a status ends up amber here and
// grey one click deeper.

const isNumericCol = (rows: any[], k: string) =>
  rows.some((r) => typeof r?.[k] === 'number') &&
  rows.every((r) => r?.[k] == null || typeof r?.[k] === 'number');

/** An array worth tabulating: 2+ objects that actually share a shape. */
function tabularColumns(rows: any[]): string[] | null {
  if (!Array.isArray(rows) || rows.length < 2) return null;
  if (!rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) return null;
  const counts = new Map<string, number>();
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      if (isPlumbing(k, v)) continue;
      // A column of nested objects/arrays does not belong in a table — those rows fall back.
      if (!isScalar(v)) continue;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  // "Share a shape" means a real INTERSECTION, not just overlapping key counts. Requiring only
  // "present on half the rows" let `[{a:1},{totally:'different'}]` through as a two-column table
  // where each row filled one column and left the other an em dash — a table that is worse than
  // the chips it replaced. Two keys every row actually has is the honest bar.
  const common = Object.keys(rows[0] ?? {}).filter(
    (k) => (counts.get(k) ?? 0) === rows.length,
  );
  if (common.length < 2) return null;

  // Columns are the common keys plus anything else most rows carry, in first-seen order, capped
  // so a wide payload stays readable.
  const ordered: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) {
    if (!ordered.includes(k) && (counts.get(k) ?? 0) >= Math.ceil(rows.length / 2)) ordered.push(k);
  }
  return ordered.slice(0, 7);
}


/**
 * "contacts" → "contact". Enough English to name a create action; nothing more is needed, because
 * the string only ever comes from a payload key we already chose to show as a column heading.
 */
function singularize(word: string): string {
  const w = word.toLowerCase();
  if (/ies$/.test(w)) return w.replace(/ies$/, 'y');
  if (/(s|x|z|ch|sh)es$/.test(w)) return w.replace(/es$/, '');
  if (/ss$/.test(w)) return w;
  return w.replace(/s$/, '');
}

// ── The rows are RECORDS, and a record you cannot open is a screenshot ───────
//
// Every id in these payloads was hidden as plumbing (`isPlumbing`, above) — correct, a raw uuid is
// not information, and wrong in one respect: it was the only thing that could make the table
// interactive. So the ids stay OUT of the columns and go INTO the links. `recordLinks.ts` answers
// what an id points at, which cell holds its name, and where that kind opens; the ⌘K palette owns
// the routes and the gates, so a link offered here opens exactly where the palette would send you.
//
// Two different gestures, because they are two different intentions:
//   • the row's own name OPENS THE PEEK — the detail, in place, without losing the conversation.
//   • a name belonging to some OTHER record (the supplier on an expense) is an anchor to that
//     record's page with target=_blank, because following it is leaving.
interface RecordLinkCtx {
  access: RecordLinkAccess;
  onPeek: (ref: RecordRef) => void;
  /** Which list this table is, and which chunk carried it — how a row learns what kind it is. */
  listKey?: string;
  resultType?: string;
}
const RecordLinkContext = createContext<RecordLinkCtx | null>(null);

/** The href for another record this row points at, or null when the persona cannot open it. */
function useRelatedHref(kind: string | null, id: unknown): string | null {
  const ctx = useContext(RecordLinkContext);
  if (!ctx || !kind || typeof id !== 'string' || !UUID_RE.test(id)) return null;
  if (!canOpenRecordKind(kind, ctx.access.gate)) return null;
  return recordRoute(kind, id, ctx.access.route);
}

/** Columns whose number is an amount — formatted with the row's currency instead of beside it. */
const MONEY_COL_RE = /(^|_)(total|amount|amount_due|amount_paid|price|value|subtotal|balance|due|paid|revenue|spend|cost|grand_total)$/i;

/**
 * One cell. Everything the plain `Scalar` did, plus: money reads with the row's own currency, a
 * status reads as a tag, and a name that belongs to a record becomes a way to that record.
 *
 * Money matters more than it looks. The chat's prose answer said `€328.00` and the card said
 * `328` in one column and `EUR` in another — the same six expenses reading as two different
 * answers depending on which half of the screen you looked at.
 *
 * `noLink` is for the cell that sits INSIDE the row's own open button: an anchor nested in a
 * button is invalid markup and gives one gesture two meanings.
 */
function Cell({ row, col, numeric, noLink }: { row: any; col: string; numeric: boolean; noLink?: boolean }) {
  const v = row?.[col];
  // The id this cell is the NAME of, if any: `supplier_name` ← `supplier_company_id`.
  const idKey = useMemo(() => {
    if (typeof v !== 'string' || !v) return null;
    for (const k of Object.keys(row ?? {})) {
      if (!recordKindForIdKey(k)) continue;
      if (labelKeyForIdKey(k, row) === col) return k;
    }
    return null;
  }, [row, col, v]);
  const recordHref = useRelatedHref(idKey ? recordKindForIdKey(idKey) : null, idKey ? row[idKey] : null);

  if (STATUS_KEYS.has(col) && typeof v === 'string' && v) {
    return <Badge variant={statusBadgeVariant(v)}>{labelizeValue(v)}</Badge>;
  }
  if (numeric && typeof v === 'number' && MONEY_COL_RE.test(col) && typeof row?.currency === 'string') {
    return <span>{formatMoney(v, row.currency)}</span>;
  }
  if (recordHref && !noLink) {
    return (
      <a
        href={recordHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {v}
      </a>
    );
  }
  return <Scalar v={v} />;
}

function RecordTable({ rows, columns, listKey }: { rows: any[]; columns: string[]; listKey?: string }) {
  const outer = useContext(RecordLinkContext);
  const ctx = outer && listKey ? { ...outer, listKey } : outer;
  // `currency` beside a money column is not a fact the reader needs as its own column — it is part
  // of the amount. Folded into `Cell` and dropped here.
  const shown = useMemo(() => {
    const hasMoney = columns.some((c) => MONEY_COL_RE.test(c) && isNumericCol(rows, c));
    return hasMoney ? columns.filter((c) => c !== 'currency') : columns;
  }, [columns, rows]);
  // The column the row is NAMED by: the first one that is neither a number nor a status.
  const nameCol = useMemo(
    () => shown.find((c) => !isNumericCol(rows, c) && !STATUS_KEYS.has(c)) ?? shown[0],
    [shown, rows],
  );

  return (
    <div className="-mx-1 overflow-x-auto custom-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-surface-sunken">
            {shown.map((c) => (
              <th
                key={c}
                className={`whitespace-nowrap px-2 py-1.5 text-[11px] font-semibold text-muted-foreground ${
                  isNumericCol(rows, c) ? 'text-right' : 'text-left'
                }`}
              >
                {labelize(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const self = ctx ? rowRecordRef(r, ctx.listKey, ctx.resultType) : null;
            const openable = self && canOpenRecordKind(self.kind, ctx!.access.gate) ? self : null;
            // A kind `get_record_peek` does not model has nothing to show in a dialog — opening
            // one would say "this record is no longer available" about a record that is fine. An
            // inbox thread, a moodboard, a catalog all have a PAGE, so they go there instead.
            const selfHref = openable && !recordSpec(openable.kind)?.peekable
              ? recordRoute(openable.kind, openable.id, ctx!.access.route)
              : null;
            return (
              <tr key={i} className="border-t border-hairline align-top">
                {shown.map((c) => {
                  const numeric = isNumericCol(rows, c);
                  const isName = c === nameCol;
                  return (
                    <td
                      key={c}
                      className={`px-2 py-1.5 ${numeric ? 'text-right tabular-nums' : 'text-left'}`}
                    >
                      {openable && isName && isScalar(r?.[c]) && r?.[c] != null && r?.[c] !== '' ? (
                        selfHref ? (
                          <a
                            href={selfHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-foreground underline decoration-dotted decoration-muted-foreground underline-offset-2 hover:text-primary hover:decoration-primary"
                            title={`Open this ${recordSpec(openable.kind)?.label.toLowerCase() ?? 'record'}`}
                          >
                            <Cell row={r} col={c} numeric={numeric} noLink />
                          </a>
                        ) : (
                          // A button, not a click-handling <td>: this has to work from the keyboard,
                          // and the row also carries anchors that must not open the peek instead.
                          <button
                            type="button"
                            onClick={() => ctx!.onPeek({ ...openable, title: String(r?.[c] ?? '') || null })}
                            className="text-left font-medium text-foreground underline decoration-dotted decoration-muted-foreground underline-offset-2 hover:text-primary hover:decoration-primary"
                            title={`Open this ${recordSpec(openable.kind)?.label.toLowerCase() ?? 'record'}`}
                          >
                            <Cell row={r} col={c} numeric={numeric} noLink />
                          </button>
                        )
                      ) : (
                        <Cell row={r} col={c} numeric={numeric} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The other records this payload points at, as chips. For a SINGLE-record result — `{invoice_id,
 * legal_number, customer_company_id, …}` — there is no table to hang links off, and the ids were
 * being dropped on the floor: the card told you an invoice was issued and gave you no way to
 * reach it or the customer it was issued to.
 */
function RelatedChips({ obj }: { obj: Record<string, any> }) {
  const ctx = useContext(RecordLinkContext);
  const refs = useMemo(() => {
    if (!ctx) return [];
    const seen = new Set<string>();
    return relatedRecordRefs(obj).filter((ref) => {
      if (!canOpenRecordKind(ref.kind, ctx.access.gate)) return false;
      const key = `${ref.kind}:${ref.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [obj, ctx]);

  if (!ctx || refs.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-hairline pt-2">
      {refs.map((ref) => {
        const spec = recordSpec(ref.kind);
        const Icon = spec?.icon ?? Link2;
        const label = <>
          <Icon className="h-3 w-3 shrink-0 text-primary" />
          <span className="truncate">{ref.title || spec?.label || ref.kind}</span>
        </>;
        const chip = 'inline-flex max-w-full items-center gap-1.5 rounded-sm border border-hairline px-2 py-1 text-xs text-foreground transition-colors hover:bg-primary/10';
        // Same split as a row: the peek is for kinds SQL can describe; everything else has a page.
        const chipHref = spec?.peekable ? null : recordRoute(ref.kind, ref.id, ctx.access.route);
        return chipHref ? (
          <a key={`${ref.key}-${ref.id}`} href={chipHref} target="_blank" rel="noopener noreferrer" className={chip}>
            {label}
          </a>
        ) : (
          <button key={`${ref.key}-${ref.id}`} type="button" onClick={() => ctx.onPeek(ref)} className={chip}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function KeyValues({ obj, depth = 0, inline = false }: { obj: any; depth?: number; inline?: boolean }) {
  if (obj == null || typeof obj !== 'object') return <Scalar v={obj} />;
  const entries = Object.entries(obj).filter(([k, v]) => !isPlumbing(k, v));
  if (entries.length === 0) return <span className="text-muted-foreground">Nothing to show</span>;
  return (
    <div className={inline ? 'flex flex-wrap gap-x-4 gap-y-0.5' : 'space-y-1.5'}>
      {entries.map(([k, v]) => (
        <div key={k} className={inline ? 'text-xs' : 'grid grid-cols-[140px_1fr] gap-2 text-xs items-start'}>
          <span className="text-muted-foreground">{labelize(k)}{inline ? ': ' : ''}</span>
          <div className="text-foreground"><Value v={v} depth={depth} listKey={k} /></div>
        </div>
      ))}
    </div>
  );
}

export const AgentResultCard: React.FC<{
  title: string;
  data: Record<string, any>;
  resultType?: string;
  /**
   * Ask the agent something on the user's behalf. This is how a result card offers the next
   * action — "Add contact" — WITHOUT becoming a second create path.
   *
   * Deliberately not a deep link to a `/crm/contacts/new` route: a CRM party must go through the
   * duplicate search before it exists (CLAUDE.md — `crm_company` is deliberately unbuilt as a
   * template type for exactly this reason), and a button that jumps past that is how duplicates
   * get made. Handing the intent back to the agent runs the real flow, and since `request_input`
   * exists the agent answers with a form on the canvas rather than an interrogation.
   */
  onAsk?: (prompt: string) => void;
  /**
   * Who is reading, from `useRecordLinkAccess()`. It is a PROP rather than a hook call inside the
   * card so this component stays renderable on its own — the card's own render test drives it with
   * `renderToStaticMarkup`, outside every provider, and a hook here would have made the presentation
   * layer untestable to unlock a link.
   *
   * Omitted = no record links and no peek. `recordLinks.test.ts` holds every call site to passing
   * it, because a silently link-less card is exactly the "offered but not bound" shape that hides.
   */
  access?: RecordLinkAccess;
}> = ({ title, data: rawData, resultType, onAsk, access }) => {
  // A chunk that wraps its whole answer in one `data` key — `{data: {count: 6, expenses: […]}}`,
  // which is what half the tools emit — used to render as a field LABELLED "Data" with the real
  // answer nested inside it: the shape of the JSON showing through as a heading, exactly the leak
  // the list-unwrapping below already exists to stop. On the canvas that is the whole artifact, so
  // the same six expenses read as a debug dump there and as a clean table in the chat.
  const data = useMemo(() => {
    let d = rawData;
    for (let i = 0; i < 2; i++) {
      const keys = d && typeof d === 'object' && !Array.isArray(d) ? Object.keys(d) : [];
      const inner = keys.length === 1 && (keys[0] === 'data' || keys[0] === 'result') ? (d as any)[keys[0]] : null;
      if (!inner || typeof inner !== 'object' || Array.isArray(inner)) break;
      d = inner;
    }
    return d;
  }, [rawData]);

  // Rail-3 reverse handoff: resolve the owning capability's page + Hub label.
  const capId = resultType ? RESULT_TYPE_CAPABILITY[resultType] : undefined;
  const recordId = capId && resultType ? (data?.[RESULT_RECORD_KEY[resultType]] as string | undefined) : undefined;
  const pageUrl = capId ? buildPageUrl(capId, recordId) : null;
  const hubLabel = capId ? capabilityHubLabel(capId) : undefined;
  const inRouter = useInRouterContext();

  const [peek, setPeek] = useState<RecordRef | null>(null);

  // The setup flow this list is fed by, when adding one is not something the agent can do.
  const setup = resultType ? RESULT_SETUP_DESTINATION[resultType] : undefined;
  const setupDest = setup ? getDestination(setup.destination) : undefined;

  const entries = Object.entries(data ?? {}).filter(([k, v]) => !isPlumbing(k, v));
  // The LIST this result is about — the one array among the fields. `{days: 7, appointments: []}`
  // is a list result with a scalar hint attached, not two peers.
  const listEntry = entries.find(([, v]) => Array.isArray(v)) as [string, any[]] | undefined;
  // An empty list renders its own empty state WITH the action in it, so the footer must not
  // repeat the same button four lines lower.
  const showsEmptyState = !!listEntry && listEntry[1].length === 0;

  // What this result is a LIST of, singular — "contacts" → "contact". Only list-shaped results
  // get a create action: "add another" makes sense under a list of contacts and makes none under
  // a single enrichment record or a calculation.
  const addLabel = listEntry && resultOffersCreate(resultType)
    ? singularize(labelize(listEntry[0]))
    : undefined;

  // Goes THERE, rather than telling the reader where "there" is. In-app when a router is around
  // (the Hub always has one); a plain anchor otherwise, so the card stays renderable on its own.
  const setupLink = setupDest ? (
    inRouter ? (
      <Link
        to={setupDest.route}
        className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-primary/10"
      >
        <Link2 className="h-3.5 w-3.5" />
        {setup!.label}
      </Link>
    ) : (
      <a
        href={setupDest.route}
        className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-primary/10"
      >
        <Link2 className="h-3.5 w-3.5" />
        {setup!.label}
      </a>
    )
  ) : null;

  const linkCtx = useMemo(
    () => (access ? { access, onPeek: setPeek, listKey: listEntry?.[0], resultType } : null),
    [access, listEntry, resultType],
  );

  return (
    <RecordLinkContext.Provider value={linkCtx}>
    <div className="bg-card text-card-foreground rounded-xl p-4 border border-border">
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      {/*
        A payload that is just a wrapper around one list — `{ flows: [...] }`, `{ deals: [...] }` —
        renders the table directly. Otherwise the card reads "Workspace flows" and then, one line
        below, a field label "Flows" above the same rows: the shape of the JSON leaking through as
        a heading nobody needs.
      */}
      {(() => {
        if (listEntry) {
          const [key, rows] = listEntry;
          // The commonest real payload on this platform is an EMPTY list — measured across saved
          // result messages, `{contracts: []}`, `{appointments: []}`, `{threads: []}`,
          // `{channels: []}`. It used to render as the card title, then the same word again as a
          // field label, then "None": three sayings of nothing and no way forward. CLAUDE.md's
          // rule is that an empty surface must offer the way out of being empty, and the card
          // already HAS the way out — the "Open in {Hub}" handoff below.
          if (rows.length === 0) {
            return (
              <HubEmptyState
                title={`No ${labelize(key).toLowerCase()} yet`}
                description={setupDest
                  // Naming the place AND linking to it: the description says where, the action
                  // goes there. This is the case the whole registry exists for — zero connected
                  // accounts is exactly when somebody needs the connect flow, not a paragraph.
                  ? `${setupDest.breadcrumb} is where these get set up.`
                  : hubLabel
                    ? `Nothing to show right now. ${hubLabel} is where these get created.`
                    : 'The search ran fine — there is simply nothing here yet.'}
                action={setupLink}
              />
            );
          }
          const cols = tabularColumns(rows);
          if (cols) {
            const rest = entries.filter(([k]) => k !== key);
            return (
              <>
                <RecordTable rows={rows} columns={cols} listKey={key} />
                {/* A scalar sitting beside the list is context for it (`days: 7` = the window
                    searched), so it reads under the table rather than above it. */}
                {rest.length > 0 && (
                  <div className="mt-2 border-t border-hairline pt-2">
                    <KeyValues obj={Object.fromEntries(rest)} />
                  </div>
                )}
              </>
            );
          }
        }
        return <KeyValues obj={data} />;
      })()}
      {/* A single-record result — "invoice issued", "deal saved" — has no table to hang links off,
          so the records it names get chips. Without this the card announced an invoice and gave
          you no way to reach it or the customer it was issued to. */}
      {!listEntry && <RelatedChips obj={data} />}
      {(pageUrl || addLabel || (setupLink && !showsEmptyState)) && (
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          {/* Where adding one means connecting something, the button is a LINK to that flow.
              Asking the agent instead is what produced "you'll need to go to Profile → Social
              Accounts" — a button whose entire effect was to name a place. */}
          {!showsEmptyState && setupLink}
          {/* A list you cannot act on is a report, not a product surface. The create action sits
              beside the handoff so "show me my contacts" is one click from "add another". */}
          {addLabel && onAsk && (
            <button
              type="button"
              onClick={() => onAsk(`Add a new ${addLabel}.`)}
              className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-primary/10"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {addLabel}
            </button>
          )}
          {pageUrl && (
            <button
              type="button"
              onClick={() => window.open(pageUrl, '_blank')}
              className="inline-flex items-center gap-1.5 rounded-sm border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open in {hubLabel || 'page'}
            </button>
          )}
        </div>
      )}
    </div>
      {access && (
        <RecordPeekDialog
          record={peek}
          onClose={() => setPeek(null)}
          routeContext={access.route}
          gateContext={access.gate}
        />
      )}
    </RecordLinkContext.Provider>
  );
};

export default AgentResultCard;
