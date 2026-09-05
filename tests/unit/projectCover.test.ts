/**
 * Project covers — the ladder (own picture → moodboard image → library scene) and the
 * library itself.
 *
 * What would silently go wrong without this:
 *  - a concept added to the library with no file behind it renders a broken image on every
 *    card that derives it — a 404 is a valid <img>, nothing raises;
 *  - a Greek stem that is also inside an unrelated word (`αυλ` in Παύλος) gives a customer's
 *    project a garden for no reason the owner can see;
 *  - `/covers` missing from the SPA catch-all serves index.html (HTTP 200) for every asset, so
 *    a "does it 200?" check passes while every cover is a blank box;
 *  - a surface that stops walking the ladder shows a different picture from the others.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  PROJECT_COVER_CONCEPTS,
  PROJECT_COVER_LIBRARY,
  conceptFromText,
  deriveProjectCoverConcept,
  describeCoverSource,
  normalizeCoverText,
  resolveProjectCover,
  suggestedCoverPrompt,
} from '../../src/modules/projects/utils/projectCover';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const LIBRARY_DIR = join(ROOT, 'public', 'covers', 'projects');

describe('the cover library', () => {
  it('every concept has its picture on disk, at the path the entry names', () => {
    for (const key of PROJECT_COVER_CONCEPTS) {
      expect(PROJECT_COVER_LIBRARY[key].src).toBe(`/covers/projects/${key}.webp`);
      expect(existsSync(join(LIBRARY_DIR, `${key}.webp`)), `${key}.webp is missing from public/covers/projects`).toBe(true);
    }
  });

  it('every picture on disk is a concept — no orphan assets shipping for nothing', () => {
    const files = readdirSync(LIBRARY_DIR).filter((f) => f.endsWith('.webp')).map((f) => f.replace(/\.webp$/, ''));
    expect([...files].sort()).toEqual([...PROJECT_COVER_CONCEPTS].sort());
  });

  it('each asset is grid-sized, not a hero image', () => {
    for (const key of PROJECT_COVER_CONCEPTS) {
      const bytes = statSync(join(LIBRARY_DIR, `${key}.webp`)).size;
      expect(bytes, `${key}.webp is ${Math.round(bytes / 1024)} KB`).toBeLessThan(220 * 1024);
      expect(bytes, `${key}.webp is suspiciously small`).toBeGreaterThan(8 * 1024);
    }
  });

  it('is served as a static file: the SPA catch-all leaves /covers alone', () => {
    const vercel = JSON.parse(read('vercel.json')) as { rewrites: Array<{ source: string; destination: string }> };
    const spa = vercel.rewrites.find((r) => r.destination === '/index.html');
    expect(spa).toBeDefined();
    const re = new RegExp('^' + spa!.source + '$');
    expect(re.test('/covers/projects/kitchen.webp'), '/covers is being rewritten to index.html').toBe(false);
    // …and a real route is still a route.
    expect(re.test('/projects')).toBe(true);
  });

  it('every entry has a label and a subject the Generate tab can start from', () => {
    for (const key of PROJECT_COVER_CONCEPTS) {
      const e = PROJECT_COVER_LIBRARY[key];
      expect(e.label.trim().length).toBeGreaterThan(0);
      expect(e.subject.trim().length).toBeGreaterThan(20);
    }
  });
});

describe('what a project is about', () => {
  it('folds accents, case and final sigma so Greek stems match', () => {
    expect(normalizeCoverText('Κουζίνας')).toBe('κουζινασ');
    expect(normalizeCoverText('CAFÉ Αθήνα')).toBe('cafe αθηνα');
  });

  it.each([
    ['Kitchen refit, Kavouri', 'kitchen'],
    ['Ανακαίνιση κουζίνας Παπαδόπουλος', 'kitchen'],
    ['Master bathroom', 'bathroom'],
    ['Μπάνιο 2ος όροφος', 'bathroom'],
    ['Guest bedroom + nursery', 'bedroom'],
    ['Σαλόνι & τραπεζαρία', 'living'],
    ['Dining room, Glyfada', 'dining'],
    ['Head office fit-out', 'office'],
    ['Γραφεία εταιρείας', 'office'],
    ['Garden & pool house', 'outdoor'],
    ['Roof terrace', 'outdoor'],
    ['Entrance hall', 'hallway'],
    ['Boutique hotel, Mykonos', 'hospitality'],
    ['Café Kolonaki', 'hospitality'],
    ['Retail store Glyfada', 'retail'],
    ['Κατάστημα Ερμού', 'retail'],
    ['Warehouse racking', 'warehouse'],
    ['Αποθήκη Ασπρόπυργος', 'warehouse'],
    ['Business trip Milan', 'trip'],
    ['Ταξίδι Salone del Mobile', 'trip'],
    ['Villa Kavouri', 'house'],
    ['Μονοκατοικία Βούλα', 'house'],
    ['Penthouse Vouliagmeni', 'apartment'],
    ['Διαμέρισμα Κηφισιά', 'apartment'],
    ['Full renovation', 'renovation'],
    ['Ανακαίνιση διαμερίσματος', 'apartment'],
    ['Property listing pack', 'real_estate'],
  ] as const)('%s → %s', (name, concept) => {
    expect(conceptFromText(name)).toBe(concept);
  });

  it('a room word beats a dwelling or a process word wherever it sits in the name', () => {
    expect(conceptFromText('Villa Kavouri — kitchen')).toBe('kitchen');
    expect(conceptFromText('Renovation of the master bedroom')).toBe('bedroom');
    expect(conceptFromText('Penthouse living room')).toBe('living');
  });

  it('within a tier, the subject mentioned first wins', () => {
    expect(conceptFromText('Kitchen and bathroom')).toBe('kitchen');
    expect(conceptFromText('Bathroom and kitchen')).toBe('bathroom');
  });

  it('does not see a garden in Παύλος, income as an entrance, or a route as a corridor', () => {
    expect(conceptFromText('Έργο Παύλος Αντωνίου')).toBeNull();
    expect(conceptFromText('Εισόδημα 2026')).toBeNull();
    expect(conceptFromText('Διαδρομή Αθήνα')).toBeNull();
    expect(conceptFromText('Liverpool Street')).toBeNull();
    expect(conceptFromText('Project 42')).toBeNull();
  });

  it('falls back name → description → category → rooms → default', () => {
    expect(deriveProjectCoverConcept({ name: 'Project 42', description: 'New kitchen for the family' })).toBe('kitchen');
    expect(deriveProjectCoverConcept({ name: 'Project 42', categoryKey: 'renovation', categoryLabel: 'Renovation' })).toBe('renovation');
    expect(deriveProjectCoverConcept({ name: 'Project 42', categoryKey: 'real_estate', categoryLabel: 'Real Estate' })).toBe('real_estate');
    expect(deriveProjectCoverConcept({ name: 'Project 42', categoryKey: 'trip', categoryLabel: 'Trip' })).toBe('trip');
    expect(deriveProjectCoverConcept({ name: 'Project 42', categoryKey: 'warehouse', categoryLabel: 'Warehouse' })).toBe('warehouse');
    expect(deriveProjectCoverConcept({ name: 'Project 42', roomTypes: ['bedroom', 'kitchen', 'bedroom', 'other', null] })).toBe('bedroom');
    expect(deriveProjectCoverConcept({ name: 'Project 42', roomTypes: ['other'] })).toBe('default');
    expect(deriveProjectCoverConcept({ name: 'Project 42' })).toBe('default');
  });

  it('the name outranks the category: a kitchen job filed under Renovation is still a kitchen', () => {
    expect(deriveProjectCoverConcept({ name: 'Kitchen, Kifisia', categoryKey: 'renovation', categoryLabel: 'Renovation' })).toBe('kitchen');
  });
});

describe('the ladder', () => {
  const project = { name: 'Kitchen, Kifisia', cover_image_url: null as string | null };
  const board = { image_url: 'https://x.supabase.co/storage/v1/object/public/pdf-tiles/a.png', moodboard_id: 'm1', moodboard_title: 'Kifisia palette' };

  it('an explicit cover beats a moodboard image beats the library', () => {
    expect(resolveProjectCover({ ...project, cover_image_url: 'https://cdn/own.jpg' }, board)).toMatchObject({ source: 'custom', src: 'https://cdn/own.jpg' });
    expect(resolveProjectCover(project, board)).toMatchObject({ source: 'moodboard', src: board.image_url, moodboardTitle: 'Kifisia palette' });
    expect(resolveProjectCover(project, null)).toMatchObject({ source: 'library', src: '/covers/projects/kitchen.webp', concept: 'kitchen' });
  });

  it('a blank explicit cover is no cover', () => {
    expect(resolveProjectCover({ ...project, cover_image_url: '   ' }, null).source).toBe('library');
  });

  it('says where the picture came from, and names the moodboard', () => {
    expect(describeCoverSource(resolveProjectCover(project, board))).toContain('Kifisia palette');
    expect(describeCoverSource(resolveProjectCover(project, null))).toMatch(/kitchen/);
    expect(describeCoverSource(resolveProjectCover({ ...project, cover_image_url: 'https://cdn/own.jpg' }, null))).toMatch(/Set on this project/);
  });

  it('the suggested prompt starts from the derived scene and names the project', () => {
    const prompt = suggestedCoverPrompt({ name: 'Kitchen, Kifisia' });
    expect(prompt).toContain(PROJECT_COVER_LIBRARY.kitchen.subject);
    expect(prompt).toContain('Kitchen, Kifisia');
  });
});

describe('the surfaces walk the same ladder', () => {
  it('the grid, the overview panel and the detail header all resolve through resolveProjectCover', () => {
    expect(read('src/modules/projects/pages/ProjectsListPage.tsx')).toMatch(/resolveProjectCover\(/);
    expect(read('src/modules/projects/components/ProjectCoverPanel.tsx')).toMatch(/resolveProjectCover\(/);
    const detail = read('src/modules/projects/pages/ProjectDetailPage.tsx');
    expect(detail).toMatch(/resolveProjectCover\(/);
    expect(detail).toMatch(/thumbnailUrl=/);
  });

  it('the list page asks for moodboard candidates ONCE for the page, never per card', () => {
    const list = read('src/modules/projects/pages/ProjectsListPage.tsx');
    expect((list.match(/coverCandidates\(/g) ?? []).length).toBe(1);
    // The card is GIVEN its cover; it never reaches for the service itself (a type import is fine).
    expect(read('src/modules/projects/components/ProjectCard.tsx')).not.toMatch(/coverCandidates|projectsService\./);
  });

  it('the list rows carry room types, so the library rung can read them', () => {
    const svc = read('src/modules/projects/services/projectsService.ts');
    expect((svc.match(/rooms:project_rooms\(room_type\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('the picker saves on confirm, and can hand the project back to automatic', () => {
    const dialog = read('src/modules/projects/components/ProjectCoverDialog.tsx');
    expect(dialog).toMatch(/setCoverImage\(project\.id, url\)/);
    expect(dialog).toMatch(/setCoverImage\(project\.id, null\)/);
  });

  it('the status vocabulary has one copy', () => {
    for (const f of [
      'src/modules/projects/pages/ProjectsListPage.tsx',
      'src/modules/projects/pages/ProjectDetailPage.tsx',
      'src/modules/projects/components/ProjectCard.tsx',
    ]) {
      expect(read(f), `${f} re-declares the status labels`).not.toMatch(/const STATUS_LABELS|const STATUS_TONES/);
    }
  });
});
