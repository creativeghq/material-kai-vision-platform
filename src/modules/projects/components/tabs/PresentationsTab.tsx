import React, { useEffect, useState } from 'react';

import { HubSegmented, type HubSegment } from '@/components/core/hub';
import { SheetsTab } from './SheetsTab';
import { ClientViewTab } from './ClientViewTab';

export type PresentationsView = 'sheets' | 'client-views';

export interface PresentationsTabProps {
  projectId: string;
  projectName: string;
  /** Team member. Client views (share links, feedback) are team-only. */
  isOwner: boolean;
  initialView?: PresentationsView;
}

const VIEWS: readonly HubSegment<PresentationsView>[] = [
  { value: 'sheets', label: 'Sheets', title: 'Technical plans and moodboard presentation sheets' },
  { value: 'client-views', label: 'Client Views', title: 'Sheets bundled into a shareable PDF and online presentation' },
];

export const PresentationsTab: React.FC<PresentationsTabProps> = ({ projectId, projectName, isOwner, initialView }) => {
  const [view, setView] = useState<PresentationsView>(initialView ?? 'sheets');

  useEffect(() => { if (initialView) setView(initialView); }, [initialView]);

  const effective: PresentationsView = isOwner ? view : 'sheets';

  return (
    <div className="space-y-4">
      {isOwner && (
        <HubSegmented options={VIEWS} value={effective} onChange={setView} aria-label="Presentations view" />
      )}
      {effective === 'client-views'
        ? <ClientViewTab projectId={projectId} projectName={projectName} onShowSheets={() => setView('sheets')} />
        : <SheetsTab projectId={projectId} isOwner={isOwner} />}
    </div>
  );
};
