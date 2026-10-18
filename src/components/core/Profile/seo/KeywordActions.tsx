import React, { useState } from 'react';
import { Check, Copy, FileText, Loader2, Search, Target } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { userWebsitesService } from '@/services/userWebsitesService';
import { useTrackedKeywords } from './useWebsiteKeywords';

type Busy = 'track' | 'research' | 'article' | null;

const IconButton: React.FC<{ label: string; onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode }> = ({
  label, onClick, disabled, busy, children,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0" aria-label={label} disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onClick(); }}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{label}</TooltipContent>
  </Tooltip>
);

/**
 * Track · Research · Write article · Copy, for any row that shows a keyword. The ONE place a person
 * tracks a keyword; research and writing run here, on the page, and land in Keywords → Research
 * and Articles.
 */
export const KeywordActions: React.FC<{
  websiteId: string; keyword: string; className?: string;
  /** Called after a research or article run starts or finishes, so the list showing it can reload. */
  onDone?: (kind: 'track' | 'research' | 'article') => void;
}> = ({ websiteId, keyword, className, onDone }) => {
  const { toast } = useToast();
  const { tracked } = useTrackedKeywords(websiteId);
  const [busy, setBusy] = useState<Busy>(null);
  const isTracked = tracked.has(keyword.trim().toLowerCase());

  const run = async (kind: Exclude<Busy, null>, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    try { await fn(); onDone?.(kind); } catch (e) {
      toast({ title: 'That did not work', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const track = () => run('track', async () => {
    const r = await userWebsitesService.trackKeywords(websiteId, [keyword]);
    toast({ title: r.added ? `Tracking "${keyword}"` : `"${keyword}" was already tracked`, description: r.market ? `${r.market.country_code} · ${r.market.language_code}` : undefined });
  });
  const research = () => run('research', async () => {
    const r = await userWebsitesService.researchKeyword(websiteId, keyword);
    toast({ title: `Research ready: "${keyword}"`, description: r.credits_used ? `${r.credits_used} credits. Open Keywords → Research to read it.` : 'From the last 30 days, at no charge. Open Keywords → Research.' });
  });
  const article = () => run('article', async () => {
    if (!window.confirm(`Write a full article for "${keyword}"? It researches, plans and writes it, and is charged in credits at the real cost. It appears in Articles.`)) return;
    await userWebsitesService.writeArticle(websiteId, keyword);
    toast({ title: `Writing an article on "${keyword}"`, description: 'It appears in Articles and fills in as each stage finishes.' });
  });
  const copy = async () => {
    try { await navigator.clipboard.writeText(keyword); toast({ title: 'Copied' }); }
    catch { toast({ title: 'Copy failed', variant: 'destructive' }); }
  };

  return (
    <div className={cn('flex shrink-0 items-center gap-0.5', className)}>
      {isTracked ? (
        <IconButton label="Tracked in the rank tracker" onClick={() => undefined} disabled>
          <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
        </IconButton>
      ) : (
        <IconButton label="Track in the rank tracker" onClick={() => void track()} busy={busy === 'track'} disabled={!!busy}>
          <Target className="h-3.5 w-3.5" />
        </IconButton>
      )}
      <IconButton label="Research this keyword (charged credits; a repeat within 30 days is free)" onClick={() => void research()} busy={busy === 'research'} disabled={!!busy}>
        <Search className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Write an article for it (charged credits)" onClick={() => void article()} busy={busy === 'article'} disabled={!!busy}>
        <FileText className="h-3.5 w-3.5" />
      </IconButton>
      <IconButton label="Copy" onClick={() => void copy()}>
        <Copy className="h-3.5 w-3.5" />
      </IconButton>
    </div>
  );
};
