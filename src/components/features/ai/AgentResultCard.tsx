import React from 'react';
import { ExternalLink } from 'lucide-react';
import { RESULT_TYPE_CAPABILITY, RESULT_RECORD_KEY, buildPageUrl, capabilityHubLabel } from '@/config/capabilities';

/**
 * #245 E — generic structured renderer for agent result chunks that were
 * previously emitted but shown as plain text (graph tools, trip-expense,
 * job-research, misc). One card, consistent layout, handles arbitrary JSON
 * payloads so all 19 chunk types become visible without 19 bespoke cards.
 *
 * #275 rail-3 — when the result maps to a page-backed capability, it also
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

function Scalar({ v }: { v: any }) {
  if (v == null || v === '') return <span className="text-muted-foreground">—</span>;
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>;
  if (typeof v === 'string') {
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

function KeyValues({ obj, depth = 0, inline = false }: { obj: any; depth?: number; inline?: boolean }) {
  if (obj == null || typeof obj !== 'object') return <Scalar v={obj} />;
  const entries = Object.entries(obj).filter(([k]) => !['timestamp', 'type'].includes(k));
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

export const AgentResultCard: React.FC<{ title: string; data: Record<string, any>; resultType?: string }> = ({ title, data, resultType }) => {
  // Rail-3 reverse handoff: resolve the owning capability's page + Hub label.
  const capId = resultType ? RESULT_TYPE_CAPABILITY[resultType] : undefined;
  const recordId = capId && resultType ? (data?.[RESULT_RECORD_KEY[resultType]] as string | undefined) : undefined;
  const pageUrl = capId ? buildPageUrl(capId, recordId) : null;
  const hubLabel = capId ? capabilityHubLabel(capId) : undefined;

  return (
    <div className="bg-card text-card-foreground rounded-xl p-4 border border-border">
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <KeyValues obj={data} />
      {pageUrl && (
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={() => window.open(pageUrl, '_blank')}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in {hubLabel || 'page'}
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentResultCard;
