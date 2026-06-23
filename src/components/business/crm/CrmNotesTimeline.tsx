import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2, Plus, FileText, Pencil, Trash2, Save, X, User as UserIcon,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';

type TargetKind = 'contact' | 'company';

interface CrmNotesTimelineProps {
  targetKind: TargetKind;
  /** UUID of the contact or company this note belongs to. May be empty/falsy
      while a new entity is being created — in that case the component renders
      a "save the {kind} first" placeholder instead of the timeline. */
  targetId: string | null | undefined;
}

interface NoteRow {
  id: string;
  target_kind: TargetKind;
  target_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  edited_by: string | null;
  author_name?: string | null;
  editor_name?: string | null;
}

/**
 * Timeline of notes attached to a CRM contact or company. Each entry is a
 * separate row in crm_notes — you can add (via modal), edit and delete your
 * own entries. Older entries from other users render read-only.
 */
export const CrmNotesTimeline: React.FC<CrmNotesTimelineProps> = ({ targetKind, targetId }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');

  const canLoad = !!targetId;

  const load = useCallback(async () => {
    if (!targetId) { setNotes([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_notes')
        .select('id, target_kind, target_id, body, created_at, updated_at, created_by, edited_by')
        .eq('target_kind', targetKind)
        .eq('target_id', targetId)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as NoteRow[];

      // Resolve author / editor display names in one round trip
      const userIds = Array.from(new Set(
        rows.flatMap((n) => [n.created_by, n.edited_by]).filter((u): u is string => !!u),
      ));
      let nameMap = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, full_name, email')
          .in('user_id', userIds);
        nameMap = new Map(
          (profiles ?? []).map((p: any) => [p.user_id, p.full_name || p.email || p.user_id.slice(0, 8)]),
        );
      }

      setNotes(rows.map((n) => ({
        ...n,
        author_name: n.created_by ? (nameMap.get(n.created_by) ?? n.created_by.slice(0, 8)) : null,
        editor_name: n.edited_by ? (nameMap.get(n.edited_by) ?? n.edited_by.slice(0, 8)) : null,
      })));
    } catch (err: any) {
      toast({ title: 'Failed to load notes', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [targetKind, targetId, toast]);

  useEffect(() => { if (canLoad) void load(); }, [canLoad, load]);

  const handleAdd = async () => {
    if (!targetId || !user?.id) return;
    const body = draft.trim();
    if (!body) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('crm_notes').insert({
        target_kind: targetKind,
        target_id: targetId,
        body,
        created_by: user.id,
      });
      if (error) throw error;
      setDraft('');
      setShowAdd(false);
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to add note', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (n: NoteRow) => {
    setEditingId(n.id);
    setEditingBody(n.body);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingBody('');
  };

  const handleSaveEdit = async (noteId: string) => {
    if (!user?.id) return;
    const body = editingBody.trim();
    if (!body) return;
    const original = notes.find((n) => n.id === noteId);
    if (original && body === original.body.trim()) {
      cancelEdit();
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('crm_notes')
        .update({ body, edited_by: user.id })
        .eq('id', noteId);
      if (error) throw error;
      setEditingId(null);
      setEditingBody('');
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to save note', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (noteId: string) => {
    if (deleting) return;
    if (!window.confirm('Delete this note? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from('crm_notes').delete().eq('id', noteId);
      if (error) throw error;
      await load();
    } catch (err: any) {
      toast({ title: 'Failed to delete note', description: err?.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  const myUserId = user?.id;

  const grouped = useMemo(() => {
    // Lightweight grouping: "Today", "Yesterday", "This week", "Earlier".
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const buckets: Record<string, NoteRow[]> = { Today: [], Yesterday: [], 'This week': [], Earlier: [] };
    for (const n of notes) {
      const d = new Date(n.created_at);
      if (d >= today) buckets.Today.push(n);
      else if (d >= yesterday) buckets.Yesterday.push(n);
      else if (d >= weekAgo) buckets['This week'].push(n);
      else buckets.Earlier.push(n);
    }
    return buckets;
  }, [notes]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Notes &amp; Comments
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Timeline of internal notes. You can edit and delete the notes you added.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="shrink-0">
            {loading ? '…' : `${notes.length} note${notes.length === 1 ? '' : 's'}`}
          </Badge>
          <Button size="sm" onClick={() => { setDraft(''); setShowAdd(true); }} disabled={!canLoad}>
            <Plus className="h-4 w-4 mr-1.5" /> New note
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {!canLoad ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Save this {targetKind} first before adding notes.
          </div>
        ) : loading ? (
          <div className="flex items-center gap-2 justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground space-y-2">
            <FileText className="h-10 w-10 mx-auto opacity-40" />
            <p className="text-sm">No notes yet. Click "New note" to add the first one.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {(Object.entries(grouped) as [string, NoteRow[]][])
              .filter(([, list]) => list.length > 0)
              .map(([bucket, list]) => (
                <div key={bucket} className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {bucket}
                  </div>
                  <ul className="space-y-2">
                    {list.map((n) => {
                      const mine = !!myUserId && n.created_by === myUserId;
                      const isEditing = editingId === n.id;
                      const edited = n.updated_at && n.updated_at !== n.created_at;
                      return (
                        <li
                          key={n.id}
                          className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2"
                        >
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <UserIcon className="h-3.5 w-3.5" />
                            <span className="font-medium text-foreground">
                              {n.author_name ?? 'Unknown'}
                            </span>
                            <span>·</span>
                            <span title={new Date(n.created_at).toLocaleString()}>
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                            </span>
                            {edited && (
                              <span className="italic" title={`Last edited ${new Date(n.updated_at).toLocaleString()}${n.editor_name ? ` by ${n.editor_name}` : ''}`}>
                                · edited
                              </span>
                            )}
                            {mine && !isEditing && (
                              <div className="ml-auto flex gap-1">
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => beginEdit(n)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => handleDelete(n.id)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {isEditing ? (
                            <div className="space-y-2">
                              <Textarea
                                value={editingBody}
                                onChange={(e) => setEditingBody(e.target.value)}
                                rows={3}
                                className="resize-y"
                              />
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saving}>
                                  <X className="h-3.5 w-3.5 mr-1" /> Cancel
                                </Button>
                                <Button size="sm" onClick={() => handleSaveEdit(n.id)} disabled={saving || !editingBody.trim()}>
                                  {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                  Save
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{n.body}</p>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
          </div>
        )}
      </CardContent>

      <Dialog open={showAdd} onOpenChange={(o) => { if (!o && !saving) setShowAdd(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
            <DialogDescription>
              Add an internal note about this {targetKind}. Visible to everyone in the workspace; only you can edit or delete it later.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            placeholder="What did you want to remember?"
            className="resize-y"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAdd(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !draft.trim()}>
              {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
              Add note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CrmNotesTimeline;
