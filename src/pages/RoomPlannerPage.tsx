/**
 * `/room-planner` — the 2D room planner (#321 M3, #259 Phase 1).
 *
 * A page of its own rather than a tab inside moodboards or projects: a plan is about ONE room and
 * is referenced from several places (a quote, a client view, a moodboard — #259 Phase 4). Burying
 * it inside one of those would make the other two link sideways into a feature that looks like it
 * belongs to something else.
 */
import React from 'react';
import { Ruler } from 'lucide-react';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { RoomPlannerPanel } from '@/components/features/roomplanner/RoomPlannerPanel';

export const RoomPlannerPage: React.FC = () => (
  <div className="container mx-auto space-y-5 p-6">
    <SectionHeader
      icon={Ruler}
      title="Room Planner"
      subtitle="Arrange catalog products on a floor plan at their real size."
    />
    <RoomPlannerPanel />
  </div>
);

export default RoomPlannerPage;
