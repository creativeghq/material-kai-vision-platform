import { supabase } from '@/integrations/supabase/client';

export type MetadataValueKind = 'string' | 'number' | 'boolean' | 'array' | 'object';

export function valueKind(value: unknown): MetadataValueKind {
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (value !== null && typeof value === 'object') return 'object';
  return 'string';
}

export function toEditorText(value: unknown, kind: MetadataValueKind = valueKind(value)): string {
  if (kind === 'array' || kind === 'object') return JSON.stringify(value, null, 2);
  if (value === null || value === undefined) return '';
  return String(value);
}

export function displayValue(value: unknown): string {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v))).join(', ');
  if (value !== null && typeof value === 'object') return JSON.stringify(value);
  return String(value ?? '');
}

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

export function parseEditorText(text: string, kind: MetadataValueKind): ParseResult {
  const trimmed = text.trim();
  switch (kind) {
    case 'number': {
      const n = Number(trimmed.replace(/\s/g, '').replace(',', '.'));
      return trimmed !== '' && Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: 'Enter a number' };
    }
    case 'boolean': {
      const lower = trimmed.toLowerCase();
      if (lower === 'true' || lower === 'yes') return { ok: true, value: true };
      if (lower === 'false' || lower === 'no') return { ok: true, value: false };
      return { ok: false, error: 'Enter true or false' };
    }
    case 'array':
    case 'object': {
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { ok: false, error: 'Enter valid JSON' };
      }
      const isArray = Array.isArray(parsed);
      if (kind === 'array' ? !isArray : (isArray || parsed === null || typeof parsed !== 'object')) {
        return { ok: false, error: kind === 'array' ? 'Enter a JSON array' : 'Enter a JSON object' };
      }
      return { ok: true, value: parsed };
    }
    default:
      return { ok: true, value: text };
  }
}

/** Patches ONE metadata key through the registry-aware writer, which re-derives `attributes`. `null` removes the key. */
export async function patchProductField(productId: string, key: string, value: unknown): Promise<void> {
  const { error } = await supabase.rpc('patch_product_field' as never, {
    p_product_id: productId,
    p_key: key,
    p_value: value === undefined ? null : value,
  } as never);
  if (error) throw new Error(error.message);
}
