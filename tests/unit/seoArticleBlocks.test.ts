import { describe, it, expect } from 'vitest';
import { articleBlocks } from '@/services/seo/articleBlocks';

const MD = [
  '# Πλακάκια terrazzo: οδηγός',
  '',
  'Εισαγωγή με [σύνδεσμο](https://www.tiles.example/el/proionta/plakakia/typou-terrazzo).',
  '',
  '> [!tldr]',
  '> Σύντομη απάντηση.',
  '> - Πρώτο σημείο',
  '',
  '> [!key]',
  '> - Βασικό σημείο',
  '',
  '## Τι είναι',
  '',
  'Παράγραφος ένα.',
  '',
  '- **Ματ**: κρύβει αποτυπώματα',
  '- Απλό σημείο',
  '',
  '> [!definition] Terrazzo',
  '> Σύνθετο υλικό.',
  '',
  '| Α | Β |',
  '|---|---|',
  '| 1 | 2 |',
  '',
  '![Δάπεδο](https://cdn.example/a.webp)',
  '',
  '## Συχνές ερωτήσεις',
  '',
  '### Είναι κατάλληλα για μπάνιο;',
  '',
  'Ναι, με R10.',
  '',
  '## Συμπέρασμα',
  '',
  'Δείτε τις [σειρές](https://tiles.example/el/proionta/plakakia/typou-terrazzo).',
].join('\n');

describe('articleBlocks — the export a data-driven site publishes as is', () => {
  const a = articleBlocks(MD, 'https://tiles.example');

  it('reads the heading, intro, summary and key points from the lead', () => {
    expect(a.heading).toBe('Πλακάκια terrazzo: οδηγός');
    expect(a.intro).toBe('Εισαγωγή με [σύνδεσμο](/el/proionta/plakakia/typou-terrazzo).');
    expect(a.summary).toEqual({ text: 'Σύντομη απάντηση.', points: ['Πρώτο σημείο'] });
    expect(a.keyPoints).toEqual(['Βασικό σημείο']);
  });

  it('turns a section into typed blocks, a bold lead into t, a callout into its kind', () => {
    expect(a.sections).toEqual([{
      h: 'Τι είναι',
      blocks: [
        { type: 'p', text: 'Παράγραφος ένα.' },
        { type: 'list', items: [{ t: 'Ματ', d: 'κρύβει αποτυπώματα' }, { d: 'Απλό σημείο' }] },
        { type: 'callout', kind: 'definition', label: 'Terrazzo', text: 'Σύνθετο υλικό.' },
        { type: 'table', head: ['Α', 'Β'], rows: [['1', '2']] },
        { type: 'image', alt: 'Δάπεδο', src: 'https://cdn.example/a.webp' },
      ],
    }]);
  });

  it('collects the FAQ and the closing, with our links as site paths', () => {
    expect(a.faqs).toEqual([{ q: 'Είναι κατάλληλα για μπάνιο;', a: 'Ναι, με R10.' }]);
    expect(a.closing?.links).toEqual([{ label: 'σειρές', to: '/el/proionta/plakakia/typou-terrazzo' }]);
  });
});
