/** Mirrors the `crm_companies_supplier_type_check` constraint; import-free so it can be mirrored if Deno needs it. */
export const SUPPLIER_TYPES = [
  { value: 'manufacturer', label: 'Manufacturer', hint: 'Owns the production of what it sells' },
  { value: 'own_brand_distributor', label: 'Own-brand distributor', hint: 'Sells its own brand, made by others' },
  { value: 'agent', label: 'Agent', hint: 'Represents factories on commission' },
  { value: 'importer_distributor', label: 'Importer / distributor', hint: 'Imports and distributes other brands' },
  { value: 'wholesaler', label: 'Wholesaler', hint: 'Multi-brand trade stockist' },
  { value: 'retailer', label: 'Retailer', hint: 'Sells to the public' },
] as const;

export type SupplierType = (typeof SUPPLIER_TYPES)[number]['value'];

export const FIELD_SOURCE_LABEL: Record<string, string> = {
  operator: 'entered by your team',
  aade: 'from ΑΑΔΕ',
  gemi: 'from ΓΕΜΗ',
  invoice: 'from their invoice',
  web_verified: 'found online and confirmed',
  web: 'found online, not confirmed',
};

export const MATCH_LABEL: Record<string, string> = {
  afm: 'the ΑΦΜ on their site',
  gemi: 'the ΓΕΜΗ number on their site',
  phone: 'their phone on their site',
  address: 'their registered address on their site',
  email_domain: 'their invoice email domain',
};
