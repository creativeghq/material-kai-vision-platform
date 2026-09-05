/**
 * The cover at the top of a project's Overview — the same picture the grid card wears, at full
 * width, with one line saying where it came from and (for the owner) the way to change it.
 * This is the "set it from inside the project" half of the cover feature; the card is the
 * "see it on the grid" half, and both read utils/projectCover.ts so they cannot disagree.
 */
import React, { useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardFooter } from '@/components/core/ui/card';
import type { ProjectCoverCandidate, ProjectWithClient } from '../services/projectsService';
import { describeCoverSource, resolveProjectCover } from '../utils/projectCover';
import { projectCoverInput } from '../utils/projectPresentation';
import { projectCoverSrc } from './ProjectCard';
import { ProjectCoverDialog } from './ProjectCoverDialog';

interface ProjectCoverPanelProps {
  project: ProjectWithClient;
  isOwner: boolean;
  /** Top moodboard candidate, fetched once by the page so the header thumbnail agrees with this. */
  candidate: ProjectCoverCandidate | null | undefined;
  onProjectPatched?: (patch: Partial<ProjectWithClient>) => void;
  className?: string;
}

export const ProjectCoverPanel: React.FC<ProjectCoverPanelProps> = ({
  project, isOwner, candidate, onProjectPatched, className,
}) => {
  const [open, setOpen] = useState(false);
  const cover = useMemo(() => resolveProjectCover(projectCoverInput(project), candidate), [project, candidate]);

  return (
    <Card className={className}>
      <div className="relative aspect-[21/9] w-full overflow-hidden rounded-t-md bg-surface-sunken sm:aspect-[3/1] sm:max-h-72">
        <img
          src={projectCoverSrc(cover, 1600)}
          alt=""
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
      <CardFooter className="bg-surface-sunken py-2 text-xs text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{describeCoverSource(cover)}</span>
        {isOwner && (
          <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setOpen(true)}>
            Change cover
          </Button>
        )}
      </CardFooter>
      {isOwner && open && (
        <ProjectCoverDialog
          project={project}
          open={open}
          onOpenChange={setOpen}
          currentCover={cover}
          onSaved={(url) => onProjectPatched?.({ cover_image_url: url })}
        />
      )}
    </Card>
  );
};
