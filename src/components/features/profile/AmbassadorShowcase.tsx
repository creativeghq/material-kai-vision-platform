/**
 * The public half of an ambassadorship: what a visitor sees on somebody's profile.
 *
 * Organised BY CATEGORY, because that is the question people arrive with — "who do you use for
 * sanitary?" — not "list the brands you like". A brand promoted in two categories appears under
 * both; that is the claim, not a duplicate.
 *
 * Shared by the public profile page and the Discover profile modal so the two cannot drift; the
 * old version was a copy-pasted grid of grey boxes in each.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, ExternalLink, Layers, ShieldCheck, Star } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import {
  groupByCategory, isPubliclyVisible, relationshipDef, sortForDisplay,
  type Ambassadorship,
} from '@/lib/ambassadorships';

interface Props {
  ambassadorships: Ambassadorship[];
  /** Public moodboards of the profile owner, so a showcase link only renders if it can be opened. */
  publicMoodboardIds?: Set<string>;
  className?: string;
}

function BrandLine({ a, publicMoodboardIds }: { a: Ambassadorship; publicMoodboardIds?: Set<string> }) {
  const rel = relationshipDef(a.relationship);
  const showcase = a.showcase_moodboard_id && publicMoodboardIds?.has(a.showcase_moodboard_id)
    ? a.showcase_moodboard_id : null;

  return (
    <div className="rounded-lg border border-hairline bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-sm">{a.brand_name}</span>
        {a.verification_status === 'verified' && (
          <Badge variant="success" className="text-[11px] gap-1">
            <ShieldCheck className="h-3 w-3" />Confirmed by brand
          </Badge>
        )}
        {a.is_featured && (
          <Badge variant="info" className="text-[11px] gap-1"><Star className="h-3 w-3" />Featured</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {rel.publicPrefix} {a.brand_name}
        {a.since_year ? ` · since ${a.since_year}` : ''}
        {a.brand_country ? ` · ${a.brand_country}` : ''}
      </p>
      {a.headline && <p className="text-sm text-foreground/80 mt-2">{a.headline}</p>}
      {(showcase || a.brand_url) && (
        <div className="flex flex-wrap items-center gap-3 mt-2">
          {showcase && (
            <Link to={`/board/${showcase}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />See the work
            </Link>
          )}
          {a.brand_url && (
            <a
              href={a.brand_url} target="_blank" rel="noopener noreferrer nofollow"
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />Brand site
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export const AmbassadorShowcase: React.FC<Props> = ({ ambassadorships, publicMoodboardIds, className }) => {
  // A claim the brand declined never appears here. RLS already hides it from everyone else; this
  // is what stops the OWNER's own view of their public profile from showing something a visitor
  // cannot see.
  const visible = ambassadorships.filter(isPubliclyVisible);
  if (visible.length === 0) return null;

  const featured = sortForDisplay(visible.filter((a) => a.is_featured));
  const groups = groupByCategory(visible);

  return (
    <div className={className}>
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-4 text-primary">
        <BadgeCheck className="h-4 w-4" /> Brand Ambassador
      </h3>

      {featured.length > 0 && (
        <div className="mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Lead brands
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {featured.map((a) => (
              <BrandLine key={`featured-${a.id}`} a={a} publicMoodboardIds={publicMoodboardIds} />
            ))}
          </div>
        </div>
      )}

      <div className="space-y-5">
        {groups.map((g) => (
          <div key={g.categoryKey || 'other'}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              {g.label}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {g.items.map((a) => (
                <BrandLine key={`${g.categoryKey}-${a.id}`} a={a} publicMoodboardIds={publicMoodboardIds} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
