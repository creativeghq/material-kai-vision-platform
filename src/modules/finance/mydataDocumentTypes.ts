/**
 * What to call a myDATA document type when `mydata_reference` cannot be read. Import-free, so a
 * guard test can hold it complete against AADE's own enumeration without the Supabase client.
 */
export const MYDATA_TYPE_FAMILY: Record<string, string> = {
  '1': 'Sales invoice', '2': 'Service rendered invoice', '3': 'Proof of expenditure',
  '4': 'Reserved for future use', '5': 'Credit invoice',
  '6': 'Self-delivery / self-supply', '7': 'Contract — income', '8': 'Special record',
  '9': 'Transport document', '10': 'Quantitative receiving note', '11': 'Retail document',
  '12': 'Reserved for future use',
  '13': 'Retail / expenses', '14': 'Cross-border', '15': 'Contract — expense',
  '16': 'Rent — expense', '17': 'Your own books entry',
};

/** Name for a code, falling back to the code itself so an outage never renders a blank. */
export function mydataTypeName(code: string, labels: Record<string, string>): string {
  return labels[code] ?? MYDATA_TYPE_FAMILY[code.split('.')[0]] ?? `myDATA type ${code}`;
}

export function mydataTypeRank(code: string): number {
  const [major, minor] = code.split('.');
  return (Number(major) || 0) * 1000 + (Number(minor) || 0);
}
