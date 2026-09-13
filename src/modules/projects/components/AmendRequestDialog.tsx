/**
 * Amend a request already on the register: owner, due date, drawing revision (#413).
 *
 * Without it a date slip or a re-issued sheet meant raising a DUPLICATE — which is presumably why
 * `find_similar_project_requests` had to be written. A revision change is posted to the thread
 * rather than applied silently: "answered against rev B, now rev C" is what causes rework, and
 * whoever answers next has to be able to read it.
 */
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  projectRequestsService, type ProjectRequestWithMessages,
} from '../services/projectRequestsService';
import {
  projectDocumentsService, type ProjectDocumentWithRevisions,
} from '../services/projectDocumentsService';

export const AmendRequestDialog: React.FC<{
  request: ProjectRequestWithMessages;
  projectId: string;
  assignees: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSaved: () => void;
}> = ({ request, projectId, assignees, onClose, onSaved }) => {
  const { toast } = useToast();
  const [assigneeId, setAssigneeId] = useState(request.assignee_id ?? '');
  const [dueAt, setDueAt] = useState(request.due_at ?? '');
  const [revisionId, setRevisionId] = useState(request.drawing_revision_id ?? '');
  const [docs, setDocs] = useState<ProjectDocumentWithRevisions[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    projectDocumentsService.list(projectId)
      .then((d) => { if (alive) setDocs(d); })
      .catch(() => { if (alive) setDocs([]); });
    return () => { alive = false; };
  }, [projectId]);

  const revLabel = (id: string): string | null => {
    for (const d of docs) {
      const rev = (d.revisions || []).find((r) => r.id === id);
      if (rev) return `${d.drawing_number || d.title} rev ${rev.rev_label}`;
    }
    return null;
  };

  const save = async () => {
    setSaving(true);
    try {
      const nextAssignee = assigneeId || null;
      const nextDue = dueAt || null;
      const nextRevision = revisionId || null;
      if (nextAssignee !== (request.assignee_id ?? null)) {
        await projectRequestsService.setAssignee(request.id, nextAssignee);
      }
      if (nextDue !== (request.due_at ?? null)) {
        await projectRequestsService.setDueAt(request.id, nextDue);
      }
      if (nextRevision !== (request.drawing_revision_id ?? null)) {
        await projectRequestsService.setDrawingRevision(request.id, nextRevision);
        // The citation moved. Said in the thread, because an answer already given may be an
        // answer about the other sheet.
        const from = request.drawing_revision_id ? revLabel(request.drawing_revision_id) : null;
        const to = nextRevision ? revLabel(nextRevision) : null;
        await projectRequestsService.addMessage(
          request,
          `Drawing citation changed from ${from ?? 'no drawing'} to ${to ?? 'no drawing'}.`,
          false,
        ).catch(() => { /* the amend stands; the note records it, it is not the act */ });
      }
      onSaved();
    } catch (err: unknown) {
      toast({
        title: 'Could not amend the request',
        description: (err as Error)?.message,
        variant: 'destructive',
      });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Amend request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {assignees.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">Owner</Label>
              <select
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}
              >
                <option value="">Nobody yet</option>
                {assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">Answer needed by</Label>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          {docs.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">About which drawing</Label>
              <select
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={revisionId} onChange={(e) => setRevisionId(e.target.value)}
              >
                <option value="">Not about a specific drawing</option>
                {docs.map((d) => (
                  <optgroup key={d.id} label={`${d.drawing_number ? `${d.drawing_number} — ` : ''}${d.title}`}>
                    {(d.revisions || []).map((rev) => (
                      <option key={rev.id} value={rev.id}>
                        rev {rev.rev_label}{rev.is_current ? ' (current)' : ' — superseded'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Re-pointing the citation is noted in the thread — an answer already given may be
                about the other sheet.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
