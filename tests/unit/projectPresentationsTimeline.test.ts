/**
 * Projects → Presentations (Sheets + Client Views in one section) and the one team Timeline (#549).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';
import { EVENT_CATEGORIES } from '../../src/modules/projects/components/tabs/timelineFilters';
import { openSignedPdf } from '../../src/modules/projects/components/tabs/openSignedPdf';

const ROOT = join(__dirname, '..', '..');
const TABS = 'src/modules/projects/components/tabs';
const src = (p: string) => strippedSource(join(ROOT, p));

describe('Presentations section', () => {
  const presentations = src(`${TABS}/PresentationsTab.tsx`);

  it('offers client views only to the team, and never renders them for a collaborator', () => {
    expect(presentations).toMatch(/isOwner \? view : 'sheets'/);
    expect(presentations).toMatch(/\{isOwner && \(\s*<HubSegmented/);
  });

  it('a finished sheet opens its PDF through a freshly signed URL', () => {
    const sheets = src(`${TABS}/SheetsTab.tsx`);
    expect(sheets).toContain('openSignedPdf(() => moodboardSheetsService.refreshPdfUrl(s.id))');
    expect(sheets, 'a row with a PDF must have a click target').toMatch(/hasPdf \? \(\) => onOpenPdf\(s\)/);
    expect(sheets, 'never a persisted URL on a private bucket').not.toMatch(/getPublicUrl/);
  });

  it('the empty Sheets state offers both ways a sheet is made', () => {
    const sheets = src(`${TABS}/SheetsTab.tsx`);
    expect(sheets).toContain('setWizardOpen(true)');
    expect(sheets).toContain("projectSectionPath(projectId, 'moodboards')");
  });

  it('ClientViewTab has no owner gate of its own and reloads when the workspace changes', () => {
    const cv = src(`${TABS}/ClientViewTab.tsx`);
    expect(cv).not.toMatch(/isOwner/);
    expect(cv).toMatch(/\}, \[projectId, activeWorkspaceId, toast\]\);/);
    expect(cv).toContain('openSignedPdf(() => clientViewsService.refreshPdfUrl(view.id))');
  });
});

describe('openSignedPdf', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('opens the tab inside the click and points it at the minted URL', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal('window', { open });
    const ok = await openSignedPdf(async () => 'https://signed.example/x.pdf');
    expect(ok).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
    expect(tab.location.href).toBe('https://signed.example/x.pdf');
    expect(tab.opener).toBeNull();
  });

  it('closes the blank tab when there is nothing to open', async () => {
    const tab = { opener: {}, location: { href: '' }, close: vi.fn() };
    vi.stubGlobal('window', { open: vi.fn(() => tab) });
    expect(await openSignedPdf(async () => null)).toBe(false);
    expect(tab.close).toHaveBeenCalled();
  });
});

describe('one team timeline', () => {
  const timeline = src(`${TABS}/TimelineTab.tsx`);
  const DERIVED = [
    'request.raised', 'request.closed', 'request.client_message',
    'inspection.created', 'inspection.signed_off', 'snag.raised', 'snag.resolved',
  ];

  it('reads the merged SQL feed, not project_events alone', () => {
    expect(timeline).toContain('listProjectActivity(projectId');
    expect(timeline).not.toContain('projectsService.listEvents');
    expect(src('src/modules/projects/services/projectActivityService.ts')).toContain("rpc('get_project_activity'");
  });

  it('every derived event type has a category and a sentence', () => {
    const categorised = new Set(EVENT_CATEGORIES.flatMap((c) => c.events));
    for (const t of DERIVED) {
      expect(categorised.has(t), `${t} has no filter category`).toBe(true);
      expect(timeline, `${t} has no describe() case`).toContain(`case '${t}':`);
    }
    expect(EVENT_CATEGORIES.map((c) => c.label)).toEqual(expect.arrayContaining(['Requests', 'Site']));
  });

  it('never prints the raw event_type string', () => {
    expect(timeline).not.toMatch(/\{e\.event_type\}/);
    expect(timeline).not.toMatch(/default: return e\.event_type;/);
  });
});
