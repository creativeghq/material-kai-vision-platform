import { labelForField, type FieldRegistrySnapshot } from '@/services/fieldRegistryService';

const titleCase = (key: string) =>
  key.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

export function describeVariant(
  selected: Record<string, unknown> | null | undefined,
  categoryKey: string | null | undefined,
  registry: FieldRegistrySnapshot | null,
): string | null {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(selected ?? {})) {
    const value = raw == null ? '' : String(raw).trim();
    if (!value) continue;
    const field = registry?.byName.get(key);
    const label = field ? labelForField(field, categoryKey ?? '') : titleCase(key);
    parts.push(`${label}: ${value}`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

export function isPriceOnRequest(pricingStatus: unknown, unitPrice: unknown): boolean {
  if (pricingStatus != null && pricingStatus !== 'priced') return true;
  return unitPrice === null || unitPrice === undefined || unitPrice === '';
}
