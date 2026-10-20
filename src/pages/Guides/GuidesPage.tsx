import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, FileUp, Loader2, Plus } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { HubDataTable, type HubColumn } from '@/components/core/hub';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { Progress } from '@/components/core/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  installationGuideService,
  MAX_GUIDE_PAGES,
  type GuideStatus,
  type InstallationGuideRow,
  type UploadProgress,
} from '@/services/installationGuideService';

export const GUIDE_STATUS: Record<GuideStatus, { label: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  draft: { label: 'Not read', variant: 'neutral' },
  extracting: { label: 'Reading', variant: 'info' },
  review: { label: 'To review', variant: 'warning' },
  published: { label: 'Published', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
};

const PHASE_LABEL: Record<UploadProgress['phase'], string> = {
  creating: 'Creating the guide',
  uploading: 'Uploading the PDF',
  rendering: 'Turning pages into images',
  reading: 'Sending it to be read',
};

export function NewGuideDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const busy = progress !== null;

  useEffect(() => {
    if (!open) { setFile(null); setProgress(null); }
  }, [open]);

  const start = async () => {
    if (!file || !activeWorkspaceId) return;
    try {
      const row = await installationGuideService.create(activeWorkspaceId, file, setProgress);
      setProgress({ phase: 'reading', done: row.page_count, total: row.page_count });
      try {
        await installationGuideService.read(row.id);
      } catch (e) {
        toast({ title: 'The manual was uploaded but not read', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
      }
      onOpenChange(false);
      navigate(`/guides/${row.id}`);
    } catch (e) {
      setProgress(null);
      toast({ title: 'The manual could not be uploaded', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New installation guide</DialogTitle>
          <DialogDescription>
            Upload a supplier's installation or assembly manual as a PDF (up to {MAX_GUIDE_PAGES} pages). Every page is read into the parts and the steps, and you check the result before it is published.
          </DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {progress ? (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{PHASE_LABEL[progress.phase]}{progress.phase === 'rendering' ? ` — page ${progress.done + 1} of ${progress.total}` : ''}</p>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-sm border border-dashed border-hairline bg-surface-sunken px-4 py-8 text-sm text-muted-foreground hover:text-foreground"
          >
            <FileUp className="h-6 w-6" />
            {file ? <span className="font-medium text-foreground">{file.name}</span> : 'Choose a PDF'}
          </button>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={start} disabled={!file || busy}>Read the manual</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function GuidesPage() {
  const { activeWorkspaceId } = useWorkspace();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<InstallationGuideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      setRows(await installationGuideService.list(activeWorkspaceId));
      setFailed(false);
    } catch (e) {
      setFailed(true);
      toast({ title: 'Guides could not be loaded', description: e instanceof Error ? e.message : undefined, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const columns: HubColumn<InstallationGuideRow>[] = [
    { id: 'title', header: 'Guide', cell: (r) => <span className="font-medium">{r.guide?.title || r.title}</span> },
    { id: 'status', header: 'Status', cell: (r) => <Badge variant={GUIDE_STATUS[r.status].variant}>{GUIDE_STATUS[r.status].label}</Badge> },
    { id: 'pages', header: 'Pages', align: 'right', cell: (r) => r.page_count || '—', hideBelow: 'sm' },
    { id: 'steps', header: 'Steps', align: 'right', cell: (r) => (r.guide ? Math.max(r.guide.steps.length - 1, 0) : '—'), hideBelow: 'sm' },
    { id: 'updated', header: 'Updated', cell: (r) => formatDate(r.updated_at), hideBelow: 'md' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={BookOpen}
        title="Installation guides"
        subtitle="Supplier manuals turned into interactive step-by-step 3D guides, with the manual beside them page for page."
        actions={<Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-4 w-4" />New guide</Button>}
      />
      <div className="p-4 sm:p-6">
        <Card className="overflow-hidden">
          <HubDataTable
            rows={rows}
            columns={columns}
            rowId={(r) => r.id}
            onRowClick={(r) => navigate(`/guides/${r.id}`)}
            loading={loading}
            empty={failed ? (
              <HubEmptyState icon={BookOpen} title="Guides could not be loaded" description="Something went wrong reading this workspace's guides." action={<Button variant="outline" onClick={() => void load()}>Try again</Button>} />
            ) : (
              <HubEmptyState
                icon={BookOpen}
                title="No installation guides yet"
                description="Upload a supplier's installation PDF and it becomes a guide your customers can step through in 3D."
                action={<Button onClick={() => setCreating(true)} className="gap-1.5"><Plus className="h-4 w-4" />New guide</Button>}
              />
            )}
          />
        </Card>
      </div>
      <NewGuideDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
