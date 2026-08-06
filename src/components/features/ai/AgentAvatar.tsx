import React from 'react';

import { cn } from '@/lib/utils';

/**
 * Playful character avatars for the agent roster — one hand-drawn SVG face per
 * agent, replacing the generic lucide glyphs (a trending-up arrow is a metric,
 * not a colleague). Every face is built from the same base (tinted circle,
 * rounded head, eyes, smile) plus one signature accessory so the family reads
 * as a set: JARVIS an antenna, Edith her round glasses (she IS the glasses),
 * Hermes a winged helmet, Estate a roof, Demo a party hat, and so on.
 *
 * Color comes from `currentColor` — pass the agent's existing `text-*-500`
 * class and the whole face inherits it, so avatars track the roster palette
 * and both themes for free. Facial cutouts (eyes, mouth, lenses, visor) use
 * `hsl(var(--background))` so they read as punched-out silhouette at any size.
 */

const BG = 'hsl(var(--background))';

/** Shared face base: tinted identity circle + rounded head. */
const Base: React.FC<{ head?: React.SVGProps<SVGRectElement>; children?: React.ReactNode }> = ({ head, children }) => (
  <>
    <circle cx={32} cy={32} r={32} fill="currentColor" opacity={0.15} />
    <rect x={15} y={21} width={34} height={28} rx={10} fill="currentColor" {...head} />
    {children}
  </>
);

const Eyes: React.FC<{ cy?: number; r?: number }> = ({ cy = 34, r = 3.4 }) => (
  <>
    <circle cx={25} cy={cy} r={r} fill={BG} />
    <circle cx={39} cy={cy} r={r} fill={BG} />
  </>
);

const Smile: React.FC<{ d?: string }> = ({ d = 'M26 41 Q32 46 38 41' }) => (
  <path d={d} stroke={BG} strokeWidth={2.5} strokeLinecap="round" fill="none" />
);

/** JARVIS — the classic helpful robot: single antenna, calm smile. */
const JarvisFace = () => (
  <Base>
    <rect x={30.5} y={13} width={3} height={9} rx={1.5} fill="currentColor" />
    <circle cx={32} cy={11.5} r={3.5} fill="currentColor" />
    <Eyes />
    <Smile />
  </Base>
);

/** Vision — the artist: beret + a wink. */
const VisionFace = () => (
  <Base>
    <g transform="rotate(-12 25 17)">
      <ellipse cx={25} cy={18} rx={12} ry={5.5} fill="currentColor" />
      <circle cx={25} cy={12} r={2.2} fill="currentColor" />
    </g>
    <circle cx={25} cy={34} r={3.4} fill={BG} />
    <path d="M35.5 33.5 Q39 36 42.5 33.5" stroke={BG} strokeWidth={2.5} strokeLinecap="round" fill="none" />
    <Smile />
  </Base>
);

/** Pepper — boxy warehouse buddy: wide head, side ears, big open grin. */
const PepperFace = () => (
  <Base head={{ x: 11, width: 42, rx: 9 }}>
    <rect x={4.5} y={30} width={6} height={9} rx={3} fill="currentColor" />
    <rect x={53.5} y={30} width={6} height={9} rx={3} fill="currentColor" />
    <Eyes />
    <path d="M25 40 Q32 49 39 40 Z" fill={BG} />
  </Base>
);

/** Edith — she literally is a pair of glasses. Big round lenses, tiny antenna. */
const EdithFace = () => (
  <Base>
    <rect x={30.75} y={15} width={2.5} height={7} rx={1.25} fill="currentColor" />
    <circle cx={32} cy={13.5} r={2.5} fill="currentColor" />
    <circle cx={24.5} cy={34} r={6.5} fill={BG} />
    <circle cx={39.5} cy={34} r={6.5} fill={BG} />
    <circle cx={24.5} cy={34} r={2.6} fill="currentColor" />
    <circle cx={39.5} cy={34} r={2.6} fill="currentColor" />
    <Smile d="M27 44.5 Q32 48 37 44.5" />
  </Base>
);

/** Estate — a little house: roof hat with chimney. */
const EstateFace = () => (
  <Base head={{ y: 22 }}>
    <rect x={41} y={11} width={4.5} height={8} fill="currentColor" />
    <path d="M32 7 L50 22 L14 22 Z" fill="currentColor" />
    <Eyes cy={35} />
    <Smile d="M26 42 Q32 47 38 42" />
  </Base>
);

/** Trinity — finance, dressed for it: bowtie. */
const TrinityFace = () => (
  <Base head={{ y: 19, height: 27 }}>
    <Eyes cy={32} />
    <Smile d="M26 39 Q32 44 38 39" />
    <path d="M21 49 L30 53 L21 57 Z" fill="currentColor" />
    <path d="M43 49 L34 53 L43 57 Z" fill="currentColor" />
    <circle cx={32} cy={53} r={2.6} fill="currentColor" />
  </Base>
);

/** Hermes — the messenger: winged helmet. */
const HermesFace = () => (
  <Base>
    <path d="M15 27 Q4 22 5.5 30 Q9 33.5 15 32.5 Z" fill="currentColor" />
    <path d="M15.5 34 Q7.5 34 9.5 39.5 Q12.5 40.5 15.5 38.5 Z" fill="currentColor" />
    <path d="M49 27 Q60 22 58.5 30 Q55 33.5 49 32.5 Z" fill="currentColor" />
    <path d="M48.5 34 Q56.5 34 54.5 39.5 Q51.5 40.5 48.5 38.5 Z" fill="currentColor" />
    <Eyes />
    <Smile />
  </Base>
);

/** Demo — the showman: party hat, singing mouth, confetti. */
const DemoFace = () => (
  <Base>
    <g transform="rotate(10 32 16)">
      <path d="M32 8 L25 22 L39 22 Z" fill="currentColor" />
      <circle cx={32} cy={7.5} r={2.6} fill="currentColor" />
    </g>
    <circle cx={13} cy={17} r={1.8} fill="currentColor" />
    <circle cx={52} cy={14} r={1.8} fill="currentColor" />
    <circle cx={55} cy={37} r={1.5} fill="currentColor" />
    <circle cx={9.5} cy={40} r={1.5} fill="currentColor" />
    <Eyes />
    <ellipse cx={32} cy={43} rx={3.4} ry={4} fill={BG} />
  </Base>
);

/** Stark — the builder: full visor with glowing eyes, side bolts. */
const StarkFace = () => (
  <Base>
    <rect x={9.5} y={30} width={5.5} height={7} rx={2.5} fill="currentColor" />
    <rect x={49} y={30} width={5.5} height={7} rx={2.5} fill="currentColor" />
    <rect x={18} y={28.5} width={28} height={10} rx={5} fill={BG} />
    <circle cx={25} cy={33.5} r={2.6} fill="currentColor" />
    <circle cx={39} cy={33.5} r={2.6} fill="currentColor" />
    <Smile d="M27 44 Q32 47.5 37 44" />
  </Base>
);

/** Veritas — the reviewer: monocle over one eye, nothing escapes it. */
const VeritasFace = () => (
  <Base>
    <circle cx={25} cy={34} r={3.4} fill={BG} />
    <circle cx={39} cy={34} r={6.5} fill={BG} />
    <circle cx={39} cy={34} r={2.75} fill="currentColor" />
    <Smile d="M26 44 Q32 47.5 38 44" />
  </Base>
);

const FACES: Record<string, React.FC> = {
  orchestrator: JarvisFace,
  kai: JarvisFace,
  'interior-designer': VisionFace,
  'product-business': PepperFace,
  marketing: EdithFace,
  'property-advisor': EstateFace,
  erp: TrinityFace,
  'social-media': HermesFace,
  demo: DemoFace,
  developer: StarkFace,
  'qa-reviewer': VeritasFace,
};

interface AgentAvatarProps {
  /** Agent id from the AgentHub roster; unknown/missing ids fall back to JARVIS. */
  agentId?: string;
  /** Size + color live here — pass the agent's `text-*-500` class and h/w. */
  className?: string;
}

export const AgentAvatar: React.FC<AgentAvatarProps> = ({ agentId, className }) => {
  const Face = (agentId && FACES[agentId]) || JarvisFace;
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={cn('shrink-0', className)}>
      <Face />
    </svg>
  );
};
