// Icon for a blueprint, picked from what the scope IS.
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
