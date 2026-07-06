/**
 * ArtifactInspector — the contextual detail panel beside the canvas artifact
 * (issue #253, P3). One slot, a different schema per artifact kind: sheet
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
  <div className="flex items-center justify-between gap-3 border-b border-white/8 py-2 text-[13px] last:border-0">
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
          className="w-full rounded-lg border border-white/10 object-cover"
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
              <span key={c} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-muted-foreground">
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
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-white/5">
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
