/**
 * Filter definitions for the public Knowledge Base landing page.
 *
 * Client-side only: the page already holds every published+public doc in memory (it loads
 * them for the topic sections), and the visibility scoping is done by the fetch + RLS —
 * a filter here can only ever narrow that set, never widen it.
 */
import { BookOpen } from 'lucide-react';
import type { FilterGroupDef } from '@/components/core/filters';
import type { KBCategory } from '@/services/knowledgeBaseService';

export function buildKbPublicFilters(categories: KBCategory[]): FilterGroupDef[] {
  return [
    {
      key: 'topic', label: 'Topic', icon: BookOpen,
      fields: [
        {
          key: 'category', type: 'select', label: 'Category',
          description: 'Narrow the search to a single topic.',
          options: categories.map((c) => ({
            value: c.id,
            label: `${c.icon ?? ''} ${c.name}`.trim(),
            count: c.document_count ?? undefined,
          })),
          accessor: (doc) => doc.category_id ?? undefined,
        },
      ],
    },
  ];
}
