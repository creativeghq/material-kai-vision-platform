/**
 * ArtifactInspector — the contextual detail panel beside the canvas artifact.
 * One slot, a different schema per artifact kind: sheet
 * details, virtual-staging parameters, or a material-search summary. Purely
 * presentational — it reads the same message data fields the cards render from.
 */
import React from 'react';
import { ArrowUpRight } from 'lucide-react';

const humanize = (s?: string): string =>
  (s || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

const primaryImageUrl = (p: any): string | undefined => {
  const imgs = p?.images;
  if (!Array.isArray(imgs) || imgs.length === 0) return undefined;
  const primary = imgs.find((i: any) => i?.isPrimary) || imgs[0];
  return primary?.url;
};

const SectionH: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</div>
);

const Field: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <div className="flex items-center justify-between gap-3 border-b border-border py-2 text-[13px] last:border-0">
    <span className="text-muted-foreground">{k}</span>
    <span className="max-w-[62%] truncate text-right font-medium text-foreground">{v}</span>
  </div>
);

const Shell: React.FC<{ kicker: string; title: string; children: React.ReactNode }> = ({ kicker, title, children }) => (
  <div className="flex flex-col gap-5 p-4">
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">{kicker}</div>
      <h3 className="mt-0.5 font-display text-base font-semibold leading-tight text-foreground">{title}</h3>
    </div>
    {children}
  </div>
);

export const QuoteInspector: React.FC<{ data: any }> = ({ data }) => {
  const sym = data?.currency === 'USD' ? '$' : data?.currency === 'GBP' ? '£' : '€';
  const fmt = (v?: number | null) => (v == null ? '—' : `${sym}${Number(v).toFixed(2)}`);
  return (
    <Shell kicker="Quote" title={data?.name || 'Quote'}>
      {data?.quote_number && <div className="-mt-3.5 text-[13px] text-muted-foreground">{data.quote_number}</div>}
      <div>
        <SectionH>Totals</SectionH>
        {data?.item_count != null && <Field k="Items" v={String(data.item_count)} />}
        <Field k="Subtotal" v={fmt(data?.subtotal)} />
        <Field k={`VAT${data?.vat_rate != null ? ` (${data.vat_rate}%)` : ''}`} v={fmt(data?.vat_amount)} />
        <Field k="Total" v={<span className="font-semibold text-foreground">{fmt(data?.grand_total)}</span>} />
      </div>
      <button
        onClick={() => window.open(`/quotes/${data?.quote_id}`, '_blank')}
        className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-primary transition-opacity hover:opacity-80"
      >
        Open in Quotes <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </Shell>
  );
};

export const SheetInspector: React.FC<{ data: any }> = ({ data }) => (
  <Shell kicker={`Sheet · ${humanize(data.sheet_type) || 'sheet'}`} title={data.title || 'Presentation sheet'}>
    <div>
      <SectionH>Details</SectionH>
      <Field k="Type" v={humanize(data.sheet_type) || '—'} />
      <Field k="Format" v="A3 landscape" />
      {data.page_count != null && <Field k="Pages" v={String(data.page_count)} />}
      <Field k="Credits" v={`${data.credits_used ?? 0} cr`} />
    </div>
    {data.pdf_url && (
      <a
        href={data.pdf_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Open PDF <ArrowUpRight className="h-4 w-4" />
      </a>
    )}
  </Shell>
);

export const StagingInspector: React.FC<{ data: any }> = ({ data }) => (
  <Shell kicker="Virtual staging" title={data.furniture_style ? `${humanize(data.furniture_style)}` : 'Virtual staging'}>
    {data.source_image_url && (
      <div>
        <SectionH>Source</SectionH>
        <img
          src={data.source_image_url}
          alt="Source room"
          className="w-full rounded-lg border border-border object-cover"
          style={{ maxHeight: 140 }}
        />
      </div>
    )}
    <div>
      <SectionH>Parameters</SectionH>
      {data.furniture_style && <Field k="Style" v={humanize(data.furniture_style)} />}
      {data.room && <Field k="Room" v={humanize(data.room)} />}
      <Field k="Credits" v={`${data.credits_used ?? 0} cr`} />
    </div>
  </Shell>
);

export const WorldInspector: React.FC<{ data: any }> = ({ data }) => (
  <Shell kicker="3D / VR world" title={data.caption || data.prompt || 'VR world'}>
    <div>
      <SectionH>Details</SectionH>
      {data.status && <Field k="Status" v={humanize(data.status)} />}
      <Field k="Collider" v={data.colliderGlbUrl ? 'Included' : '—'} />
      <Field k="Quality tiers" v={[data.splatUrl100k && 'draft', data.splatUrl500k && 'standard', data.splatUrlFull && 'full'].filter(Boolean).join(' · ') || '—'} />
    </div>
    {data.prompt && (
      <div>
        <SectionH>Prompt</SectionH>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{data.prompt}</p>
      </div>
    )}
  </Shell>
);

export const RenderInspector: React.FC<{ data: any }> = ({ data }) => {
  const models: any[] = Array.isArray(data?.models) ? data.models : [];
  return (
    <Shell kicker="Room generation" title={data?.room_type ? humanize(data.room_type) : 'Room generation'}>
      <div>
        <SectionH>Details</SectionH>
        {data?.room_type && <Field k="Room" v={humanize(data.room_type)} />}
        {data?.style && <Field k="Style" v={humanize(data.style)} />}
        <Field k="Models" v={data?.model_count ?? models.length} />
      </div>
      {models.length > 0 && (
        <div>
          <SectionH>Models</SectionH>
          <div className="flex flex-wrap gap-1.5">
            {models.map((m, i) => (
              <span key={m?.id || i} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {m?.name || m?.id || 'model'}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <SectionH>Per-image actions</SectionH>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Click any image in the grid to save to a moodboard, find materials, edit, or generate a
          VR world, video, or virtual staging from it.
        </p>
      </div>
    </Shell>
  );
};

export const BoardInspector: React.FC<{ data: any }> = ({ data }) => (
  <Shell kicker="Materials board" title={humanize(data.board_mode) || 'Materials board'}>
    <div>
      <SectionH>Details</SectionH>
      {data.board_mode && <Field k="Mode" v={humanize(data.board_mode)} />}
      <Field k="Credits" v={`${data.credits_used ?? 0} cr`} />
    </div>
  </Shell>
);

export const ProductsInspector: React.FC<{ data: any }> = ({ data }) => {
  const products: any[] = Array.isArray(data?.products) ? data.products : [];
  const count = products.length;
  const categories = Array.from(
    new Set(products.map((p) => p?.category).filter((c): c is string => typeof c === 'string' && c.length > 0)),
  );
  return (
    <Shell kicker="Material search" title={data?.title || `${count} products`}>
      <div>
        <SectionH>Summary</SectionH>
        <Field k="Results" v={count} />
        {categories.length > 0 && <Field k="Categories" v={categories.length} />}
      </div>
      {categories.length > 0 && (
        <div>
          <SectionH>Categories</SectionH>
          <div className="flex flex-wrap gap-1.5">
            {categories.slice(0, 8).map((c) => (
              <span key={c} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
      <div>
        <SectionH>Products</SectionH>
        <div className="flex flex-col gap-1.5">
          {products.slice(0, 12).map((p, i) => {
            const url = primaryImageUrl(p);
            return (
              <div key={p?.id || i} className="flex items-center gap-2.5">
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted/40">
                  {url && <img src={url} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-foreground">{p?.name || 'Untitled'}</div>
                  {p?.category && <div className="truncate text-[11px] text-muted-foreground">{p.category}</div>}
                </div>
              </div>
            );
          })}
          {count > 12 && <div className="pt-1 text-[11px] text-muted-foreground">+{count - 12} more</div>}
        </div>
      </div>
    </Shell>
  );
};

// ── Data-card inspectors ─────────────────────────────────────────
export const JobFindingsInspector: React.FC<{ data: any }> = ({ data }) => {
  const listings: any[] = Array.isArray(data?.listings) ? data.listings : [];
  const remote = listings.filter((l) => l?.is_remote).length;
  const win = data?.discovered_at_window === 'last_24h' ? 'Last 24h' : humanize(data?.discovered_at_window) || '—';
  return (
    <Shell kicker="Job findings" title={data?.tracked_job_label || 'Job digest'}>
      <div>
        <SectionH>Summary</SectionH>
        <Field k="Matches" v={listings.length} />
        <Field k="Remote" v={remote} />
        <Field k="Window" v={win} />
      </div>
    </Shell>
  );
};

export const SourcingInspector: React.FC<{ data: any }> = ({ data }) => (
  <Shell kicker="Supply options" title={`Quantity ${data?.quantity ?? '—'}`}>
    <div>
      <SectionH>Sources</SectionH>
      <Field k="Warehouse" v={data?.counts?.warehouse ?? 0} />
      <Field k="Inbound PO" v={data?.counts?.inbound_po ?? 0} />
      <Field k="Supplier" v={data?.counts?.supplier ?? 0} />
    </div>
  </Shell>
);

export const OrderInspector: React.FC<{ created?: any; sent?: any }> = ({ created, sent }) => (
  <Shell kicker="Purchase order" title={sent?.order_number ? `PO ${sent.order_number}` : 'Purchase orders'}>
    <div>
      <SectionH>Details</SectionH>
      {created && <Field k="Drafts created" v={created.purchase_orders_created ?? 0} />}
      {created && <Field k="Allocations" v={created.allocations_created ?? 0} />}
      {sent?.order_number && <Field k="PO #" v={sent.order_number} />}
      {sent?.recipient && <Field k="Recipient" v={sent.recipient} />}
    </div>
    {sent?.pdf_url && (
      <a
        href={sent.pdf_url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
      >
        Open PDF <ArrowUpRight className="h-4 w-4" />
      </a>
    )}
  </Shell>
);

export const MentionSummaryInspector: React.FC<{ data: any }> = ({ data }) => {
  const s = data?.summary || {};
  const bs = s.by_sentiment || {};
  return (
    <Shell kicker="Mention summary" title={`Last ${data?.days ?? '—'} days`}>
      <div>
        <SectionH>Totals</SectionH>
        <Field k="Total" v={s.total_count ?? 0} />
        <Field k="Positive" v={bs.positive ?? 0} />
        <Field k="Neutral" v={bs.neutral ?? 0} />
        <Field k="Negative" v={bs.negative ?? 0} />
      </div>
      {Array.isArray(s.top_outlets) && s.top_outlets.length > 0 && (
        <div>
          <SectionH>Top outlets</SectionH>
          <div className="flex flex-wrap gap-1.5">
            {s.top_outlets.slice(0, 8).map((o: any) => (
              <span key={o.domain} className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                {o.domain} · {o.count}
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
};

export const MentionFeedInspector: React.FC<{ data: any }> = ({ data }) => {
  const rows: any[] = Array.isArray(data?.rows) ? data.rows : [];
  return (
    <Shell kicker="Mention feed" title={`Last ${data?.days ?? '—'} days`}>
      <div>
        <SectionH>Summary</SectionH>
        <Field k="Mentions" v={rows.length} />
        {data?.sentiment_filter && <Field k="Filter" v={humanize(data.sentiment_filter)} />}
      </div>
    </Shell>
  );
};

export const LlmVisibilityInspector: React.FC<{ data: any }> = ({ data }) => {
  const snap = data?.snapshot;
  if (!snap?.present) {
    return (
      <Shell kicker="LLM visibility" title="No probes yet">
        <div className="text-[13px] text-muted-foreground">No probes recorded.</div>
      </Shell>
    );
  }
  return (
    <Shell kicker="LLM visibility" title={data?.forced ? 'Fresh probe' : 'Snapshot'}>
      <div>
        <SectionH>Metrics</SectionH>
        <Field k="Share of voice" v={`${Math.round((snap.share_of_voice || 0) * 100)}%`} />
        <Field k="Average rank" v={snap.avg_position ? `#${Number(snap.avg_position).toFixed(1)}` : '—'} />
      </div>
    </Shell>
  );
};

export const CatalogInspector: React.FC<{ data: any; material?: string }> = ({ data, material }) => {
  const candidates: any[] = Array.isArray(data?.candidates) ? data.candidates : [];
  return (
    <Shell kicker="Catalog" title={material || data?.query || 'Candidates'}>
      <div>
        <SectionH>Details</SectionH>
        <Field k="Candidates" v={candidates.length} />
        {data?.query && <Field k="Query" v={data.query} />}
      </div>
    </Shell>
  );
};
