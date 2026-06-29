import React from 'react';

/**
 * #245 E — generic structured renderer for agent result chunks that were
 * previously emitted but shown as plain text (graph tools, trip-expense,
 * job-research, misc). One card, consistent layout, handles arbitrary JSON
 * payloads so all 19 chunk types become visible without 19 bespoke cards.
 */

const isScalar = (v: any) => v == null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const labelize = (k: string) => k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function Scalar({ v }: { v: any }) {
  if (v == null || v === '') return <span className="text-white/40">—</span>;
  if (typeof v === 'boolean') return <span>{v ? 'Yes' : 'No'}</span>;
  return <span>{String(v)}</span>;
}

// One value, rendered to a sensible depth (objects 1 level, arrays capped).
function Value({ v, depth = 0 }: { v: any; depth?: number }) {
  if (isScalar(v)) return <Scalar v={v} />;
  if (Array.isArray(v)) {
    if (v.length === 0) return <span className="text-white/40">none</span>;
    const shown = v.slice(0, 8);
    return (
      <div className="space-y-1">
        {shown.map((item, i) => (
          <div key={i} className="rounded bg-white/5 px-2 py-1 text-xs">
            {isScalar(item) ? <Scalar v={item} /> : <KeyValues obj={item} depth={depth + 1} inline />}
          </div>
        ))}
        {v.length > shown.length && <div className="text-[11px] text-white/50">+ {v.length - shown.length} more</div>}
      </div>
    );
  }
  // object
  if (depth >= 2) return <span className="text-white/50">{Object.keys(v).length} fields</span>;
  return <KeyValues obj={v} depth={depth + 1} />;
}

function KeyValues({ obj, depth = 0, inline = false }: { obj: any; depth?: number; inline?: boolean }) {
  if (obj == null || typeof obj !== 'object') return <Scalar v={obj} />;
  const entries = Object.entries(obj).filter(([k]) => !['timestamp', 'type'].includes(k));
  if (entries.length === 0) return <span className="text-white/40">—</span>;
  return (
    <div className={inline ? 'flex flex-wrap gap-x-4 gap-y-0.5' : 'space-y-1.5'}>
      {entries.map(([k, v]) => (
        <div key={k} className={inline ? 'text-xs' : 'grid grid-cols-[140px_1fr] gap-2 text-xs items-start'}>
          <span className="text-white/50">{labelize(k)}{inline ? ': ' : ''}</span>
          <div className="text-white/90"><Value v={v} depth={depth} /></div>
        </div>
      ))}
    </div>
  );
}

export const AgentResultCard: React.FC<{ title: string; data: Record<string, any> }> = ({ title, data }) => {
  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10">
      <div className="text-xs text-white/60 mb-2">{title}</div>
      <KeyValues obj={data} />
    </div>
  );
};

export default AgentResultCard;
