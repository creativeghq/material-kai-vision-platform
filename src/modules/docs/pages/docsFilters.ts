/**
 * Filter definitions for the Docs list.
 *
 * The list only had a title/tag search box, so a workspace with a few dozen docs had no way to
 * separate drafts from published, or to find everything under one tag. Author is both a picker
 * (names resolved from `created_by` by `listDocs`) and a "just mine" shortcut, since finding
 * your own drafts is the common case and doesn't need the reader to know their own name.
 */
import { BookText, CalendarDays, Tags, User } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import type { WorkspaceDocWithAuthor as WorkspaceDoc } from '../services/docsService';

export function buildDocsFilters(rows: WorkspaceDoc[], myUserId: string | undefined): FilterGroupDef[] {
  return [
    {
      key: 'general', label: 'General', icon: BookText,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search docs…',
          accessor: (d: WorkspaceDoc) => [d.title, ...(d.tags ?? []), d.category, d.content_markdown],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: [
            { value: 'published', label: 'Published', count: rows.filter((d) => d.status === 'published').length },
            { value: 'draft', label: 'Draft', count: rows.filter((d) => d.status === 'draft').length },
          ],
          accessor: (d: WorkspaceDoc) => d.status,
        },
      ],
    },
    {
      key: 'people', label: 'Author', icon: User,
      fields: [
        {
          key: 'author', type: 'multi', label: 'Written by',
          options: [
            { value: NONE_VALUE, label: 'Unknown author' },
            ...optionsFromRows(rows, (d) => d.author_name ?? undefined),
          ],
          accessor: (d: WorkspaceDoc) => d.author_name ?? undefined,
        },
        ...(myUserId ? [{
          key: 'mine', type: 'bool' as const, label: 'Just mine',
          trueLabel: 'Written by me', falseLabel: 'Written by others',
          accessor: (d: WorkspaceDoc) => d.created_by === myUserId,
        }] : []),
      ],
    },
    {
      key: 'classification', label: 'Classification', icon: Tags,
      fields: [
        {
          key: 'category', type: 'multi', label: 'Category',
          options: [{ value: NONE_VALUE, label: 'Uncategorized' }, ...optionsFromRows(rows, (d) => d.category ?? undefined)],
          accessor: (d: WorkspaceDoc) => d.category ?? undefined,
        },
        {
          key: 'tags', type: 'multi', label: 'Tags',
          description: 'A doc matches if it carries any of the selected tags.',
          options: optionsFromRows(rows, (d) => d.tags ?? []),
          accessor: (d: WorkspaceDoc) => d.tags ?? [],
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'updated_at', type: 'dateRange', label: 'Last updated', accessor: (d: WorkspaceDoc) => d.updated_at },
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (d: WorkspaceDoc) => d.created_at },
      ],
    },
  ];
}
