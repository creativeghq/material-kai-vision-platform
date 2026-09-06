/**
 * Open a social post — read it, finish it, send it.
 *
 * The posts table was the only reader `social_posts` had, and it was read-only. Everything that
 * writes a post is the agent: `generate_content` files the draft, `generate_image` and
 * `generate_video` hang media on it. So a draft could be SEEN on the page and only ACTED on by
 * going back to chat and describing which one you meant — for a row the screen was already
 * showing. That is the gap this closes: caption and hashtags are editable, the media is visible,
 * and publish / schedule / delete are here rather than in a sentence you have to compose.
 *
 * Publishing goes through `zernio-api` (`publish_now` / `schedule`) — the same path the agent
 * uses, never a direct write of `status: 'published'`, because the status is the RECORD of a send
 * that happened and setting it locally would invent one.
 *
 * A published post is read-only. Its caption is what went out; letting someone edit it here would
 * leave our copy disagreeing with the live post and nothing to reconcile the two.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, Send, Trash2, CalendarClock, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { formatDate } from '@/utils/datetime';
import { PlatformIcon, platformLabel } from '@/components/core/icons/PlatformIcon';
import { safeHref } from '@/utils/safeUrl';

const SUPABASE_FUNCTIONS_URL = `${supabaseConfig.projectUrl}/functions/v1`;

/** The per-platform caption ceilings the generator writes to. Shown, so the limit is visible
 *  BEFORE the platform rejects the send rather than after. */
const MAX_CHARS: Record<string, number> = {
  instagram: 2200, facebook: 63206, linkedin: 3000, tiktok: 2200,
  pinterest: 500, youtube: 5000, twitter: 280, threads: 500,
};

export interface EditableAccount {
  id: string;
  platform: string;
  handle: string | null;
}

interface FullPost {
  id: string;
  workspace_id: string;
  platform: string;
  caption: string | null;
  hashtags: string[] | null;
  image_urls: string[] | null;
  video_url: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  social_account_id: string | null;
  metadata: { platform_post_url?: string | null } | null;
}

/** `2026-09-06T14:30` — what <input type="datetime-local"> wants, in the OPERATOR's clock.
 *  Never `toISOString().slice(0,16)`: that is UTC, and a Greek evening becomes the wrong day. */
function toLocalDateTimeInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SocialPostEditorDialog: React.FC<{
  postId: string | null;
  accounts: EditableAccount[];
  onClose: () => void;
  /** Reload the list — the row's caption, status and time all change from in here. */
  onChanged: () => void;
}> = ({ postId, accounts, onClose, onChanged }) => {
  const { toast } = useToast();
  const [post, setPost] = useState<FullPost | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | 'save' | 'publish' | 'schedule' | 'delete'>(null);
  const [caption, setCaption] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [accountId, setAccountId] = useState<string>('');
  const [when, setWhen] = useState<string>('');

  useEffect(() => {
    if (!postId) { setPost(null); return; }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from('social_posts')
        .select('id, workspace_id, platform, caption, hashtags, image_urls, video_url, status, scheduled_at, published_at, social_account_id, metadata')
        .eq('id', postId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast({ title: 'Could not open the post', description: error?.message, variant: 'destructive' });
        setLoading(false);
        onClose();
        return;
      }
      const row = data as FullPost;
      setPost(row);
      setCaption(row.caption ?? '');
      setHashtags((row.hashtags ?? []).join(' '));
      setWhen(toLocalDateTimeInput(row.scheduled_at));
      // Pre-pick the account it was drafted against, else the first one that can carry this
      // platform. Making the operator choose again for a one-account workspace is noise.
      const sameKind = accounts.filter((a) => a.platform === row.platform);
      setAccountId(row.social_account_id ?? sameKind[0]?.id ?? '');
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [postId, accounts, onClose, toast]);

  const editable = !!post && post.status !== 'published';
  const eligibleAccounts = useMemo(
    () => accounts.filter((a) => !post || a.platform === post.platform),
    [accounts, post],
  );
  const limit = post ? MAX_CHARS[post.platform] : undefined;
  // Hashtags ride along in the caption on every platform we post to, so the count has to include
  // them or the editor says 190/280 for a tweet the platform then refuses.
  const composed = [caption.trim(), hashtags.trim()].filter(Boolean).join('\n\n');
  const overLimit = !!limit && composed.length > limit;

  const parsedTags = useMemo(
    () => hashtags.split(/[\s,]+/).map((t) => t.trim().replace(/^#/, '')).filter(Boolean),
    [hashtags],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (!post) return false;
    const { error } = await supabase
      .from('social_posts')
      .update({ caption: caption.trim() || null, hashtags: parsedTags })
      .eq('id', post.id);
    if (error) {
      toast({ title: 'Could not save', description: error.message, variant: 'destructive' });
      return false;
    }
    return true;
  }, [post, caption, parsedTags, toast]);

  /** Save, then hand the post to zernio-api — the same path the agent publishes through. */
  const runSend = useCallback(async (action: 'publish_now' | 'schedule') => {
    if (!post) return;
    if (!accountId) {
      toast({ title: 'Pick an account', description: `Connect or choose a ${platformLabel(post.platform)} account first.`, variant: 'destructive' });
      return;
    }
    setBusy(action === 'publish_now' ? 'publish' : 'schedule');
    try {
      // Save FIRST. Publishing sends whatever is STORED on the row, so an unsaved edit would go
      // out as the old caption while the screen showed the new one.
      if (!(await save())) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/zernio-api`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          post_id: post.id,
          social_account_id: accountId,
          workspace_id: post.workspace_id,
          // Sent as a real instant. `when` is a local wall-clock string with no zone, so the
          // browser is the only place that knows which zone the operator meant.
          ...(action === 'schedule' ? { scheduled_at: new Date(when).toISOString() } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) throw new Error(json?.error || `${action} failed (${res.status})`);
      toast({
        title: action === 'publish_now' ? 'Published' : 'Scheduled',
        description: action === 'publish_now'
          ? `Sent to ${platformLabel(post.platform)}.`
          : `Queued for ${formatDate(new Date(when).toISOString(), { withTime: true })}.`,
      });
      onChanged();
      onClose();
    } catch (e: unknown) {
      toast({
        title: action === 'publish_now' ? 'Could not publish' : 'Could not schedule',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  }, [post, accountId, when, save, toast, onChanged, onClose]);

  if (!postId) return null;

  return (
    <Dialog open={!!postId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {post && <PlatformIcon platform={post.platform} className="h-4 w-4" />}
            {post ? `${platformLabel(post.platform)} post` : 'Post'}
            {post && <Badge variant="neutral" className="capitalize">{post.status}</Badge>}
          </DialogTitle>
          <DialogDescription>
            {post?.status === 'published'
              ? `Published ${post.published_at ? formatDate(post.published_at, { withTime: true }) : ''} — this is what went out.`
              : 'Edit the copy, then publish it now or put it in the queue.'}
          </DialogDescription>
        </DialogHeader>

        {loading || !post ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-4">
            {(post.image_urls?.length || post.video_url) && (
              <div className="flex flex-wrap gap-2">
                {(post.image_urls ?? []).map((u, i) => (
                  <img key={i} src={u} alt={`Attachment ${i + 1}`} className="h-24 w-24 rounded-sm border border-hairline object-cover" />
                ))}
                {post.video_url && (
                  <video src={post.video_url} controls className="h-24 rounded-sm border border-hairline" />
                )}
              </div>
            )}

            <div>
              <Label htmlFor="social-post-caption" className="text-xs text-muted-foreground">Caption</Label>
              <Textarea
                id="social-post-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={!editable}
                rows={6}
                className="mt-1"
              />
              <p className={`mt-1 text-[11px] tabular-nums ${overLimit ? 'text-[hsl(var(--error))]' : 'text-muted-foreground'}`}>
                {composed.length}{limit ? ` / ${limit}` : ''} characters
                {overLimit ? ` — ${platformLabel(post.platform)} will reject this.` : ''}
              </p>
            </div>

            <div>
              <Label htmlFor="social-post-hashtags" className="text-xs text-muted-foreground">Hashtags</Label>
              <Input
                id="social-post-hashtags"
                value={hashtags}
                onChange={(e) => setHashtags(e.target.value)}
                disabled={!editable}
                placeholder="tiles thessaloniki interiors"
                className="mt-1 font-mono text-xs"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Space or comma separated. The leading # is added for you.
              </p>
            </div>

            {editable && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="social-post-account" className="text-xs text-muted-foreground">Post as</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="social-post-account" className="mt-1">
                      <SelectValue placeholder={eligibleAccounts.length ? 'Choose an account…' : `No ${platformLabel(post.platform)} account connected`} />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.handle || platformLabel(a.platform)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="social-post-when" className="text-xs text-muted-foreground">Schedule for</Label>
                  <Input
                    id="social-post-when"
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            {post.metadata?.platform_post_url && (
              <a
                href={safeHref(post.metadata.platform_post_url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                View on {platformLabel(post.platform)} <ExternalLink className="h-3 w-3" />
              </a>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-3">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                disabled={!!busy}
                onClick={async () => {
                  if (!confirm('Delete this post? This cannot be undone.')) return;
                  setBusy('delete');
                  const { error } = await supabase.from('social_posts').delete().eq('id', post.id);
                  setBusy(null);
                  if (error) {
                    toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
                    return;
                  }
                  toast({ title: 'Post deleted' });
                  onChanged();
                  onClose();
                }}
              >
                {busy === 'delete' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Trash2 className="mr-1 h-4 w-4" />}
                Delete
              </Button>

              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy || overLimit}
                    onClick={async () => {
                      setBusy('save');
                      const ok = await save();
                      setBusy(null);
                      if (ok) { toast({ title: 'Saved' }); onChanged(); }
                    }}
                  >
                    {busy === 'save' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
                    Save
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!!busy || overLimit || !accountId}
                    onClick={() => void runSend('schedule')}
                  >
                    {busy === 'schedule' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CalendarClock className="mr-1 h-4 w-4" />}
                    Schedule
                  </Button>
                  <Button
                    size="sm"
                    disabled={!!busy || overLimit || !accountId}
                    onClick={() => void runSend('publish_now')}
                  >
                    {busy === 'publish' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
                    Publish now
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default SocialPostEditorDialog;
