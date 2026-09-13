/**
 * The public recall notice (#450) — GPSR art. 36(2).
 *
 * Seven elements, in a fixed order, under a headline that is not ours to phrase. No auth: a person
 * who owns the product has to be able to read it from a link in an email or on a shelf card.
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PublicRecall {
  headline: string;
  language: string;
  product_description: string | null;
  hazard_description: string | null;
  consumer_action: string | null;
  remedies: string | null;
  contact_channel: string | null;
  share_encouragement: string | null;
  batch_codes: string[] | null;
  published_at: string | null;
  closed_at: string | null;
  issuer: string | null;
}

const PublicRecallPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [recall, setRecall] = useState<PublicRecall | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_recall' as never, {
          p_token: token ?? '',
        } as never);
        if (cancelled) return;
        if (error) { setFailed(true); setRecall(null); }
        else { setRecall((data as unknown as PublicRecall) ?? null); setFailed(false); }
      } catch {
        if (!cancelled) { setFailed(true); setRecall(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading the notice…
        </p>
      </main>
    );
  }

  if (failed || !recall) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md space-y-2 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground" />
          <h1 className="text-lg font-semibold">This notice is not available</h1>
          <p className="text-sm text-muted-foreground">
            The link may be wrong, or the notice may not have been published. It is not a statement
            that there is no recall — ask the seller.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <article className="mx-auto max-w-2xl space-y-5">
        <header className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <h1 className="text-xl font-semibold text-destructive">{recall.headline}</h1>
          {recall.issuer && (
            <p className="mt-1 text-sm text-muted-foreground">Issued by {recall.issuer}</p>
          )}
          {recall.published_at && (
            <p className="text-sm text-muted-foreground tabular-nums">
              Published {recall.published_at.slice(0, 10)}
            </p>
          )}
        </header>

        <Block title="The product" body={recall.product_description} />
        {(recall.batch_codes?.length ?? 0) > 0 && (
          <Block title="Affected batches" body={recall.batch_codes?.join(', ') ?? null} />
        )}
        <Block title="The hazard" body={recall.hazard_description} />
        <Block title="What to do" body={recall.consumer_action} />
        <Block title="What you are entitled to" body={recall.remedies} />
        <Block title="How to reach us" body={recall.contact_channel} />
        <Block title="Please pass this on" body={recall.share_encouragement} />

        {recall.closed_at && (
          <p className="text-sm text-muted-foreground">
            This recall was closed on {recall.closed_at.slice(0, 10)}.
          </p>
        )}
      </article>
    </main>
  );
};

const Block: React.FC<{ title: string; body: string | null }> = ({ title, body }) => (
  <section className="space-y-1">
    <h2 className="text-sm font-semibold">{title}</h2>
    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{body ?? '—'}</p>
  </section>
);

export default PublicRecallPage;
