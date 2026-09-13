/** `/visualizer` — a tile, stone or floor on a room photo, at its real size (#447 Phase 1). */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { SurfaceVisualizer } from '@/components/features/visualizer/SurfaceVisualizer';
import { SceneEditor } from '@/components/features/visualizer/SceneEditor';
import { parseRenderState, serializeRenderState, type RenderState } from '@/lib/surfaceRenderer';
import {
  visualizerService, SURFACE_KIND_LABELS, type VisualizerScene, type VisualizerSurface, type SurfaceProduct,
} from '@/services/visualizerService';

export default function SurfaceVisualizerPage() {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const initial = useMemo(() => parseRenderState(params), [params]);

  const [scenes, setScenes] = useState<VisualizerScene[]>([]);
  const [products, setProducts] = useState<SurfaceProduct[]>([]);
  const [sceneId, setSceneId] = useState<string | null>(initial.sceneId);
  const [scene, setScene] = useState<VisualizerScene | null>(null);
  const [surfaces, setSurfaces] = useState<VisualizerSurface[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (!activeWorkspaceId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      visualizerService.listScenes(activeWorkspaceId),
      visualizerService.listSurfaceProducts(activeWorkspaceId, initial.productId ? [initial.productId] : []),
    ])
      .then(([s, p]) => {
        if (cancelled) return;
        setScenes(s);
        setProducts(p);
        setFailure(null);
        if (!sceneId && s[0]) setSceneId(s[0].id);
      })
      .catch((e: unknown) => { if (!cancelled) setFailure(e instanceof Error ? e.message : 'Could not load scenes'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!sceneId) { setScene(null); setSurfaces([]); return; }
    let cancelled = false;
    visualizerService.getScene(sceneId)
      .then(({ scene: s, surfaces: sf }) => { if (!cancelled) { setScene(s); setSurfaces(sf); setEditing(sf.length === 0 && s.workspace_id !== null); } })
      .catch((e: unknown) => { if (!cancelled) setFailure(e instanceof Error ? e.message : 'Could not load the scene'); });
    return () => { cancelled = true; };
  }, [sceneId]);

  const onStateChange = useCallback((state: RenderState) => {
    const next = serializeRenderState(state);
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [params, setParams]);

  const upload = useCallback(async (file: File | undefined) => {
    if (!file || !activeWorkspaceId) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const created = await visualizerService.createScene(activeWorkspaceId, user.id, file, newName.trim() || file.name.replace(/\.[^.]+$/, ''), null);
      setScenes((prev) => [...prev, created]);
      setSceneId(created.id);
      setNewName('');
      toast({ title: 'Photo added', description: 'Now mark the surface: click its four corners.' });
    } catch (e) {
      toast({ title: 'Upload failed', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [activeWorkspaceId, newName, toast]);

  const removeScene = useCallback(async (s: VisualizerScene) => {
    if (!s.workspace_id) return;
    try {
      await visualizerService.deleteScene(s.id);
      setScenes((prev) => prev.filter((x) => x.id !== s.id));
      if (sceneId === s.id) setSceneId(null);
    } catch (e) {
      toast({ title: 'Could not delete', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }, [sceneId, toast]);

  const removeSurface = useCallback(async (s: VisualizerSurface) => {
    try {
      await visualizerService.deleteSurface(s.id);
      setSurfaces((prev) => prev.filter((x) => x.id !== s.id));
    } catch (e) {
      toast({ title: 'Could not remove the surface', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    }
  }, [toast]);

  if (!activeWorkspaceId) return null;

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Surface Visualizer</CardTitle>
          <CardDescription>
            A product's real face on a room photo at its real format, with the pattern and the joint you choose. Drawn in your browser, no credits.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading scenes…</div>
          ) : failure ? (
            <p className="text-sm text-destructive">Could not load: {failure}</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[14rem_minmax(0,1fr)]">
              <div className="grid content-start gap-2">
                <p className="text-xs font-medium">Scenes</p>
                <div className="grid max-h-[28rem] gap-1 overflow-y-auto pr-1">
                  {scenes.map((s) => (
                    <div key={s.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSceneId(s.id)}
                        className={`flex flex-1 items-center gap-2 rounded-sm border px-1.5 py-1 text-left text-xs ${sceneId === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40'}`}
                      >
                        <img src={s.imageUrl} alt="" className="h-9 w-12 rounded-sm object-cover" loading="lazy" />
                        <span className="min-w-0 flex-1 truncate">{s.name}{s.workspace_id ? '' : ' · library'}</span>
                      </button>
                      {s.workspace_id && (
                        <button type="button" title="Delete this photo" onClick={() => removeScene(s)} className="text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  {scenes.length === 0 && <p className="text-[11px] text-muted-foreground">No scenes yet. Upload a photo of a room.</p>}
                </div>
                <div className="grid gap-1 border-t border-border pt-2">
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name (optional)" className="h-8 text-xs" />
                  <label className="inline-flex cursor-pointer items-center justify-center gap-1 rounded-sm border border-border px-2 py-1.5 text-xs font-medium hover:bg-muted/40">
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Upload your room photo
                    <input type="file" accept="image/*" className="sr-only" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
                  </label>
                </div>
              </div>

              <div className="min-w-0">
                {!scene ? (
                  <HubEmptyState
                    variant="empty"
                    title="Pick a scene"
                    description="Choose a library room on the left, or upload a photo of your own."
                  />
                ) : (
                  <div className="grid gap-3">
                    {scene.workspace_id && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                          {surfaces.length === 0 && <span>No surface marked on this photo yet.</span>}
                          {surfaces.map((s) => (
                            <span key={s.id} className="inline-flex items-center gap-1 rounded-sm border border-border px-1.5 py-0.5">
                              {SURFACE_KIND_LABELS[s.kind]} · {(s.width_cm / 100).toFixed(1)} × {(s.depth_cm / 100).toFixed(1)} m
                              <button type="button" title="Remove this surface" aria-label={`Remove the ${SURFACE_KIND_LABELS[s.kind]} surface`} onClick={() => removeSurface(s)} className="text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                          {editing ? 'Done marking' : 'Mark a surface'}
                        </Button>
                      </div>
                    )}
                    {editing && scene.workspace_id ? (
                      <SceneEditor
                        scene={scene}
                        workspaceId={activeWorkspaceId}
                        existing={surfaces}
                        onSaved={(s) => { setSurfaces((prev) => [...prev.filter((x) => x.id !== s.id), s]); setEditing(false); }}
                      />
                    ) : products.length === 0 ? (
                      <HubEmptyState
                        variant="empty"
                        title="No product to tile yet"
                        description="A product needs a photo of its face and, ideally, a recorded format. Add one and come back."
                        action={<Button asChild size="sm"><Link to="/discover?tab=products">Open products</Link></Button>}
                      />
                    ) : (
                      <SurfaceVisualizer
                        key={scene.id}
                        scene={scene}
                        surfaces={surfaces}
                        products={products}
                        workspaceId={activeWorkspaceId}
                        initialState={initial}
                        onStateChange={onStateChange}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
