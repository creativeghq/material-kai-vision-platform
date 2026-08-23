import React from 'react';
import { ExternalLink, Plus, Link2 } from 'lucide-react';
import { Link, useInRouterContext } from 'react-router-dom';
import {
  RESULT_TYPE_CAPABILITY, RESULT_RECORD_KEY, RESULT_SETUP_DESTINATION,
  buildPageUrl, capabilityHubLabel, resultOffersCreate,
} from '@/config/capabilities';
import { getDestination } from '@/config/appDestinations';
import { Badge } from '@/components/core/ui/badge';
import { formatDate } from '@/utils/datetime';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';

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
    if (ENUM_VALUE_RE.test(v)) return <span>{labelize(v)}</span>;
    if (IMG_URL_RE.test(v)) {
      return (
        <a href={v} target="_blank" rel="noopener noreferrer" className="inline-block" aria-label="Open image in a new tab">
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
        <a href={v} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
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
function Value({ v, depth = 0 }: { v: any; depth?: number }) {
  if (isScalar(v)) return <Scalar v={v} />;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-muted-foreground">None</span>;
    const cols = tabularColumns(v);
    if (cols) return <RecordTable rows={v} columns={cols} />;
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

/** Status-ish values map onto the semantic badge tints; anything unknown stays neutral. */
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  active: 'success', live: 'success', published: 'success', completed: 'success', done: 'success',
  paid: 'success', approved: 'success', sent: 'success', verified: 'success', enabled: 'success',
  pending: 'warning', draft: 'warning', processing: 'warning', queued: 'warning', partial: 'warning',
  failed: 'error', error: 'error', cancelled: 'error', canceled: 'error', overdue: 'error', rejected: 'error',
  paused: 'neutral', archived: 'neutral', inactive: 'neutral', disabled: 'neutral',
};
const STATUS_KEYS = new Set(['status', 'state', 'stage', 'tier', 'severity', 'ring', 'payment_status']);

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

function RecordTable({ rows, columns }: { rows: any[]; columns: string[] }) {
  return (
    <div className="-mx-1 overflow-x-auto custom-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-surface-sunken">
            {columns.map((c) => (
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
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-hairline align-top">
              {columns.map((c) => {
                const v = r?.[c];
                const numeric = isNumericCol(rows, c);
                return (
                  <td
                    key={c}
                    className={`px-2 py-1.5 ${numeric ? 'text-right tabular-nums' : 'text-left'}`}
                  >
                    {STATUS_KEYS.has(c) && typeof v === 'string' && v
                      ? <Badge variant={STATUS_VARIANT[v.toLowerCase()] ?? 'neutral'}>{v}</Badge>
                      : <Scalar v={v} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
          <div className="text-foreground"><Value v={v} depth={depth} /></div>
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
}> = ({ title, data, resultType, onAsk }) => {
  // Rail-3 reverse handoff: resolve the owning capability's page + Hub label.
  const capId = resultType ? RESULT_TYPE_CAPABILITY[resultType] : undefined;
  const recordId = capId && resultType ? (data?.[RESULT_RECORD_KEY[resultType]] as string | undefined) : undefined;
  const pageUrl = capId ? buildPageUrl(capId, recordId) : null;
  const hubLabel = capId ? capabilityHubLabel(capId) : undefined;
  const inRouter = useInRouterContext();

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

  return (
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
                <RecordTable rows={rows} columns={cols} />
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
  );
};

export default AgentResultCard;
