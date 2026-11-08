/** Estimate: one section, two ways to measure the job — typed dimensions (the plan) or read drawings (takeoff). */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Ruler, ScanLine } from 'lucide-react';

import { Card } from '@/components/core/ui/card';
import { HubEmptyState, HubSegmented } from '@/components/core/hub';
import type { HubSegment } from '@/components/core/hub';
import { PlanTab } from './PlanTab';
import { TakeoffTab } from './TakeoffTab';

export type EstimateView = 'dimensions' | 'drawings';

interface EstimateTabProps {
  projectId: string;
  workspaceId: string | null;
  currency: string;
  showTakeoff: boolean;
  initialView?: EstimateView;
}

const VIEWS: readonly HubSegment<EstimateView>[] = [
  { value: 'dimensions', label: <><Ruler className="h-3.5 w-3.5" /> From Dimensions</>, title: 'Price a plan from a blueprint and a few measurements' },
  { value: 'drawings', label: <><ScanLine className="h-3.5 w-3.5" /> From Drawings</>, title: 'Read quantities off the drawing PDFs' },
];

export const EstimateTab: React.FC<EstimateTabProps> = ({
  projectId, workspaceId, currency, showTakeoff, initialView,
}) => {
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<EstimateView>(
    () => initialView ?? (sp.get('revision') ? 'drawings' : 'dimensions'),
  );
  const active: EstimateView = showTakeoff ? view : 'dimensions';

  const choose = (next: EstimateView) => {
    setView(next);
    if (next === 'dimensions' && sp.has('revision')) {
      setSp((prev) => { const p = new URLSearchParams(prev); p.delete('revision'); return p; }, { replace: true });
    }
  };

  const plan = workspaceId
    ? <PlanTab projectId={projectId} workspaceId={workspaceId} currency={currency} />
    : (
      <Card className="dashboard-card p-0">
        <HubEmptyState
          icon={ClipboardList}
          title="This project has no workspace"
          description="A plan is priced against a workspace's service catalogue, so it cannot be built until the project belongs to one."
        />
      </Card>
    );

  if (!showTakeoff) return plan;

  return (
    <div className="space-y-4">
      <HubSegmented options={VIEWS} value={active} onChange={choose} aria-label="How to estimate" />
      {active === 'drawings' ? <TakeoffTab projectId={projectId} /> : plan}
    </div>
  );
};

export default EstimateTab;
