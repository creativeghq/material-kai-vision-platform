/**
 * Project cover resolution — the ladder every surface that shows a project picture walks.
 *
 *   1. `projects.cover_image_url`  — set by the owner (upload, a moodboard image, or an AI render)
 *   2. a moodboard image           — `project_cover_candidates()` (newest board, first image)
 *   3. a LIBRARY cover             — chosen from what the project is ABOUT: its name, description,
 *                                    category and rooms. "Kitchen — Kavouri" gets the kitchen.
 *
 * The library half is pure and lives here so the grid, the detail page and the cover picker all
 * agree on which picture a project gets before anyone has chosen one. The assets are static app
 * files under public/covers/projects/ (16:9 WebP), so a derived cover costs no request beyond the
 * image itself and never touches storage or credits. Guarded by tests/unit/projectCover.test.ts,
 * which also checks every concept below has its file on disk.
 *
 * Import-free on purpose (no React, no services): it has to be loadable by a plain unit test and
 * by the picker's "what would automatic pick" preview alike.
 */

export type ProjectCoverConcept =
  | 'kitchen' | 'bathroom' | 'bedroom' | 'living' | 'dining' | 'office' | 'outdoor' | 'hallway'
  | 'retail' | 'hospitality' | 'warehouse' | 'trip'
  | 'house' | 'apartment'
  | 'renovation' | 'real_estate'
  | 'default';

export interface ProjectCoverLibraryEntry {
  /** Short human label — "Kitchen", "Hotel & café". Shown in the picker and as alt text. */
  label: string;
  /** Public path of the static asset. */
  src: string;
  /** The scene, in words — reused as the starting prompt when the owner asks for an AI render. */
  subject: string;
}

const asset = (key: ProjectCoverConcept) => `/covers/projects/${key}.webp`;

export const PROJECT_COVER_LIBRARY: Record<ProjectCoverConcept, ProjectCoverLibraryEntry> = {
  kitchen: { label: 'Kitchen', src: asset('kitchen'), subject: 'a modern kitchen with an oak-fronted island, a honed stone worktop and a wall of tall matte cabinets' },
  bathroom: { label: 'Bathroom', src: asset('bathroom'), subject: 'a serene bathroom with a walk-in shower, large-format stone tiles, a floating oak vanity and a round mirror' },
  bedroom: { label: 'Bedroom', src: asset('bedroom'), subject: 'a calm master bedroom with a low upholstered bed, linen bedding, a plastered headboard wall and bedside pendant lights' },
  living: { label: 'Living room', src: asset('living'), subject: 'a bright living room with a deep linen sofa, a travertine coffee table, built-in oak shelving and a large window' },
  dining: { label: 'Dining room', src: asset('dining'), subject: 'a dining room with a long oak table, sculptural chairs, a linen pendant light and a low sideboard' },
  office: { label: 'Office', src: asset('office'), subject: 'a home office with a built-in oak desk, open shelving, a leather chair and a window view of greenery' },
  outdoor: { label: 'Outdoor', src: asset('outdoor'), subject: 'a garden terrace with a timber pergola, an outdoor sofa, large stone pavers, olive trees and a small pool' },
  hallway: { label: 'Hallway', src: asset('hallway'), subject: 'an entrance hall with a bench, wall hooks, a long runner rug, a slim console table and a mirror' },
  retail: { label: 'Retail', src: asset('retail'), subject: 'a boutique retail showroom interior with display plinths, oak shelving, spot lighting and a stone floor' },
  hospitality: { label: 'Hospitality', src: asset('hospitality'), subject: 'a boutique hotel lobby lounge with a reception desk, armchairs, warm brass lighting and a stone feature wall' },
  warehouse: { label: 'Warehouse', src: asset('warehouse'), subject: 'a clean, well-organised warehouse interior with tall pallet racking, a polished concrete floor and skylights' },
  trip: { label: 'Trip', src: asset('trip'), subject: 'a hotel room desk by a tall window overlooking a European city at golden hour, a leather weekender bag and a cup of coffee' },
  house: { label: 'House', src: asset('house'), subject: 'the exterior of a contemporary Mediterranean villa at dusk with warm interior light, stone walls, olive trees and a pool' },
  apartment: { label: 'Apartment', src: asset('apartment'), subject: 'an open-plan city apartment with a compact kitchen, a sofa, tall windows and a herringbone parquet floor' },
  renovation: { label: 'Renovation', src: asset('renovation'), subject: 'an interior renovation in progress: a bright empty room with freshly plastered walls, stacked tile samples, a ladder, a paint roller tray and drop sheets, sunlight through the window' },
  real_estate: { label: 'Real estate', src: asset('real_estate'), subject: 'the facade of a contemporary low-rise apartment building with balconies, planted terraces and a landscaped entrance in morning light' },
  default: { label: 'Materials', src: asset('default'), subject: 'a flat-lay of interior material samples on a linen surface: marble, oak, brass, terrazzo and fabric swatches beside a hand-drawn floor plan sketch' },
};

export const PROJECT_COVER_CONCEPTS = Object.keys(PROJECT_COVER_LIBRARY) as ProjectCoverConcept[];

/**
 * Lower-case, accents stripped, final sigma folded — so "Κουζίνα" and "κουζινας" both hit the
 * `κουζιν` stem, and "Café" hits `cafe`. NFD splits a tonos into base letter + combining mark,
 * which the range below removes.
 */
export function normalizeCoverText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ');
}

interface Rule { concept: ProjectCoverConcept; pattern: RegExp }

/**
 * Tiers, most specific first. A name that says a ROOM is about that room whatever else it says
 * ("Villa Kavouri — kitchen" is a kitchen job); a venue beats a dwelling; a dwelling beats the
 * kind of work. Within a tier the concept mentioned EARLIEST in the text wins, because people
 * lead with the subject.
 *
 * Greek stems are accent-free (see normalizeCoverText) and matched as SUBSTRINGS: JavaScript's
 * `\b` only knows ASCII word characters, so it cannot bound a Greek word. That is why each stem
 * is long enough to be unambiguous — `αυλ` (yard) is also inside Παύλος, `εισοδ` (entrance) is
 * also inside εισόδημα (income), `διαδρομ` (corridor) is also διαδρομή (a route). Keep them out.
 */
const RULE_TIERS: readonly (readonly Rule[])[] = [
  // Rooms
  [
    { concept: 'kitchen', pattern: /\bkitchen|κουζιν/ },
    { concept: 'bathroom', pattern: /\bbath|\bwc\b|\btoilet|\bshower|\ben-?suite|μπανι|λουτρ|τουαλετ/ },
    { concept: 'bedroom', pattern: /\bbed ?room|\bmaster suite|\bnursery|κρεβατοκαμαρ|υπνοδωματ/ },
    { concept: 'living', pattern: /\bliving|\blounge|\bsitting room|σαλον|καθιστικ/ },
    { concept: 'dining', pattern: /\bdining|τραπεζαρ/ },
    { concept: 'office', pattern: /\boffice|\bstudy\b|\bwork ?space|\bwork ?place|\bco-?working|\bhq\b|γραφει/ },
    { concept: 'outdoor', pattern: /\bgarden|\bterrace|\bpatio|\bbalcon|\bpool|\b(?:back)?yard|\boutdoor|\bpergola|\broof ?top|\bveranda|κηπ|βεραντ|μπαλκον|πισιν/ },
    { concept: 'hallway', pattern: /\bhallway|\bhall\b|\bentrance|\bcorridor|\bfoyer|\bentry\b|διαδρομο|εισοδο|χωλ/ },
  ],
  // Venues
  [
    // "boutique hotel" is a hotel, so the retail sense of boutique stands down before it.
    { concept: 'retail', pattern: /\bshop\b|\bstore\b|\bretail|\bshowroom|\bboutique(?! ?hotel)|\bpharmacy|καταστημ|μαγαζ|φαρμακει/ },
    { concept: 'hospitality', pattern: /\bhotel|\bcafe\b|\bcoffee|\brestaurant|\bbar\b|\bbistro|\btaverna|\bairbnb|\bguest ?house|\bhostel|ξενοδοχ|καφε|εστιατορ|ταβερν|ξενων/ },
    { concept: 'warehouse', pattern: /\bwarehouse|\bstorage|\blogistics|\bdepot|\bfactory|\bindustrial|αποθηκ|εργοστασ|βιομηχαν/ },
    { concept: 'trip', pattern: /\btrip\b|\btravel|ταξιδ/ },
  ],
  // Dwellings
  [
    { concept: 'house', pattern: /\bvilla|\bhouse|\bhome\b|\bresidence|\bcottage|\bmaisonette|\bbungalow|\bdetached|βιλ|σπιτ|μονοκατοικ|κατοικ|μεζονετ|εξοχικ/ },
    { concept: 'apartment', pattern: /\bapartment|\bflat\b|\bloft|\bpenthouse|\bstudio|\bcondo|διαμερισμ|ρετιρε|γκαρσονιερ/ },
  ],
  // The kind of work
  [
    { concept: 'renovation', pattern: /\brenovat|\brefurb|\bremodel|\bfit-?out|\bmakeover|\brefit|ανακαιν/ },
    { concept: 'real_estate', pattern: /\breal estate|\blisting|\bpropert(?:y|ies)|\bdevelopment|ακινητ|μεσιτ/ },
  ],
];

/** First tier with a hit; within it, the concept whose match sits earliest in the text. */
export function conceptFromText(text: string | null | undefined): ProjectCoverConcept | null {
  if (!text) return null;
  const hay = normalizeCoverText(text);
  if (!hay.trim()) return null;
  for (const tier of RULE_TIERS) {
    let best: { concept: ProjectCoverConcept; at: number } | null = null;
    for (const rule of tier) {
      const m = rule.pattern.exec(hay);
      if (m && (best === null || m.index < best.at)) best = { concept: rule.concept, at: m.index };
    }
    if (best) return best.concept;
  }
  return null;
}

/** `project_rooms.room_type` → concept. `other` says nothing. */
const ROOM_TYPE_CONCEPT: Record<string, ProjectCoverConcept> = {
  kitchen: 'kitchen',
  bathroom: 'bathroom',
  bedroom: 'bedroom',
  living: 'living',
  dining: 'dining',
  office: 'office',
  outdoor: 'outdoor',
  hallway: 'hallway',
};

/** The most common room type across a project's rooms, as a concept. */
export function conceptFromRoomTypes(roomTypes: ReadonlyArray<string | null | undefined> | null | undefined): ProjectCoverConcept | null {
  if (!roomTypes?.length) return null;
  const counts = new Map<ProjectCoverConcept, number>();
  for (const rt of roomTypes) {
    const c = rt ? ROOM_TYPE_CONCEPT[rt] : undefined;
    if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: ProjectCoverConcept | null = null;
  let bestN = 0;
  for (const [c, n] of counts) if (n > bestN) { best = c; bestN = n; }
  return best;
}

export interface CoverConceptInput {
  name: string;
  description?: string | null;
  categoryKey?: string | null;
  categoryLabel?: string | null;
  roomTypes?: ReadonlyArray<string | null | undefined> | null;
}

/**
 * What the project is about, in this order: the name (the owner's own words for it), the
 * description, the category, the rooms it has. `default` when none of those says anything.
 */
export function deriveProjectCoverConcept(input: CoverConceptInput): ProjectCoverConcept {
  return (
    conceptFromText(input.name)
    ?? conceptFromText(input.description)
    ?? conceptFromText([input.categoryKey?.replace(/_/g, ' '), input.categoryLabel].filter(Boolean).join(' '))
    ?? conceptFromRoomTypes(input.roomTypes)
    ?? 'default'
  );
}

export type ProjectCoverSource = 'custom' | 'moodboard' | 'library';

export interface ResolvedProjectCover {
  src: string;
  source: ProjectCoverSource;
  /** Set when the picture came from the library (source 'library') — also what an AI prompt starts from. */
  concept: ProjectCoverConcept;
  /** The moodboard the image came from, when source is 'moodboard'. */
  moodboardTitle?: string | null;
}

export interface ProjectCoverInput extends CoverConceptInput {
  cover_image_url?: string | null;
}

export interface MoodboardCoverCandidate {
  image_url: string;
  moodboard_id: string | null;
  moodboard_title: string | null;
}

/** The ladder. `moodboard` is the top candidate from `project_cover_candidates`, or null. */
export function resolveProjectCover(
  project: ProjectCoverInput,
  moodboard: MoodboardCoverCandidate | null | undefined,
): ResolvedProjectCover {
  const concept = deriveProjectCoverConcept(project);
  const custom = project.cover_image_url?.trim();
  if (custom) return { src: custom, source: 'custom', concept };
  if (moodboard?.image_url) {
    return { src: moodboard.image_url, source: 'moodboard', concept, moodboardTitle: moodboard.moodboard_title };
  }
  return { src: PROJECT_COVER_LIBRARY[concept].src, source: 'library', concept };
}

/** One sentence the picker shows under the current picture, so the owner knows WHY it is that one. */
export function describeCoverSource(cover: ResolvedProjectCover): string {
  switch (cover.source) {
    case 'custom': return 'Set on this project.';
    case 'moodboard': return cover.moodboardTitle ? `From the moodboard “${cover.moodboardTitle}”.` : 'From one of this project’s moodboards.';
    default: return `Suggested from the project (${PROJECT_COVER_LIBRARY[cover.concept].label.toLowerCase()}). Set one to replace it.`;
  }
}

/**
 * The prompt the "Generate" tab starts from: the project's own subject, in the same editorial
 * style as the library, so a generated cover sits beside library ones without looking foreign.
 */
export function suggestedCoverPrompt(project: CoverConceptInput): string {
  const concept = deriveProjectCoverConcept(project);
  const subject = PROJECT_COVER_LIBRARY[concept].subject;
  const name = project.name.trim();
  return `${subject}. Project: ${name}. Contemporary Mediterranean-Scandinavian style, natural materials, warm neutral palette, soft daylight, wide-angle at eye level, uncluttered. No people, no text.`;
}
