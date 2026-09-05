/**
 * COVER PICKER — how an owner sets the picture a project wears on the grid and at the top of
 * its Overview.
 *
 * Four ways in, one save: borrow an image from one of the project's moodboards, pick a scene
 * from the library, upload a photo, or render one from a prompt. Nothing is persisted until
 * "Use this cover" — a generated image that is not chosen still sits in the generation history
 * (its credits were spent), it just never becomes the cover. "Use automatic" clears the owner's
 * choice and the ladder in utils/projectCover.ts takes over again.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Image as ImageIcon, Loader2, Palette, Sparkles, Upload } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Textarea } from '@/components/core/ui/textarea';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getOptimizedImageUrl } from '@/utils/imageUrl';
import { projectsService, type ProjectCoverCandidate, type ProjectWithClient } from '../services/projectsService';
import { goToSectionLabel, projectSectionPath } from '../projectSections';
import {
  PROJECT_COVER_CONCEPTS,
  PROJECT_COVER_LIBRARY,
  describeCoverSource,
  suggestedCoverPrompt,
  type ResolvedProjectCover,
} from '../utils/projectCover';
import { projectCoverInput } from '../utils/projectPresentation';
import { projectCoverSrc } from './ProjectCard';

type PickKind = 'moodboard' | 'library' | 'upload' | 'generate';

interface Pick {
  kind: PickKind;
  /** What gets stored — for an upload, the local preview until the file is sent on save. */
  url: string;
  file?: File;
}

interface ProjectCoverDialogProps {
  project: ProjectWithClient;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the project shows right now, so the dialog can say where it came from. */
  currentCover: ResolvedProjectCover;
  /** Called with the stored URL, or null when the cover went back to automatic. */
  onSaved: (url: string | null) => void;
}

const PickTile: React.FC<{
  src: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
}> = ({ src, label, selected, onSelect }) => (
  <button
    type="button"
    onClick={onSelect}
    aria-pressed={selected}
    title={label}
    className={cn(
      'group relative aspect-[16/10] overflow-hidden rounded-sm border bg-surface-sunken text-left transition-colors',
      selected ? 'border-primary ring-2 ring-primary ring-offset-1 ring-offset-card' : 'border-hairline hover:border-primary/50',
    )}
  >
    <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
    {selected && (
      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-sm bg-primary text-primary-foreground">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    )}
    <span className="absolute inset-x-0 bottom-0 truncate bg-card/90 px-2 py-1 text-[11px] font-medium text-foreground">
      {label}
    </span>
  </button>
);

export const ProjectCoverDialog: React.FC<ProjectCoverDialogProps> = ({
  project, open, onOpenChange, currentCover, onSaved,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState<PickKind>('moodboard');
  const [candidates, setCandidates] = useState<ProjectCoverCandidate[] | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewUrl = useRef<string | null>(null);

  // Fresh state every time it opens: a stale pick from last time is not what the owner meant.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPick(null);
    setGenerated(null);
    setPrompt(suggestedCoverPrompt(projectCoverInput(project)));
    setCandidates(null);
    projectsService.coverCandidates([project.id], 24)
      .then((m) => { if (!cancelled) setCandidates(m.get(project.id) ?? []); })
      .catch(() => { if (!cancelled) setCandidates([]); });
    return () => { cancelled = true; };
  }, [open, project]);

  // Object URLs leak until revoked; one live preview at a time.
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const chooseFile = (file: File | undefined) => {
    if (!file) return;
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = URL.createObjectURL(file);
    setPick({ kind: 'upload', url: previewUrl.current, file });
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const { url, creditsUsed } = await projectsService.generateCoverImage(project.id, prompt);
      setGenerated(url);
      setPick({ kind: 'generate', url });
      toast({
        title: 'Cover rendered',
        description: creditsUsed != null ? `${creditsUsed} credits used. Choose it below, or render again.` : undefined,
      });
    } catch (e) {
      toast({ title: 'Could not render a cover', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const save = async () => {
    if (!pick) return;
    setSaving(true);
    try {
      const url = pick.kind === 'upload' && pick.file
        ? await projectsService.uploadCoverImage(project.id, pick.file)
        : pick.url;
      await projectsService.setCoverImage(project.id, url);
      onSaved(url);
      toast({ title: 'Cover updated' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not set the cover', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const useAutomatic = async () => {
    setSaving(true);
    try {
      await projectsService.setCoverImage(project.id, null);
      onSaved(null);
      toast({ title: 'Cover set to automatic', description: 'The project now shows a moodboard image or a suggested scene.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not clear the cover', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || generating;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project cover</DialogTitle>
          <DialogDescription>
            The picture this project wears on the grid and at the top of its overview.
          </DialogDescription>
        </DialogHeader>

        {/* What it shows now, and why. */}
        <div className="flex items-center gap-3 rounded-md border border-hairline bg-surface-sunken p-3">
          <img
            src={projectCoverSrc(currentCover, 400)}
            alt=""
            className="h-14 w-24 shrink-0 rounded-sm border border-hairline object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">Current cover</p>
            <p className="truncate text-xs text-muted-foreground">{describeCoverSource(currentCover)}</p>
          </div>
          {currentCover.source === 'custom' && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={useAutomatic}>
              Use automatic
            </Button>
          )}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as PickKind)}>
          <TabsList aria-label="Where the cover comes from">
            <TabsTrigger value="moodboard"><Palette className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Moodboards</TabsTrigger>
            <TabsTrigger value="library"><ImageIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Library</TabsTrigger>
            <TabsTrigger value="upload"><Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Upload</TabsTrigger>
            <TabsTrigger value="generate"><Sparkles className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Generate</TabsTrigger>
          </TabsList>

          <TabsContent value="moodboard" className="mt-3">
            {candidates === null ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" aria-label="Loading moodboard images" />
              </div>
            ) : candidates.length === 0 ? (
              <HubEmptyState
                icon={Palette}
                title="No moodboard images yet"
                description="Images on this project’s moodboards show up here, newest board first, so the cover can be one the client has already seen."
                action={(
                  <Button
                    variant="outline"
                    onClick={() => { onOpenChange(false); navigate(projectSectionPath(project.id, 'moodboards')); }}
                  >
                    {goToSectionLabel('moodboards')}
                  </Button>
                )}
              />
            ) : (
              <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                {candidates.map((c) => (
                  <PickTile
                    key={`${c.moodboard_id ?? 'x'}:${c.image_url}`}
                    src={getOptimizedImageUrl(c.image_url, { width: 400, quality: 75 })}
                    label={c.moodboard_title ?? 'Moodboard'}
                    selected={pick?.kind === 'moodboard' && pick.url === c.image_url}
                    onSelect={() => setPick({ kind: 'moodboard', url: c.image_url })}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="library" className="mt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              Curated scenes. The one the project would pick on its own is marked.
            </p>
            <div className="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
              {PROJECT_COVER_CONCEPTS.map((key) => {
                const entry = PROJECT_COVER_LIBRARY[key];
                const suggested = key === currentCover.concept;
                return (
                  <PickTile
                    key={key}
                    src={entry.src}
                    label={suggested ? `${entry.label} · suggested` : entry.label}
                    selected={pick?.kind === 'library' && pick.url === entry.src}
                    onSelect={() => setPick({ kind: 'library', url: entry.src })}
                  />
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="upload" className="mt-3">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => chooseFile(e.target.files?.[0])}
            />
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-hairline bg-surface-sunken p-6 text-center">
              {pick?.kind === 'upload' ? (
                <img src={pick.url} alt="" className="max-h-56 w-full rounded-sm border border-hairline object-cover" />
              ) : (
                <ImageIcon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              )}
              <div>
                <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={busy}>
                  <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                  {pick?.kind === 'upload' ? 'Choose a different image' : 'Choose an image'}
                </Button>
                <p className="mt-2 text-xs text-muted-foreground">PNG, JPG or WebP, up to 10 MB. Landscape (16:9) fits the card best.</p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="generate" className="mt-3 space-y-3">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              disabled={generating}
              aria-label="Describe the cover"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={generate} disabled={busy || !prompt.trim()} variant={generated ? 'outline' : 'default'}>
                {generating
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  : <Sparkles className="mr-2 h-4 w-4" aria-hidden="true" />}
                {generated ? 'Render again' : 'Render cover'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Costs image-generation credits, the same as an interior render, and lands in your generation history.
              </p>
            </div>
            {generated && (
              <PickTile
                src={getOptimizedImageUrl(generated, { width: 800, quality: 80 })}
                label="Rendered cover"
                selected={pick?.kind === 'generate' && pick.url === generated}
                onSelect={() => setPick({ kind: 'generate', url: generated })}
              />
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={!pick || busy}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            Use this cover
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
