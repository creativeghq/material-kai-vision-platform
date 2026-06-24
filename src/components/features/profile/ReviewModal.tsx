import React, { useState, useEffect } from 'react';
import { Star } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Label } from '@/components/core/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import type { ProfileReview } from './ReviewsSection';

const DIMENSIONS = [
  { key: 'communication', label: 'Communication' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'value', label: 'Value' },
];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <span className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          className="transition-transform hover:scale-110"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(i)}
        >
          <Star
            className={`h-6 w-6 ${i <= (hover || value) ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30 fill-muted-foreground/10'}`}
          />
        </button>
      ))}
    </span>
  );
}

export const ReviewModal: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  toUserId: string;
  services?: { id: string; name: string }[];
  existingReview?: ProfileReview | null;
  onSaved: () => void;
}> = ({ open, onOpenChange, toUserId, services = [], existingReview, onSaved }) => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [overall, setOverall] = useState(0);
  const [dims, setDims] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [serviceName, setServiceName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingReview) {
      setOverall(existingReview.overall_rating);
      setDims(existingReview.dimension_ratings ?? {});
      setComment(existingReview.comment ?? '');
      setServiceName(existingReview.service_name ?? '');
    } else {
      setOverall(0);
      setDims({});
      setComment('');
      setServiceName('');
    }
  }, [existingReview, open]);

  const save = async () => {
    if (!user) return;
    if (overall === 0) {
      toast({ title: 'Please select an overall rating', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const payload = {
      to_user_id: toUserId,
      from_user_id: user.id,
      from_name: user.user_metadata?.full_name ?? user.email ?? 'Anonymous',
      overall_rating: overall,
      dimension_ratings: dims,
      comment: comment.trim() || null,
      service_name: serviceName.trim() || null,
    };

    const { error } = existingReview
      ? await supabase.from('profile_reviews').update(payload).eq('id', existingReview.id)
      : await supabase.from('profile_reviews').insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: 'Could not save review', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: existingReview ? 'Review updated' : 'Review submitted' });

    if (!existingReview) {
      flowEventService.emit('review_submitted', {
        user_id: toUserId, // recipient (the reviewed professional) — consumed by create_notification
        to_user_id: toUserId,
        from_user_id: user.id,
        type: 'review_submitted',
        title: 'You received a new review',
        body: `Someone left you a ${overall}-star review.`,
        action_url: '/profile',
        overall_rating: overall,
        service_name: payload.service_name,
        submitted_at: new Date().toISOString(),
      });
    }

    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{existingReview ? 'Edit Your Review' : 'Write a Review'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Overall */}
          <div className="space-y-1.5">
            <Label>Overall rating <span className="text-destructive">*</span></Label>
            <StarPicker value={overall} onChange={setOverall} />
          </div>

          {/* Dimension ratings */}
          <div className="space-y-2">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Detailed ratings (optional)</Label>
            <div className="grid grid-cols-1 gap-2">
              {DIMENSIONS.map((d) => (
                <div key={d.key} className="flex items-center justify-between">
                  <span className="text-sm">{d.label}</span>
                  <StarPicker
                    value={dims[d.key] ?? 0}
                    onChange={(v) => setDims((prev) => ({ ...prev, [d.key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Service */}
          {services.length > 0 && (
            <div className="space-y-1.5">
              <Label>Service hired for (optional)</Label>
              <Select value={serviceName || '__none__'} onValueChange={(v) => setServiceName(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="— Select a service —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Select a service —</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Comment */}
          <div className="space-y-1.5">
            <Label>Review (optional)</Label>
            <textarea
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
              rows={4}
              placeholder="Share your experience working with this professional..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="flex gap-3 pt-1">
            <Button className="flex-1 rounded-full" onClick={save} disabled={saving || overall === 0}>
              {saving ? 'Saving…' : existingReview ? 'Update Review' : 'Submit Review'}
            </Button>
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
