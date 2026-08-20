/**
 * "Is this product ready to sell through the SDK?" — the checklist, and the snippet (#341 join 5).
 *
 * An empty catalogue is not a content problem, it is a missing checklist. Everything the 3D program
 * built is a consequence of one product having a model, a price and some attributes, and nothing
 * anywhere told a merchant that — which is why there is exactly one model in the database. It is
 * not hard to upload one. Nothing asked.
 *
 * DOES NOT GATE. A product missing every line below still sells: the spec builder captures it as a
 * quote request and the AI draws an impression. So this says what is missing and what it costs,
 * never "you may not publish this". Only the published price is marked as a hard gate, because it
 * is the only one the endpoint actually refuses to serve without.
 *
 * The payoff is the snippet at the bottom — readiness is not a score for its own sake, it is the
 * path to being embeddable, which is the point of the whole program.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Circle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import {
  readinessFor,
  requirementsOf,
  readinessSummary,
  embedSnippetFor,
  type ProductEmbedReadiness,
} from '@/services/productEmbedReadinessService';

interface Props {
  productId: string;
}

export const ProductEmbedReadinessCard: React.FC<Props> = ({ productId }) => {
  const { toast } = useToast();
  const [readiness, setReadiness] = useState<ProductEmbedReadiness | null>(null);
  const [snippet, setSnippet] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    readinessFor([productId])
      .then(async (map) => {
        if (!live) return;
        const r = map.get(productId) ?? null;
        setReadiness(r);
        if (r) setSnippet(await embedSnippetFor(r, window.location.origin));
      })
      .catch(() => { /* the card simply does not render; nothing else depends on it */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [productId]);

  if (loading || !readiness) return null;

  const requirements = requirementsOf(readiness);
  const { met, total, blocked } = readinessSummary(readiness);

  return (
    <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h3 className="text-sm font-semibold">Ready to sell online</h3>
        {/* Plain coloured words, never a filled pill — design system. */}
        <span className={`text-xs font-medium ${blocked ? 'text-destructive' : met === total ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>
          {met} of {total}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-4">
        What this product needs before the website embed, configurator and AR can carry it. Nothing
        here blocks selling — a product with none of it still reaches customers as a quote request.
      </p>

      <ul className="space-y-3">
        {requirements.map((q) => (
          <li key={q.key} className="flex items-start gap-2.5">
            {q.met
              ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              : <Circle className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${q.hardGate ? 'text-destructive' : 'text-muted-foreground/50'}`} />}
            <div className="min-w-0">
              <div className="text-xs font-medium flex items-center gap-2">
                {q.label}
                {!q.met && q.hardGate && <span className="text-[10px] text-destructive">required</span>}
              </div>
              {/* The consequence is the whole reason the line is worth reading: it says which
                  stage stops working, rather than scolding about an empty field. */}
              {!q.met && <div className="text-[11px] text-muted-foreground mt-0.5">{q.consequence}</div>}
              {q.detail && <div className="text-[11px] text-muted-foreground/80 mt-0.5">{q.detail}</div>}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-5 pt-4 border-t border-border/50">
        {snippet ? (
          <>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs font-medium">Paste this on your website</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  navigator.clipboard.writeText(snippet).then(
                    () => toast({ title: 'Snippet copied' }),
                    () => toast({ title: 'Could not copy', variant: 'destructive' }),
                  );
                }}
              >
                <Copy className="h-3 w-3 mr-1.5" /> Copy
              </Button>
            </div>
            <pre className="text-[10px] leading-relaxed bg-muted/40 rounded-lg p-3 overflow-x-auto whitespace-pre">{snippet}</pre>
            {!readiness.has_published_price && (
              <p className="text-[11px] text-destructive mt-2">
                This will render nothing until the product has a published price — the snippet is
                correct, the catalogue answer is empty.
              </p>
            )}
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">No embed key covers this product yet.</span>{' '}
            A key is what lets another website read it.
            <Link to="/profile?tab=keys" className="inline-flex items-center gap-1 ml-1 text-primary hover:underline">
              Create one <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};
