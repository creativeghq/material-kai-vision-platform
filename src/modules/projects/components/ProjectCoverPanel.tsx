/**
 * The cover at the top of a project's Overview — the same picture the grid card wears, with the
 * project's description and key facts laid over it. Both this and the card read
 * utils/projectCover.ts, so they cannot disagree about which picture it is.
 */
import React, { useMemo, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { HubRecordHero, type HubHeroFact } from '@/components/core/hub';
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
  facts?: HubHeroFact[];
  badges?: React.ReactNode;
  className?: string;
}

export const ProjectCoverPanel: React.FC<ProjectCoverPanelProps> = ({
  project, isOwner, candidate, onProjectPatched, facts, badges, className,
}) => {
  const [open, setOpen] = useState(false);
  const cover = useMemo(() => resolveProjectCover(projectCoverInput(project), candidate), [project, candidate]);

  return (
    <>
      <HubRecordHero
        className={className}
        imageUrl={projectCoverSrc(cover, 1600)}
        badges={badges}
        description={project.description}
        facts={facts}
        actions={isOwner ? (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 border-white/30 bg-black/50 text-white hover:bg-black/70"
            title={describeCoverSource(cover)}
            onClick={() => setOpen(true)}
          >
            <ImageIcon className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            Change cover
          </Button>
        ) : undefined}
      />
      {isOwner && open && (
        <ProjectCoverDialog
          project={project}
          open={open}
          onOpenChange={setOpen}
          currentCover={cover}
          onSaved={(url) => onProjectPatched?.({ cover_image_url: url })}
        />
      )}
    </>
  );
};
