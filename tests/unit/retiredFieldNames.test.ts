/** #494: a retired field name is a DB alias of its successor (null = none), never a key code uses. */
import { describe, expect, it, vi } from 'vitest';
import { sourceIndex } from '../helpers/sourceIndex';
import { RETIRED_FIELD_NAMES } from '@/config/retiredFieldNames';
import {
  identityFieldsForCategory, roleForField, type FieldRegistrySnapshot, type RegistryField,
} from '@/services/fieldRegistryService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const field = (name: string, categories: string[], role: RegistryField['role'],
  roleByCategory: RegistryField['roleByCategory'] = null): RegistryField => ({
  name, label: name, section: 'dimensions', categories, sortOrder: 1, sensitivity: 'public',
  role, roleByCategory, labelByCategory: null, descriptionByCategory: null, description: null,
});

describe('a variant axis is decided per category', () => {
  const width = field('width_mm', ['tiles', 'hvac'], 'identity', { hvac: 'descriptive' });
  const snapshot: FieldRegistrySnapshot = {
    fields: [width], byName: new Map([['width_mm', width]]), internalPattern: /^$/,
  };

  it('role_by_category overrides role in that category only', () => {
    expect(roleForField(width, 'tiles')).toBe('identity');
    expect(roleForField(width, 'hvac')).toBe('descriptive');
  });

  it('identity fields follow the per-category role', () => {
    expect(identityFieldsForCategory(snapshot, 'tiles').map((f) => f.key)).toEqual(['width_mm']);
    expect(identityFieldsForCategory(snapshot, 'hvac')).toEqual([]);
  });
});

/** Names that are also an ordinary word or another table's column. Shrink-only, reason each. */
const NOT_SCANNED: Record<string, string> = {
  width: 'generic word; nested size entries are {width, length, unit}',
  length: 'generic word (array length)',
  thickness: 'generic word in UI copy',
  colors: 'generic word (theme colours)',
  applications: 'generic word',
  environments: 'deploy environments',
  maintenance: 'generic word',
  species: 'generic word',
  construction: 'construction module',
  socket: 'websocket',
  patterns: 'generic word (regex patterns)',
  factory: 'factory functions, tool factories',
  manufacturer: 'manufacturer analytics, search result field',
  rectified: 'generic word',
  material_type: 'vision_analysis schema field and the search query parser',
  product_code: 'supplier-file header synonym and warehouse_pending_items column',
  image_type: 'document_images.image_type',
  stock_status: 'warehouse stock vocabulary',
  price_range: 'search filter',
  width_cm: 'visualizer surface and store overlay columns',
  height_cm: 'visualizer surface and store overlay columns',
  depth_cm: 'visualizer surface columns',
  recycled_content_percent: 'product_packaging_components column (EPR)',
  surface_pattern: 'vision_analysis schema field',
  sku_codes: 'the normalizer variant map, still produced',
  product_codes: 'the normalizer variant map, still produced',
  sustainability: 'generic word',
  weight_unit: 'unit vocabulary',
  weight_value: 'generic',
};

const INDEX = sourceIndex({
  filter: (p) => p !== 'src/integrations/supabase/types.ts' && p !== 'src/config/retiredFieldNames.ts',
});

describe('retired registry field names', () => {
  it('every exemption names a retired field', () => {
    for (const name of Object.keys(NOT_SCANNED)) expect(RETIRED_FIELD_NAMES).toHaveProperty(name);
  });

  it('no code names a retired field; use its successor', () => {
    const names = Object.keys(RETIRED_FIELD_NAMES).filter((n) => !(n in NOT_SCANNED));
    const re = new RegExp(`\\b(${names.join('|')})\\b`, 'g');
    const offenders: string[] = [];
    for (const [file, src] of INDEX.stripped()) {
      const hits = new Set(src.match(re) ?? []);
      for (const h of hits) offenders.push(`${INDEX.paths[INDEX.files.indexOf(file)]}: ${h} -> ${RETIRED_FIELD_NAMES[h] ?? '(retired)'}`);
    }
    expect(offenders).toEqual([]);
  });
});
