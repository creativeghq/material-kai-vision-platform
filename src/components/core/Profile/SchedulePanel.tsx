/** Your time, in one place — Profile → Schedule. */
import React, { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarCheck, CalendarDays, Clock } from 'lucide-react';
import { HubSideNav, type HubNavGroup } from '@/components/core/hub/HubSideNav';
import { AppointmentsPage } from '@/pages/AppointmentsPage';
import { ProfileMeetingsTab } from './ProfileMeetingsTab';
import { AvailabilitySettings } from './AvailabilitySettings';

export type ScheduleSectionId = 'appointments' | 'availability' | 'calendar';

/** Landed on when `?section=` is absent or names something this rail does not offer. */
export const DEFAULT_SCHEDULE_SECTION: ScheduleSectionId = 'appointments';

/**
 * The ids an external link may name. Exported so the guard test checks the real list rather than
 * a copy of it — a second copy is how a link and the rail start disagreeing.
 */
export const SCHEDULE_SECTION_IDS: readonly ScheduleSectionId[] = [
  'appointments', 'availability', 'calendar',
];

const SECTIONS: Record<ScheduleSectionId, React.ComponentType> = {
  appointments: AppointmentsPage,
  availability: AvailabilitySettings,
  calendar: ProfileMeetingsTab,
};

/**
 * Two groups, because these are two different kinds of time and merging them into one list would
 * imply they are the same: **Calendar** is what strangers do to your calendar through your public
 * profile, **Meetings** is what you logged against a CRM party yourself.
 *
 * Labels are free to change; the `id`s are the external contract (`?section=`) and are not.
 */
const GROUPS: HubNavGroup[] = [
  {
    label: 'Calendar',
    items: [
      { id: 'appointments', label: 'Bookings', icon: CalendarCheck },
      { id: 'availability', label: 'Availability', icon: Clock },
    ],
  },
  {
    label: 'Meetings',
    items: [{ id: 'calendar', label: 'My calendar', icon: CalendarDays }],
  },
];

const OFFERED = new Set<string>(SCHEDULE_SECTION_IDS);

export const SchedulePanel: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const raw = params.get('section');
  const active: ScheduleSectionId = raw && OFFERED.has(raw)
    ? (raw as ScheduleSectionId)
    : DEFAULT_SCHEDULE_SECTION;

  // Normalise the URL when it named something unreachable, so a bookmark stops lying about where
  // it lands. Only when `raw` was set — an absent `?section=` is the default, not a mistake.
  useEffect(() => {
    if (raw && raw !== active) {
      const next = new URLSearchParams(params);
      next.set('section', active);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, active]);

  const select = (id: string) => {
    const next = new URLSearchParams(params);
    next.set('section', id);
    setParams(next, { replace: true });
  };

  const Section = useMemo(() => SECTIONS[active], [active]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <HubSideNav
        groups={GROUPS}
        activeId={active}
        onSelect={select}
        aria-label="Schedule sections"
      />
      <div className="min-w-0 flex-1">
        <Section />
      </div>
    </div>
  );
};

export default SchedulePanel;
