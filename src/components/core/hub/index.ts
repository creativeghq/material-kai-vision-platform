/**
 * HUB — the application-shell pattern library.
 *
 * `components/core/ui/*` holds the PRIMITIVES (a button, a table cell, a
 * checkbox). This folder holds the PATTERNS those primitives compose into: a
 * list screen, a record screen, a dashboard, a settings rail. The split matters
 * because the patterns are where the design decisions live — a `<Table>` cannot
 * know that money aligns right, that a filtered-empty list must not offer a
 * create button, or that a record page has three columns with three different
 * jobs. Those rules live here, once, instead of being re-derived per page.
 *
 * See `.claude/design-system.md` for the rules and `/design-system` (in-app)
 * for the live specimen sheet.
 */
export { HubToolbar, HubFilterSelect, HubResetFilters } from './HubToolbar';
export type { HubFilterOption } from './HubToolbar';

export { HubDataTable, HubCellLink, HubCellEmpty } from './HubDataTable';
export type { HubColumn, HubSort } from './HubDataTable';

export {
  HubRecordLayout,
  HubRecordIdentity,
  HubPanel,
  HubPanelAddAction,
  HubProperty,
  HubPropertyList,
} from './HubRecordLayout';

export { HubTimeline, HubTimelineGroup, HubTimelineItem } from './HubTimeline';

export { HubStatTile, HubStatGrid } from './HubStatTile';
export type { HubStatDelta } from './HubStatTile';

export { HubSideNav, HubRailSectionLabel } from './HubSideNav';
export type { HubNavItem, HubNavGroup } from './HubSideNav';

export { HubTabNav, HubTabAddAction } from './HubTabNav';
export type { HubTabItem } from './HubTabNav';

export { HubEmptyState } from './HubEmptyState';
