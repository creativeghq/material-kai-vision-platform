/**
 * Design System Components
 *
 * Reusable components following the dark dashboard design.
 *
 * The `Metric` family below is the 2026 command-center language (see
 * `.claude/design-system.md` §16). Reach for it whenever a screen has a headline
 * number: the platform's flatness came from having no type tier above 36px, so a
 * KPI and a table cell carried identical visual weight.
 */

export { DashboardCard } from './DashboardCard';
export { StatCard } from './StatCard';
export { SectionContainer } from './SectionContainer';
export { Badge } from './Badge';
export { Button } from './Button';
export { Input } from './Input';

// ── 2026 command-center language ────────────────────────────────────────────
export { Metric, splitMetric, type MetricSize } from './Metric';
export { Sparkline } from './Sparkline';
export {
  MicroLabel,
  DeltaChip,
  Meter,
  CircleAction,
  deltaDirection,
  type DeltaDirection,
} from './MetricParts';
export { StatTile } from './StatTile';
export { KpiCard, type ComparePeriod } from './KpiCard';
export { MeshCard } from './MeshCard';
export { QuickActions, type QuickAction } from './QuickActions';
export { NotchPanel, NotchGroup } from './NotchPanel';
