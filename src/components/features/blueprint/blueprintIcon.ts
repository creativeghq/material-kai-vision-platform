// Icon for a blueprint, picked from what the scope IS.
//
// Every blueprint used to render the same Sparkles, which made a rail of five starters five
// identical rows — the icon column carried no information at all, so it was decoration taking up
// space a reader scans first.
//
// Matched against `project_type` and the title together, because `project_type` is free text and
// frequently absent: PlanTab writes the plan's own title into it, and a blueprint created from the
// New dialog has none at all. Falling back to the title means a blueprint called "Bathroom refit"
// still gets the bath.
//
// ORDER MATTERS — first match wins, and the specific patterns come before the general ones.
// "kitchen_cabinets" contains "kitchen", so cabinets has to be tested first or every cabinet job
// renders as a hob. Same reason the catch-all renovation terms sit at the bottom.
import {
  Archive, Bath, CookingPot, DoorOpen, Droplets, Hammer, Home, LayoutTemplate,
  Paintbrush, Sofa, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const RULES: readonly [RegExp, LucideIcon][] = [
  [/cabinet|wardrobe|closet|joinery/, Archive],
  [/kitchen|cook/, CookingPot],
  [/bath|shower|toilet|\bwc\b|sanitary/, Bath],
  [/paint|decorat|plaster/, Paintbrush],
  [/electric|wiring|lighting|socket/, Zap],
  [/plumb|pipe|drain|water/, Droplets],
  [/door|window|glazing/, DoorOpen],
  [/furnitur|living|lounge|bedroom|sofa/, Sofa],
  [/home|house|apartment|flat|villa|full|whole/, Home],
  [/renovat|refurb|refit|build|construct|works/, Hammer],
];

/** The icon for a blueprint. `LayoutTemplate` when nothing matches — never a guess dressed up. */
export function blueprintIcon(input: { project_type?: string | null; title?: string | null }): LucideIcon {
  const hay = `${input.project_type ?? ''} ${input.title ?? ''}`.toLowerCase();
  for (const [re, icon] of RULES) if (re.test(hay)) return icon;
  return LayoutTemplate;
}
