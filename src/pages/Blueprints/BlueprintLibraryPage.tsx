import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, LayoutTemplate, Sparkles, Trash2, Pencil, Copy, Eye, ChevronLeft } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { blueprintsService, type Blueprint } from '@/services/blueprintsService';

/**
 * Blueprint Library (#242) — workspace-owned reusable scope-of-works templates +
 * platform starters. Create, edit (→ editor page), duplicate a starter into your
 * workspace, delete. Importing into a project happens from the project Plan tab.
 */
export const BlueprintLibraryPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);

  const [loading, setLoading] = useState(true);
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBlueprints(await blueprintsService.list({ includeStarters: true }));
    } catch (e) {
      toast({ title: 'Failed to load blueprints', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  // Import-after-signup: the public /tools/project-plan estimator stashes a chosen
  // starter + dimensions in localStorage; once the now-logged-in user lands here
  // with an active workspace, materialize it as an editable blueprint (once).
  useEffect(() => {
    const raw = (() => { try { return localStorage.getItem('mk_pending_blueprint'); } catch { return null; } })();
    if (!raw || !workspaceId) return;
    let pending: { starter_id?: string; title?: string; dimensions?: Record<string, number>; dimensions_schema?: any[]; items?: any[]; source_currency?: string };
    try { pending = JSON.parse(raw); } catch { localStorage.removeItem('mk_pending_blueprint'); return; }
    localStorage.removeItem('mk_pending_blueprint'); // consume once (guards double-invoke)
    if (!pending?.starter_id && !pending?.items?.length) return;
    (async () => {
      try {
        // If the user edited the plan on the public tool, recreate exactly what they
        // built; otherwise duplicate the starter with their entered measurements.
        const bp = pending.items?.length
          ? await blueprintsService.createFromItems({ workspace_id: workspaceId, title: pending.title || 'Imported plan', source_currency: pending.source_currency, dimensions_schema: pending.dimensions_schema, items: pending.items })
          : await blueprintsService.duplicate(pending.starter_id!, workspaceId, { title: pending.title, dimensionValues: pending.dimensions });
        toast({ title: 'Imported your plan', description: 'Your saved estimate is now an editable blueprint.' });
        navigate(`/blueprints/${bp.id}`);
      } catch (e) {
        toast({ title: 'Could not import your saved plan', description: String((e as Error)?.message ?? e), variant: 'destructive' });
      }
    })();
  }, [workspaceId, navigate, toast]);

  const own = blueprints.filter((b) => !b.is_platform_starter);
  const starters = blueprints.filter((b) => b.is_platform_starter);

  const createBlueprint = async () => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    if (!title.trim()) return;
    setBusy(true);
    try {
      const bp = await blueprintsService.create({ workspace_id: workspaceId, title: title.trim() });
      setCreateOpen(false); setTitle('');
      navigate(`/blueprints/${bp.id}`);
    } catch (e) {
      toast({ title: 'Create failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const duplicateStarter = async (starter: Blueprint) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const bp = await blueprintsService.duplicate(starter.id, workspaceId);
      toast({ title: 'Copied to your library' });
      navigate(`/blueprints/${bp.id}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (bp: Blueprint) => {
    if (!confirm(`Delete blueprint "${bp.title}"?`)) return;
    try {
      await blueprintsService.remove(bp.id);
      setBlueprints((prev) => prev.filter((b) => b.id !== bp.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  const Tile = ({ b }: { b: Blueprint }) => (
    <Card className="dashboard-card">
      <CardContent className="p-4 flex flex-col gap-2 h-full">
        <div className="flex items-start gap-2">
          <LayoutTemplate className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium flex items-center gap-2">
              <span className="truncate">{b.title}</span>
              {b.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
            </div>
            {b.description && <div className="text-xs text-muted-foreground line-clamp-2">{b.description}</div>}
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center gap-2">
          {b.is_platform_starter ? (
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/blueprints/${b.id}`)}>
                <Eye className="h-3.5 w-3.5 mr-1" /> View
              </Button>
              <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={() => duplicateStarter(b)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to my library
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/blueprints/${b.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => remove(b)}>
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={LayoutTemplate}
        title="Blueprints"
        subtitle="Reusable scope-of-works templates. Build once, reuse on every project."
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate('/projects')}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Projects
            </Button>
            <Button size="sm" className="rounded-full" onClick={() => setCreateOpen(true)}><Plus className="h-4 w-4 mr-1" /> New blueprint</Button>
          </>
        }
      />

      <main className="px-4 sm:px-6 py-6">
      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-6">
          <section className="space-y-2">
            <div className="text-sm font-medium">Your blueprints</div>
            {own.length === 0 ? (
              <Card className="dashboard-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
                No blueprints yet. Create one, or copy a starter below.
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{own.map((b) => <Tile key={b.id} b={b} />)}</div>
            )}
          </section>

          <section className="space-y-2">
            <div className="text-sm font-medium flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Starter blueprints</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{starters.map((b) => <Tile key={b.id} b={b} />)}</div>
          </section>
        </div>
      )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Blueprint</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bathroom Renovation" autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') createBlueprint(); }} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button className="rounded-full" disabled={busy || !title.trim()} onClick={createBlueprint}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default BlueprintLibraryPage;
