/**
 * Filter definitions for the admin Knowledge Base document list.
 *
 * Every field is SERVER-side (`column` / `columns`), because the list is paginated with an
 * exact count — filtering in the browser would only narrow the current page. The same defs
 * therefore drive the query (`applyFiltersToQuery`), the match-count preview, and the
 * "delete all matching" bulk action, so those three can never disagree.
 */
import { Database, FileText, FolderTree } from 'lucide-react';
import { NONE_VALUE, type FilterGroupDef, type FilterOption } from '@/components/core/filters';

/** Minimal shape the category options need — a slice of KBCategory. */
export interface KbFilterCategory {
  id: string;
  name: string;
  icon?: string | null;
}

const STATUS_OPTIONS: FilterOption[] = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'archived', label: 'Archived' },
];

const VISIBILITY_OPTIONS: FilterOption[] = [
  { value: 'public', label: '🌍 Public' },
  { value: 'private', label: '🔒 Private' },
];

const EMBEDDING_OPTIONS: FilterOption[] = [
  { value: 'success', label: 'Success' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
];

export function buildKbDocFilters(categories: KbFilterCategory[]): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: FileText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search title or content…',
          // OR-ed ilike across both columns, sanitized by the shared serverFilters helper.
          columns: ['title', 'content'],
        },
        { key: 'status', type: 'multi', label: 'Status', options: STATUS_OPTIONS, column: 'status' },
        { key: 'visibility', type: 'multi', label: 'Visibility', options: VISIBILITY_OPTIONS, column: 'visibility' },
      ],
    },
    {
      key: 'classification', label: 'Categories', icon: FolderTree,
      fields: [
        {
          key: 'category_id', type: 'multi', label: 'Category',
          description: 'Uncategorized matches docs with no category assigned.',
          options: [
            { value: NONE_VALUE, label: 'Uncategorized' },
            ...categories.map((c) => ({ value: c.id, label: `${c.icon || '📁'} ${c.name}` })),
          ],
          column: 'category_id',
        },
      ],
    },
    {
      key: 'embeddings', label: 'Embedding', icon: Database,
      fields: [
        {
          key: 'embedding_status', type: 'multi', label: 'Embedding status',
          description: 'Docs without a successful embedding are invisible to agent retrieval.',
          options: EMBEDDING_OPTIONS,
          column: 'embedding_status',
        },
      ],
    },
  ];
}
