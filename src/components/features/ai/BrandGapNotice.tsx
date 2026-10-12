import React from 'react';
import { Link } from 'react-router-dom';
import { Info } from 'lucide-react';

const BRAND_CATEGORIES: Record<string, string> = {
  provenance: 'who wrote it and whether AI was used',
  firsthand_experience: 'your own experience, data and examples',
};

/** Findings answered once in the website's Brand settings, not by rewriting this article. */
export function brandGaps(analysis: unknown): string[] {
  const fixes = (analysis as { fixes?: Array<{ category?: string }> } | null)?.fixes;
  if (!Array.isArray(fixes)) return [];
  return [...new Set(fixes.map((f) => f?.category).filter((c): c is string => !!c && c in BRAND_CATEGORIES))];
}

export const BrandGapNotice: React.FC<{ analysis: unknown; websiteId: string | null }> = ({ analysis, websiteId }) => {
  const gaps = brandGaps(analysis);
  if (!gaps.length) return null;
  return (
    <div className="flex items-start gap-2 rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>
        Not a writing problem: the article has nothing on {gaps.map((g) => BRAND_CATEGORIES[g]).join(' or ')}.{' '}
        {websiteId ? (
          <Link className="text-primary underline" to={`/websites/${websiteId}?section=brand`}>Set it once under Brand</Link>
        ) : 'Set it once under the website’s Brand settings'}
        {' '}and every article written after that carries it.
      </span>
    </div>
  );
};
