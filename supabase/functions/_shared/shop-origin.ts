/** Product in Place (#474): the key a merchant's own-shop product is known by — its shop origin plus `shopify:<id>` / `woo:<id>`. */

export const STORE_EXTERNAL_ID = /^(shopify|woo):[0-9]{1,20}$/;

export function normalizeShopOrigin(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:') return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

export function storeExternalIds(value: unknown, max = 60): string[] {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  return [...new Set(list.map((v) => String(v).trim()).filter((v) => STORE_EXTERNAL_ID.test(v)))].slice(0, max);
}
