import { describe, expect, it } from 'vitest';
import { strippedSource } from '../helpers/sourceIndex';

const SEARCH_TOOLS = 'supabase/functions/_shared/tools/search-tools.ts';

describe('a catalogue product named in the query leads material_search', () => {
  const src = strippedSource(SEARCH_TOOLS);

  it('pinNamedProducts asks the SQL name match, not a TypeScript copy of it', () => {
    const fn = src.slice(src.indexOf('async function pinNamedProducts'));
    expect(fn.slice(0, 600)).toContain("rpc('catalog_series_in_query'");
  });

  it('a named product replaces the vector neighbours instead of leading them', () => {
    const fn = src.slice(src.indexOf('async function pinNamedProducts'));
    expect(fn.slice(0, 1600)).toMatch(/data\.results = pinned;/);
  });

  it('material_search pins AFTER the rerank, so the rerank cannot demote the named product', () => {
    const tool = src.slice(src.indexOf('export const createSearchTool'), src.indexOf('export const createVisualSearchTool'));
    expect(tool).toMatch(/pinNamedProducts\(\s*await rerankMivaaPayload\(/);
  });
});
