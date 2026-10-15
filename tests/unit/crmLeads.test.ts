import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { stripComments } from '../helpers/stripComments';
import { LEAD_SOURCES, LEAD_SOURCE_LABEL, LEAD_STATUSES, LEAD_STATUS_LABEL } from '@/modules/crm/leadVocabulary';

const read = (p: string) => stripComments(readFileSync(resolve(__dirname, '../..', p), 'utf8'));

describe('CRM leads are not contacts', () => {
  const files = ['src/services/crmLeadsService.ts', 'src/modules/crm/components/LeadsPanel.tsx'];

  it('no leads code writes crm_contacts directly — conversion is the RPC alone', () => {
    for (const f of files) expect(read(f), f).not.toMatch(/from\(\s*['"]crm_contacts['"]\s*\)/);
    expect(read('src/services/crmLeadsService.ts')).toMatch(/rpc\(\s*'convert_crm_lead'/);
  });

  it('every status and source has a label', () => {
    for (const s of LEAD_STATUSES) expect(LEAD_STATUS_LABEL[s]).toBeTruthy();
    for (const s of LEAD_SOURCES) expect(LEAD_SOURCE_LABEL[s]).toBeTruthy();
  });

  it('a converted lead cannot be edited back to open', () => {
    expect(read('src/services/crmLeadsService.ts')).toMatch(/\.is\(\s*'converted_at',\s*null\s*\)/);
  });
});
