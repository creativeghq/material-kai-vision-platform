/**
 * Your time, in one place — Profile → Schedule.
 *
 * Three surfaces used to answer one question between them, and none of them could see the others:
 *
 *   • **Availability** was a card two thirds of the way down the Profile tab, wedged between the
 *     supplier-verification form and the featured moodboard.
 *   • **Appointments** — the bookings that availability produces — was its own tab.
 *   • **Calendar** — the CRM meetings you keep — was a third tab.
 *
 * Which meant the commonest question a professional has ("why has nobody booked me?") needed
 * three tabs to answer, and the answer — Accept bookings is off, or no dates are published — was
 * on the one furthest from the empty list. They are one rail now, so the empty Appointments
 * section can point at the section that fills it.
 *
 * The rail is `HubSideNav` (the settings archetype) rather than three more tabs: the Profile tab
 * strip already wraps to two lines, and a fourth row of tabs stops telling you where you are.
 * Same shape as `SocialHubPanel`, deliberately — `?section=` is a real deep-link that round-trips
 * through the URL, so a reload and a bookmark both keep their place.
 *
 * `?section=` is this panel's EXTERNAL contract: `/profile?tab=schedule&section=calendar` is what
 * `appDestinations`, the launcher and `crm-meeting-reminders` link to. Renaming a section id
 * breaks those links silently — they resolve, fall back to the default section, and land the
 * reader somewhere plausible and wrong — so the ids are pinned by
 * tests/unit/profileSectionLinks.test.ts.
 */
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
 * imply they are the same: **Bookings** is what strangers do to your calendar through your public
 * profile, **Meetings** is what you logged against a CRM party yourself.
 */
const GROUPS: HubNavGroup[] = [
  {
    label: 'Bookings',
    items: [
      { id: 'appointments', label: 'Booked with you', icon: CalendarCheck },
      { id: 'availability', label: 'When you are free', icon: Clock },
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
