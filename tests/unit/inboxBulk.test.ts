import { describe, it, expect } from 'vitest';
import { bulkSummary, runBulk } from '@/pages/Inbox/inboxBulk';
import { inboxUiSource } from '../helpers/inboxSource';

describe('inbox bulk actions', () => {
  it('runs every id and keeps the ones that failed, with why', async () => {
    const r = await runBulk(['a', 'b', 'c', 'd'], async (id) => { if (id === 'c') throw new Error('not yours'); });
    expect(r.done.sort()).toEqual(['a', 'b', 'd']);
    expect(r.failed).toEqual([{ id: 'c', error: 'not yours' }]);
  });

  it('never reports a partial run as done', () => {
    expect(bulkSummary('Archived', { done: ['a', 'b'], failed: [] })).toEqual({ title: 'Archived 2', failed: false });
    const partial = bulkSummary('Archived', { done: ['a'], failed: [{ id: 'b', error: 'Conversation not found' }] });
    expect(partial).toMatchObject({ title: 'Archived 1 of 2', failed: true });
    expect(partial.description).toContain('Conversation not found');
  });

  it('leaves the failed rows selected so they can be retried', () => {
    expect(inboxUiSource()).toContain('setSelectedIds(new Set(r.failed.map((f) => f.id)))');
  });

  it('adds a label without dropping the ones a thread already carries', () => {
    expect(inboxUiSource()).toMatch(/setThreadLabels\(id, \[\.\.\.current, labelId as string\]\)/);
  });
});
