/**
 * Filter definitions for the CRM Categories panel. Fully client-side — the panel already
 * holds every category row, and the list is small enough that server pushdown would only
 * add a round trip.
 */
import { Tags } from 'lucide-react';
import type { FilterGroupDef } from '@/components/core/filters';
import type { CrmCategoryKind } from '@/services/crmCategoriesService';

const KIND_OPTIONS: { value: CrmCategoryKind; label: string }[] = [
  { value: 'manual', label: 'Custom' },
  { value: 'industry', label: 'Industry' },
  { value: 'lead_status', label: 'Lead status' },
  { value: 'lead_source', label: 'Lead source' },
  { value: 'professional_type', label: 'Professional type' },
  { value: 'role', label: 'Role' },
];

export const CRM_CATEGORY_FILTERS: FilterGroupDef[] = [
  {
    key: 'general', label: 'Categories', icon: Tags,
    fields: [
      {
        key: 'q', type: 'text', label: 'Search',
        placeholder: 'Search categories',
        accessor: (c) => [c.name, c.slug],
      },
      {
        key: 'kind', type: 'multi', label: 'Type',
        options: KIND_OPTIONS,
        accessor: (c) => c.kind,
      },
      {
        key: 'is_active', type: 'bool', label: 'Active',
        trueLabel: 'Active only', falseLabel: 'Inactive only',
        accessor: (c) => c.is_active,
      },
    ],
  },
];
