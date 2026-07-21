/**
 * Filter definitions for the four Materials Data tabs.
 *
 * Three of the four (products / images / chunks) used to carry a byte-identical
 * "search box + source Select + inherited jobId" block, and the Embeddings tab carried a
 * source + model Select that was never applied to its query at all. One builder now owns the
 * shared dimensions and each tab adds only the columns that actually exist on its table.
 *
 * Every field here is SERVER-side (`column`), so `applyFiltersToQuery` keeps the pushdown and
 * the exact `count: 'exact'` that pagination depends on. The two exceptions are marked below:
 * fields with neither `column` nor `accessor`, which the tab applies by hand because the
 * predicate (`is null` on a vector column) has no generic mapping.
 */
import { CalendarDays, Database, FileText } from 'lucide-react';
import { NONE_VALUE, type FilterField, type FilterGroupDef, type FilterOption } from '@/components/core/filters';

export type MaterialsTabKind = 'products' | 'images' | 'chunks' | 'embeddings';

/** `source_type` vocabulary written by the three ingest paths. */
const SOURCE_TYPE_OPTIONS: FilterOption[] = [
  { value: 'pdf_processing', label: 'PDF processing' },
  { value: 'xml_import', label: 'XML import' },
  { value: 'web_scraping', label: 'Web scraping' },
  { value: NONE_VALUE, label: 'Unknown' },
];

/** Free-text columns worth an ilike per table. */
const SEARCH_COLUMNS: Record<MaterialsTabKind, string[]> = {
  products: ['name', 'description', 'sku', 'external_sku'],
  images: ['caption', 'contextual_name', 'product_name', 'ocr_text'],
  chunks: ['content'],
  embeddings: ['content'],
};

const SEARCH_PLACEHOLDER: Record<MaterialsTabKind, string> = {
  products: 'Search name / SKU…',
  images: 'Search caption / OCR text…',
  chunks: 'Search chunk content…',
  embeddings: 'Search source text…',
};

/**
 * The job filter is seeded from `?jobId=` on the page above. Declaring it as a single-option
 * select is what turns the deep link into a removable chip instead of an invisible predicate.
 */
function jobFields(jobIdFilter?: string): FilterField[] {
  const id = jobIdFilter?.trim();
  if (!id) return [];
  return [{
    key: 'source_job_id',
    type: 'select',
    label: 'Import job',
    description: 'Rows produced by one pipeline run.',
    column: 'source_job_id',
    options: [{ value: id, label: `Job ${id.slice(0, 8)}…` }],
  }];
}

function attributeFields(kind: MaterialsTabKind): FilterField[] {
  switch (kind) {
    case 'products':
      return [
        {
          // Values come from the products_item_type_check constraint. `status` is
          // deliberately absent — it carries no CHECK, so there is no vocabulary to offer.
          key: 'item_type',
          type: 'multi',
          label: 'Item type',
          column: 'item_type',
          options: [
            { value: 'good', label: 'Good' },
            { value: 'service', label: 'Service' },
          ],
        },
        // No `column`: presence is "text_embedding_1024 IS NOT NULL", and a halfvec column
        // can't be compared with the generic bool mapping (`eq(col, true)`). ProductsTab
        // applies this one by hand.
        {
          key: 'has_embedding',
          type: 'bool',
          label: 'Text embedding',
          description: 'Products with no vector are invisible to product-level search.',
          trueLabel: 'Embedded',
          falseLabel: 'Missing',
        },
      ];

    case 'images':
      return [
        { key: 'has_slig_embedding', type: 'bool', label: 'Visual embedding', description: 'SigLIP2 768D vector in vecs.image_slig_embeddings.', column: 'has_slig_embedding', trueLabel: 'Present', falseLabel: 'Missing' },
        { key: 'has_understanding_embedding', type: 'bool', label: 'Understanding embedding', description: 'Voyage 1024D vector derived from vision_analysis.', column: 'has_understanding_embedding', trueLabel: 'Present', falseLabel: 'Missing' },
        { key: 'vision_analysis_failed', type: 'bool', label: 'Vision analysis', column: 'vision_analysis_failed', trueLabel: 'Failed', falseLabel: 'Succeeded' },
        {
          key: 'extraction_layer',
          type: 'multi',
          label: 'Extraction layer',
          description: 'How the image was pulled off the page.',
          column: 'extraction_layer',
          // Values come from the document_images_extraction_layer_check constraint.
          options: [
            { value: 'embedded', label: 'Embedded' },
            { value: 'region_crop', label: 'Region crop' },
            { value: 'full_render', label: 'Full page render' },
            { value: 'vision_guided', label: 'Vision guided' },
          ],
        },
        { key: 'page_number', type: 'range', label: 'Page', column: 'page_number', min: 1, max: 500, step: 1 },
      ];

    case 'chunks':
      return [
        {
          key: 'chunk_type_status',
          type: 'multi',
          label: 'Classification status',
          description: 'Distinguishes an "unclassified" verdict from a classifier crash.',
          column: 'chunk_type_status',
          options: [
            { value: 'pending', label: 'Pending' },
            { value: 'classified', label: 'Classified' },
            { value: 'failed', label: 'Failed' },
          ],
        },
        { key: 'chunk_type', type: 'text', label: 'Chunk type', description: 'Substring match on the classifier verdict.', column: 'chunk_type' },
        { key: 'has_text_embedding', type: 'bool', label: 'Text embedding', column: 'has_text_embedding', trueLabel: 'Present', falseLabel: 'Missing' },
        { key: 'quality_score', type: 'range', label: 'Quality score', column: 'quality_score', min: 0, max: 1, step: 0.05 },
      ];

    case 'embeddings':
      return [
        { key: 'embedding_model', type: 'text', label: 'Model', description: 'Substring match on the model that produced the vector.', column: 'embedding_model' },
        { key: 'embedding_dimension', type: 'range', label: 'Dimensions', column: 'embedding_dimension', min: 0, max: 2048, step: 128 },
        { key: 'chunk_type', type: 'text', label: 'Chunk type', column: 'chunk_type' },
      ];
  }
}

const DATE_COLUMN_LABEL: Record<MaterialsTabKind, string> = {
  products: 'Created',
  images: 'Extracted',
  chunks: 'Created',
  embeddings: 'Generated',
};

export function buildMaterialsDataFilters(
  kind: MaterialsTabKind,
  ctx: { jobIdFilter?: string } = {},
): FilterGroupDef[] {
  return [
    {
      key: 'general',
      label: 'General',
      icon: FileText,
      fields: [
        {
          key: 'q',
          type: 'text',
          label: 'Search',
          placeholder: SEARCH_PLACEHOLDER[kind],
          columns: SEARCH_COLUMNS[kind],
        },
        {
          key: 'source_type',
          type: 'multi',
          label: 'Source',
          description: 'Ingest path that produced the row.',
          column: 'source_type',
          options: SOURCE_TYPE_OPTIONS,
        },
        ...jobFields(ctx.jobIdFilter),
      ],
    },
    {
      key: 'attributes',
      label: kind === 'embeddings' ? 'Vector' : 'Attributes',
      icon: Database,
      fields: attributeFields(kind),
    },
    {
      key: 'dates',
      label: 'Dates',
      icon: CalendarDays,
      fields: [{ key: 'created_at', type: 'dateRange', label: DATE_COLUMN_LABEL[kind], column: 'created_at' }],
    },
  ];
}
