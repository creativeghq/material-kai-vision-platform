/**
 * What was posted about this listing (#378 N6).
 *
 * THE FINDING, AND THE HALF OF IT THAT WAS ALREADY TRUE
 * ----------------------------------------------------
 * The issue says "marketing content connects to nothing it markets… marketing ROI is structurally
 * unanswerable rather than merely unreported". Half right, and the true half is the interesting
 * one: `real-estate-listing-social` has always announced a published listing and always recorded
 * WHICH property it announced — as `metadata->>'property_id'`, a jsonb key with no foreign key, no
 * index and nothing able to JOIN it. The data was being written and was unreachable to any
 * derivation, which is a different defect from "the link does not exist".
 *
 * `social_posts.property_id` is a real column now, and this is its reader: the announcement is
 * visible where the listing lives instead of only in the social module.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not compute engagement or reach. `social_post_analytics` is a separate table with its
 * own collectors, and a second surface totalling those numbers is a second derivation of them.
 * This says what went out and what state it is in — the question the property page could not
 * answer at all.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Share2 } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { formatDate } from '@/utils/datetime';

interface ListingPost {
  id: string;
  platform: string | null;
  status: string | null;
  caption: string | null;
  scheduled_at: string | null;
  published_at: string | null;
  created_at: string;
}

export const ListingSocialPostsCard: React.FC<{ propertyId: string }> = ({ propertyId }) => {
  const { toast } = useToast();
  const [posts, setPosts] = useState<ListingPost[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('social_posts')
        .select('id, platform, status, caption, scheduled_at, published_at, created_at')
        // The COLUMN. Reading `metadata->>property_id` would work and is exactly the shape this
        // change exists to retire — no FK, no index, unjoinable.
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      setPosts((data ?? []) as ListingPost[]);
    } catch (err) {
      toast({ title: 'Could not load posts', description: getErrorMessage(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [propertyId, toast]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="dashboard-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Share2 className="h-4 w-4" /> Posted about this listing
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0">
        {posts.length === 0 ? (
          // Saying WHEN posts appear beats an empty box: this is automatic on publish, so "none"
          // usually means the listing is not live yet or no social account is connected — both
          // fixable, and neither obvious from a blank panel.
          <p className="text-sm text-muted-foreground">
            Nothing posted yet. A draft is created automatically for each connected social account
            when the listing goes publicly live.
          </p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li key={p.id} className="flex items-start gap-3 border-b border-border/30 pb-2 last:border-0">
                <Badge variant="neutral" className="mt-0.5 shrink-0 text-[10px] capitalize">
                  {p.platform ?? 'social'}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{p.caption ?? <span className="text-muted-foreground">No caption</span>}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.published_at
                      ? `Published ${formatDate(p.published_at)}`
                      : p.scheduled_at
                        ? `Scheduled ${formatDate(p.scheduled_at)}`
                        : `Drafted ${formatDate(p.created_at)}`}
                  </p>
                </div>
                <span className={`shrink-0 text-[10px] ${statusTone(p.status ?? 'draft')}`}>{p.status ?? 'draft'}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
