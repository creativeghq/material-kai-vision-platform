import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, MessageSquare } from 'lucide-react';

/**
 * #244 C — surface monitoring intel where a product is quoted/viewed.
 * Reads the denormalized snapshot off the product's internal tracked_queries
 * (price) + tracked_mentions (mentions/sentiment) rows. Renders nothing when the
 * product isn't monitored or RLS doesn't expose the rows — purely additive.
 */
export const MarketIntelCard: React.FC<{ productId: string; className?: string }> = ({ productId, className }) => {
  const [loading, setLoading] = useState(true);
  const [price, setPrice] = useState<{ current_price: number | null; current_currency: string | null; current_price_updated_at: string | null } | null>(null);
  const [mention, setMention] = useState<{ current_mention_count_7d: number | null; current_sentiment_avg: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!productId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const [pq, mq] = await Promise.all([
        supabase.from('tracked_queries')
          .select('current_price,current_currency,current_price_updated_at')
          .is('api_key_id', null).eq('product_id', productId).limit(1).maybeSingle(),
        supabase.from('tracked_mentions')
          .select('current_mention_count_7d,current_sentiment_avg')
          .is('api_key_id', null).eq('product_id', productId).limit(1).maybeSingle(),
      ]);
      if (cancelled) return;
      setPrice(pq.data as any); setMention(mq.data as any); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [productId]);

  if (loading) return null;
  const hasPrice = price?.current_price != null;
  const hasMention = mention?.current_mention_count_7d != null;
  if (!hasPrice && !hasMention) return null;

  return (
    <div className={`rounded-md border border-border/60 bg-background/40 px-3 py-2 ${className ?? ''}`}>
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 flex items-center gap-1">
        <LineChart className="h-3 w-3" /> Market intel
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
        {hasPrice && (
          <span>
            Market price: <strong>{price!.current_price} {price!.current_currency || ''}</strong>
            {price!.current_price_updated_at && (
              <span className="text-muted-foreground"> · {new Date(price!.current_price_updated_at).toLocaleDateString()}</span>
            )}
          </span>
        )}
        {hasMention && (
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <strong>{mention!.current_mention_count_7d}</strong> mentions (7d)
            {mention!.current_sentiment_avg != null && (
              <span className="text-muted-foreground"> · sentiment {Number(mention!.current_sentiment_avg).toFixed(1)}</span>
            )}
          </span>
        )}
      </div>
    </div>
  );
};

export default MarketIntelCard;
