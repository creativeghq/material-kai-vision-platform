import { describe, expect, it } from 'vitest';
import { hasCreds, serviceClient } from './_harness';
import { toTitleCase } from '../../scripts/lib/labelCase.mjs';

const PLATFORM_OWNED_VOCABULARY: ReadonlyArray<readonly [table: string, column: string]> = [
  ['mydata_reference', 'description'],
  ['reference_vocabularies', 'label'],
  ['material_categories', 'display_name'],
  ['material_metadata_fields', 'display_name'],
  ['capability_registry', 'label'],
  ['crm_deal_stages', 'label'],
  ['interior_design_styles', 'label'],
  ['ppwr_material_categories', 'label_en'],
  ['tax_depreciation_categories', 'label_en'],
  ['ergani_leave_types', 'description_en'],
  ['intent_definitions', 'label'],
  ['modules', 'name'],
  ['flow_area_registry', 'title'],
  ['subscription_plans', 'display_name'],
  ['channel_writing_rules', 'label'],
];

const suite = hasCreds ? describe : describe.skip;

suite('a platform vocabulary label is Title Case', () => {
  it.each(PLATFORM_OWNED_VOCABULARY)('%s.%s', async (table, column) => {
    const { data, error } = await serviceClient().from(table).select(column);
    expect(error).toBeNull();
    const offenders = ((data ?? []) as unknown as Record<string, string | null>[])
      .map((row) => row[column])
      .filter((label): label is string => !!label && toTitleCase(label) !== label);
    expect(offenders).toEqual([]);
  });
});
