import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, FileUp, Loader2, Plus } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  sceneStudioService, type RecentGeneration, type SceneReadStatus, type SceneRow, type SceneSourceKind,
} from '@/services/sceneStudioService';

export const SCENE_READ_STATUS: Record<SceneReadStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  none: { label: 'Ready', variant: 'neutral' },
  extracting: { label: 'Reading', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
};

export const SCENE_SOURCE_LABEL: Record<SceneSourceKind, string> = {
  blank: 'Blank Room',
  plan_image: 'Floor Plan',
  photo: 'Photo',
  render: 'Render',
  drawing: 'Drawing',
};

type StartFrom = 'plan_image' | 'photo' | 'render' | 'blank';

const START_OPTIONS = [
  { value: 'plan_image', label: 'Floor Plan' },
  { value: 'photo', label: 'Photo' },
  { value: 'render', label: 'My Renders' },
  { value: 'blank', label: 'Blank Room' },
] as const;

const START_HELP: Record<StartFrom, string> = {
  plan_image: 'Upload a floor plan image. Rooms, walls, doors, windows and drawn furniture are read into a 3D model you can walk around.',
  photo: 'Upload a photo of a room. The room and every piece of furniture in it are rebuilt as an editable 3D layout, viewed from where the photo was taken.',
  render: 'Pick one of your generated images. It is rebuilt as an editable 3D layout so you can rearrange it and render it again.',
  blank: 'Start from an empty rectangular room and add furniture yourself.',
};

export function NewSceneDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [from, setFrom] = useState<StartFrom>('plan_image');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<RecentGeneration | null>(null);
  const [recent, setRecent] = useState<RecentGeneration[] | null>(null);
  const [room, setRoom] = useState({ width: '5', depth: '4', height: '2.7' });
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) { setFile(null); setPicked(null); setBusy(null); setName(''); }
  }, [open]);

  useEffect(() => {
    if (!open || from !== 'render' || recent) return;
    sceneStudioService.recentGenerations(24).then(setRecent).catch(() => setRecent([]));
  }, [open, from, recent]);

  const metres = (v: string) => Math.round(Number.parseFloat(v.replace(',', '.')) * 1000);
  const roomValid = [room.width, room.depth, room.height].every((v) => metres(v) >= 1000 && metres(v) <= 40000);
  const canStart = !busy && !!activeWorkspaceId && (
    from === 'blank' ? roomValid : from === 'render' ? !!picked : !!file
  );

  const start = async () => {
    if (!activeWorkspaceId || !canStart) return;
    try {
      setBusy('Creating the scene');
      const kind: SceneSourceKind = from;
      const scene = await sceneStudioService.create({
        workspaceId: activeWorkspaceId,
        name: name || (file?.name.replace(/\.[a-z0-9]+$/i, '') ?? (from === 'blank' ? 'New room' : 'New scene')),
        kind,
        file,
        imageUrl: picked?.image_url ?? null,
        room: from === 'blank' ? { widthMm: metres(room.width), depthMm: metres(room.depth), heightMm: metres(room.height) } : undefined,
      });
      if (from !== 'blank') {
        setBusy('Sending it to be read');
        try {
          await sceneStudioService.read(scene.id);
        } catch (e) {
          toast({ title: 'The image was uploaded but not read', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
        }
      }
      onOpenChange(false);
      navigate(`/scene-studio/${scene.id}`);
    } catch (e) {
      setBusy(null);
      toast({ title: 'The scene could not be created', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New scene</DialogTitle>
          <DialogDescription>{START_HELP[from]}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <HubSegmented options={START_OPTIONS} value={from} onChange={(v) => { setFrom(v); setFile(null); setPicked(null); }} aria-label="Start from" />
          <FormField label="Name" optional>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Living room, Ground floor…" maxLength={200} />
          </FormField>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {(from === 'plan_image' || from === 'photo') && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-hairline bg-surface-sunken px-4 py-8 text-sm text-muted-foreground hover:text-foreground"
            >
              <FileUp className="h-6 w-6" />
              {file ? <span className="font-medium text-foreground">{file.name}</span> : from === 'plan_image' ? 'Choose a floor plan image (PNG, JPEG or WebP)' : 'Choose a photo of the room'}
            </button>
          )}
          {from === 'render' && (
            recent === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your renders</p>
            ) : recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no generated images yet. Generate one in the Agent Hub, or start from a photo.</p>
            ) : (
              <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                {recent.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setPicked(g)}
                    className={`overflow-hidden rounded-sm border ${picked?.id === g.id ? 'border-primary ring-2 ring-primary' : 'border-hairline'}`}
                    title={g.prompt ?? undefined}
                  >
                    <img src={g.image_url} alt={g.prompt ?? 'Generated image'} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )
          )}
          {from === 'blank' && (
            <FormGrid cols={3}>
              <FormField label="Width (m)"><Input inputMode="decimal" value={room.width} onChange={(e) => setRoom({ ...room, width: e.target.value })} /></FormField>
              <FormField label="Depth (m)"><Input inputMode="decimal" value={room.depth} onChange={(e) => setRoom({ ...room, depth: e.target.value })} /></FormField>
              <FormField label="Ceiling Height (m)"><Input inputMode="decimal" value={room.height} onChange={(e) => setRoom({ ...room, height: e.target.value })} /></FormField>
            </FormGrid>
          )}
          {from !== 'blank' && <p className="text-xs text-muted-foreground">Reading an image is charged once. Sizes read from a picture are estimates and are marked as such.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={!!busy}>Cancel</Button>
          <Button onClick={start} disabled={!canStart} className="gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ?? (from === 'blank' ? 'Create room' : 'Build the 3D room')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ListRow = Awaited<ReturnType<typeof sceneStudioService.list>>[number];

export default function SceneStudioPage() {
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<ListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      setRows(await sceneStudioService.list(activeWorkspaceId));
      setFailed(false);
    } catch (e) {
      setFailed(true);
      toast({ title: 'Scenes could not be loaded', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const newButton = <Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-4 w-4" />New scene</Button>;

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={Box}
        title="Scene Studio"
        subtitle="Turn a floor plan, a photo or a render into a 3D room you can rearrange, restyle and render photo-real."
        actions={newButton}
      />
      <div className="p-4 sm:p-6">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading scenes</p>
        ) : rows.length === 0 ? (
          <Card>
            {failed ? (
              <HubEmptyState icon={Box} title="Scenes could not be loaded" description="Something went wrong reading this workspace's scenes." action={<Button variant="outline" onClick={() => void load()}>Try again</Button>} />
            ) : (
              <HubEmptyState icon={Box} title="No scenes yet" description="Start from a floor plan, a room photo or one of your renders, and it becomes a 3D room you can edit and render." action={newButton} />
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r: SceneRow & ListRow) => (
              <Card key={r.id} className="panel-interactive cursor-pointer overflow-hidden" onClick={() => navigate(`/scene-studio/${r.id}`)}>
                <div className="flex aspect-[16/9] items-center justify-center bg-surface-sunken">
                  {r.cover_url ? <img src={r.cover_url} alt={r.name} className="h-full w-full object-cover" loading="lazy" /> : <Box className="h-8 w-8 text-muted-foreground" />}
                </div>
                <div className="space-y-1 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <Badge variant={SCENE_READ_STATUS[r.extract_status].variant}>{SCENE_READ_STATUS[r.extract_status].label}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {SCENE_SOURCE_LABEL[r.source_kind]} · {r.object_count} objects · {r.render_count} renders · {formatDate(r.updated_at)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <NewSceneDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
