import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { projectsService } from '@/modules/projects/services/projectsService';

export const GmailTaskDialog: React.FC<{
  subject: string;
  context: string;
  onClose: () => void;
}> = ({ subject, context, onClose }) => {
  const { toast } = useToast();
  const [projects, setProjects] = useState<Array<{ id: string; name: string }> | null>(null);
  const [projectId, setProjectId] = useState('');
  const [title, setTitle] = useState(subject);
  const [description, setDescription] = useState(context);
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    projectsService.listProjects({ status: 'active' })
      .then((rows) => setProjects(rows.map((p) => ({ id: p.id, name: p.name }))))
      .catch((e) => { setProjects([]); toast({ title: 'Could not load projects', description: (e as Error).message, variant: 'destructive' }); });
  }, [toast]);

  const save = async () => {
    setBusy(true);
    try {
      await projectsService.createTask({ project_id: projectId, title: title.trim(), description: description.trim() || undefined, due_date: due || undefined });
      toast({ title: 'Task created' });
      onClose();
    } catch (e) {
      toast({ title: 'Could not create the task', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Task From This Email</DialogTitle>
          <DialogDescription>Put the follow-up on a project&apos;s task list. The email stays in Gmail; the task links back to it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label htmlFor="gt-project" className="text-xs text-muted-foreground">Project</Label>
            {projects === null ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : projects.length === 0 ? (
              <p className="text-xs text-muted-foreground">You have no active projects to put a task on.</p>
            ) : (
              <select id="gt-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}
                className="w-full h-9 rounded-sm border border-hairline bg-card px-2 text-sm">
                <option value="">Choose a project…</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gt-title" className="text-xs text-muted-foreground">Task</Label>
            <Input id="gt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gt-desc" className="text-xs text-muted-foreground">Details</Label>
            <Textarea id="gt-desc" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[90px]" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gt-due" className="text-xs text-muted-foreground">Due (optional)</Label>
            <Input id="gt-due" type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-44" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy || !projectId || !title.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create task'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
