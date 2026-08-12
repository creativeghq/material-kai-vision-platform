import React, { useEffect, useState } from 'react';
import { Star, Loader2, Pencil, X, BadgeCheck } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { flowEventService } from '@/services/flows/flowEventService';

interface Review {
  id: string;
  rating: number;
  review_text?: string;
  created_at: string;
  user_id: string;
  is_verified?: boolean;
  user_profiles?: { full_name?: string; avatar_url?: string } | null;
}

interface MaterialReviewsProps {
  productId: string;
  currentUserId?: string;
}

function StarRating({ value, onChange, readOnly }: { value: number; onChange?: (v: number) => void; readOnly?: boolean }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          type="button"
          disabled={readOnly}
          onClick={() => onChange?.(s)}
          onMouseEnter={() => !readOnly && setHover(s)}
          onMouseLeave={() => !readOnly && setHover(0)}
          className={`transition-colors ${readOnly ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <Star
            className={`h-4 w-4 ${(hover || value) >= s ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
          />
        </button>
      ))}
    </div>
  );
}

export const MaterialReviews: React.FC<MaterialReviewsProps> = ({ productId, currentUserId }) => {
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ rating: 0, text: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadReviews();
  }, [productId]);

  const loadReviews = async () => {
    const { data } = await supabase
      .from('material_reviews')
      .select('id, rating, review_text, created_at, user_id, is_verified, user_profiles(full_name, avatar_url)')
      .eq('product_id', productId)
      .order('created_at', { ascending: false });

    if (data) {
      setReviews(data as Review[]);
      if (currentUserId) {
        const mine = (data as Review[]).find((r) => r.user_id === currentUserId);
        setMyReview(mine ?? null);
      }
    }
    setLoading(false);
  };

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rating || !currentUserId) return;
    setSubmitting(true);

    const payload = {
      product_id: productId,
      user_id: currentUserId,
      rating: form.rating,
      review_text: form.text.trim() || null,
    };

    let error;
    if (myReview) {
      ({ error } = await supabase.from('material_reviews').update(payload).eq('id', myReview.id));
    } else {
      ({ error } = await supabase.from('material_reviews').insert(payload));
    }

    if (error) {
      toast({ title: 'Error', description: 'Could not save review.', variant: 'destructive' });
    } else {
      await loadReviews();
      setEditing(false);
      if (!myReview) {
        // Only emit on new reviews, not edits. Look up the product owner first
        // so the event carries the notification recipient (owner_user_id). The
        // "Material Reviewed" flow delivers the notification; an admin can
        // pause/edit it without a code change.
        supabase
          .from('products')
          .select('user_id')
          .eq('id', productId)
          .maybeSingle()
          .then(({ data: product }) => {
            const ownerUserId =
              product?.user_id && product.user_id !== currentUserId ? product.user_id : null;
            flowEventService.emit('material_reviewed', {
              product_id: productId,
              user_id: currentUserId, // reviewer (documented trigger semantics)
              reviewer_id: currentUserId,
              owner_user_id: ownerUserId, // recipient — consumed by create_notification
              rating: form.rating,
              has_text: !!form.text.trim(),
              type: 'review_received',
              title: 'New review on your material',
              body: form.text.trim()
                ? `"${form.text.trim().slice(0, 80)}"`
                : `${form.rating} star review received.`,
              action_url: `/discover?product=${productId}`,
            });
          });
      }
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!myReview) return;
    await supabase.from('material_reviews').delete().eq('id', myReview.id);
    setMyReview(null);
    setEditing(false);
    await loadReviews();
  };

  const initials = (name?: string) =>
    (name || '?').split(' ').filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-3">
        <h3 className="text-sm font-semibold">Reviews</h3>
        {avgRating && (
          <div className="flex items-center gap-1.5">
            <StarRating value={Math.round(Number(avgRating))} readOnly />
            <span className="text-sm font-semibold">{avgRating}</span>
            <span className="text-xs text-muted-foreground">({reviews.length})</span>
          </div>
        )}
      </div>

      {/* Write / edit review */}
      {currentUserId && (
        <div>
          {!editing && !myReview && (
            <Button size="sm" variant="outline" onClick={() => { setForm({ rating: 0, text: '' }); setEditing(true); }}>
              <Star className="h-3.5 w-3.5 mr-1.5" />
              Write a review
            </Button>
          )}
          {!editing && myReview && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Your review:</span>
              <StarRating value={myReview.rating} readOnly />
              <button className="hover:text-primary" onClick={() => { setForm({ rating: myReview.rating, text: myReview.review_text ?? '' }); setEditing(true); }}>
                <Pencil className="h-3 w-3" />
              </button>
              <button className="hover:text-destructive" onClick={handleDelete}>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {editing && (
            <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-xl bg-muted/20">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Rating</span>
                <StarRating value={form.rating} onChange={(v) => setForm((p) => ({ ...p, rating: v }))} />
              </div>
              <Textarea
                value={form.text}
                onChange={(e) => setForm((p) => ({ ...p, text: e.target.value }))}
                placeholder="Share your experience with this material (optional)…"
                rows={2}
                className="text-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={!form.rating || submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Review list */}
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : (
        <div className="space-y-3">
          {reviews.filter((r) => r.user_id !== currentUserId || !editing).map((r) => (
            <div key={r.id} className="flex gap-3">
              <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                {r.user_profiles?.avatar_url && <AvatarImage src={r.user_profiles.avatar_url} />}
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initials(r.user_profiles?.full_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-xs font-semibold">{r.user_profiles?.full_name || 'User'}</span>
                  {r.is_verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      <BadgeCheck className="h-3 w-3" /> Verified purchase
                    </span>
                  )}
                  <StarRating value={r.rating} readOnly />
                  <span className="text-xs text-muted-foreground">{fmt(r.created_at)}</span>
                </div>
                {r.review_text && <p className="text-sm mt-0.5 text-muted-foreground">{r.review_text}</p>}
              </div>
            </div>
          ))}
          {reviews.length === 0 && (
            <p className="text-xs text-muted-foreground">No reviews yet.</p>
          )}
        </div>
      )}
    </div>
  );
};
