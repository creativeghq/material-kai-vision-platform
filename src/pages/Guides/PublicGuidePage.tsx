import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { CanvasLoader } from '@/components/features/ar/CanvasChrome';
import { useToast } from '@/hooks/use-toast';
import { installationGuideService, type InstallationGuideRow } from '@/services/installationGuideService';
import { GuidePlayerView } from './GuidePlayerPage';

export default function PublicGuidePage() {
  const { token = '' } = useParams();
  const { toast } = useToast();
  const [opened, setOpened] = useState<{ row: InstallationGuideRow; pageUrls: string[]; photoUrl: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    installationGuideService.openPublic(token)
      .then((r) => { if (live) setOpened(r); })
      .catch((e: unknown) => { if (live) setError(e instanceof Error ? e.message : 'This link is not valid any more.'); });
    return () => { live = false; };
  }, [token]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background p-6 text-center">
        <p className="text-sm font-medium">{error}</p>
        <p className="text-xs text-muted-foreground">Ask whoever sent it for a new link.</p>
      </div>
    );
  }
  if (!opened?.row.guide) return <div className="flex h-screen items-center justify-center bg-background"><CanvasLoader label="Opening the guide…" /></div>;
  return <GuidePlayerView row={opened.row} guide={opened.row.guide} pageUrls={opened.pageUrls} sourceUrl={null} photoUrl={opened.photoUrl} toast={toast} shared />;
}
