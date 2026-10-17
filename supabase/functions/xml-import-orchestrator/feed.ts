/**
 * Pure feed helpers for the XML importer: byte decoding, row discovery, path flattening and the
 * ONE product builder that both the preview and the import run. Import-free so unit tests load it.
 */

export type XmlNode = Record<string, unknown>;

/** A problem with the operator's input — the caller maps it to a 400. */
export class FeedInputError extends Error {}

const isObject = (v: unknown): v is XmlNode => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Bytes → text. A BOM wins, then the XML declaration's `encoding`, else strict UTF-8. A feed
 * that is none of those is refused rather than decoded into mojibake.
 */
export function decodeFeedBytes(bytes: Uint8Array): { text: string; encoding: string } {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: strictDecode('utf-8', bytes.subarray(3), true), encoding: 'utf-8' };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: strictDecode('utf-16le', bytes.subarray(2), true), encoding: 'utf-16le' };
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: strictDecode('utf-16be', bytes.subarray(2), true), encoding: 'utf-16be' };
  }
  let head = '';
  for (const b of bytes.subarray(0, 256)) head += String.fromCharCode(b);
  const declared = /^\s*<\?xml[^>]*?\bencoding\s*=\s*["']([A-Za-z0-9._:-]+)["']/i.exec(head)?.[1];
  const label = (declared ?? 'utf-8').toLowerCase();
  return { text: strictDecode(label, bytes, !!declared), encoding: label };
}

function strictDecode(label: string, bytes: Uint8Array, declared: boolean): string {
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(label, { fatal: true });
  } catch {
    throw new FeedInputError(`The feed declares encoding "${label}", which is not supported.`);
  }
  try {
    return decoder.decode(bytes);
  } catch {
    throw new FeedInputError(declared
      ? `The feed is not valid ${label}.`
      : 'The feed is not valid UTF-8 and its XML declaration names no encoding.');
  }
}

const ROW_PATH_RE = /^[a-z0-9_:-]+(\.[a-z0-9_:-]+)*$/;

/**
 * Every product row in the document: all containers whose tag is a product tag (never only the
 * first), or exactly the nodes at `rowPath` when the operator names one.
 */
export function collectProductNodes(
  doc: XmlNode,
  productTags: ReadonlySet<string>,
  rowPath?: string | null,
): XmlNode[] {
  if (rowPath) {
    const path = rowPath.trim().toLowerCase();
    if (!ROW_PATH_RE.test(path)) throw new FeedInputError(`Invalid row path "${rowPath}".`);
    let current: unknown[] = [doc];
    for (const seg of path.split('.')) {
      const next: unknown[] = [];
      for (const n of current) {
        if (!isObject(n)) continue;
        const v = n[seg];
        if (Array.isArray(v)) next.push(...v);
        else if (v !== undefined) next.push(v);
      }
      current = next;
    }
    return current.filter(isObject);
  }
  const out: XmlNode[] = [];
  const queue: unknown[] = [doc];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!isObject(node)) continue;
    for (const [key, val] of Object.entries(node)) {
      if (key.startsWith('@_') || key === '#text') continue;
      const items = Array.isArray(val) ? val : [val];
      if (productTags.has(key) && items.some(isObject)) {
        out.push(...items.filter(isObject));
        continue;
      }
      for (const it of items) if (isObject(it)) queue.push(it);
    }
  }
  return out;
}

const MAX_PATH_DEPTH = 4;
const DISCRIMINATOR_ATTRS = ['name', 'key', 'code', 'type', 'id'];
const NAME_ATTRS = ['name', 'key'];

function scalarText(v: unknown): string | undefined {
  if (typeof v === 'string') return v.trim() || undefined;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (isObject(v)) return scalarText(v['#text']);
  return undefined;
}

function discriminatorOf(item: XmlNode, attrs: readonly string[]): { attr: string; value: string } | null {
  for (const attr of attrs) {
    for (const key of Object.keys(item)) {
      if (key.toLowerCase() === `@_${attr}`) {
        const value = scalarText(item[key]);
        if (value) return { attr: key, value: value.toLowerCase() };
      }
    }
  }
  return null;
}

function walk(value: unknown, path: string, depth: number, out: Map<string, string[]>, skipAttr?: string) {
  if (value === undefined || value === null) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      const disc = isObject(item)
        ? discriminatorOf(item, value.length > 1 ? DISCRIMINATOR_ATTRS : NAME_ATTRS)
        : null;
      if (disc) walk(item, `${path}[${disc.value}]`, depth, out, disc.attr);
      else walk(item, path, depth, out);
    }
    return;
  }
  if (!isObject(value)) {
    const t = scalarText(value);
    if (t && path) push(out, path, t);
    return;
  }
  const own = scalarText(value['#text']);
  if (own && path) push(out, path, own);
  if (depth >= MAX_PATH_DEPTH) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === '#text' || key === skipAttr) continue;
    if (key.startsWith('@_')) {
      const a = scalarText(child);
      if (a) push(out, `${path}@${key.slice(2).toLowerCase()}`, a);
      continue;
    }
    const childPath = path ? `${path}.${key}` : key;
    const disc = isObject(child) ? discriminatorOf(child, NAME_ATTRS) : null;
    if (disc) walk(child, `${childPath}[${disc.value}]`, depth + 1, out, disc.attr);
    else walk(child, childPath, depth + 1, out);
  }
}

function push(out: Map<string, string[]>, path: string, value: string) {
  const list = out.get(path);
  if (list) list.push(value);
  else out.set(path, [value]);
}

const flatCache = new WeakMap<object, Map<string, string[]>>();

/**
 * A product row as `path → every value`: child elements (`specs.thickness`), attributes
 * (`@id`, `image@src`), name-keyed repeats (`spec[thickness]`). Repeats stay arrays.
 */
export function flattenNode(node: XmlNode): Map<string, string[]> {
  const cached = flatCache.get(node);
  if (cached) return cached;
  const out = new Map<string, string[]>();
  walk(node, '', 0, out);
  flatCache.set(node, out);
  return out;
}

export function valuesAt(node: XmlNode, path: string): string[] {
  return flattenNode(node).get(path.toLowerCase()) ?? flattenNode(node).get(path) ?? [];
}

/** Product-level targets with fixed meaning. Everything else is a registry field: `attr:<field_name>`. */
export const STRUCTURAL_TARGET_FIELDS = [
  'name', 'factory_name', 'material_category', 'description', 'factory_group_name',
  'factory_address', 'factory_city', 'factory_country', 'factory_postal_code',
  'factory_phone', 'factory_email', 'factory_website', 'factory_country_of_origin',
  'factory_founded_year', 'factory_employee_count', 'factory_linkedin_url',
] as const;

/** Real `products` columns or commercial facts; never mirrored into the facet metadata. */
export const COLUMN_TARGET_FIELDS = [
  'external_sku', 'mpn', 'barcode', 'weight', 'price', 'supplier_cost', 'currency', 'unit',
] as const;

export const MULTI_VALUE_TARGETS = ['images'] as const;

export const CORE_TARGETS: readonly string[] = [
  ...STRUCTURAL_TARGET_FIELDS, ...COLUMN_TARGET_FIELDS, ...MULTI_VALUE_TARGETS,
];

export const REQUIRED_TARGET_FIELDS = ['name', 'factory_name', 'material_category'] as const;

export const ATTRIBUTE_TARGET_PREFIX = 'attr:';

/** Registry fields a core target already carries; offering both would split one fact in two. */
export const REGISTRY_FIELDS_SHADOWED_BY_CORE = new Set([
  'sku', 'mpn', 'barcode', 'material_category', 'brand', 'factory_name', 'factory_group_name',
  'price_currency', 'price_unit',
]);

export type ValueSource = 'xml' | 'default';

export interface BuildContext {
  mappings: Record<string, string>;
  manualValues: Record<string, string>;
  /** The upload's category key, already registry-validated. The fallback, never the override. */
  uploadCategory: string;
  /** Raw per-row category value → registry key, or null when it does not resolve. */
  categoryKeyFor: (raw: string) => string | null;
  attributeTargets: ReadonlySet<string>;
}

export interface BuiltProduct {
  product: Record<string, unknown>;
  value_sources: Record<string, ValueSource>;
  missingRequired: string[];
}

/** Narrow a mapping to targets the importer resolves; anything else keeps its value as metadata. */
export function sanitizeTargets(
  mappings: Record<string, string> | null | undefined,
  attributeTargets: ReadonlySet<string>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const [path, target] of Object.entries(mappings ?? {})) {
    if (!target) continue;
    if (CORE_TARGETS.includes(target) || target === 'metadata') clean[path] = target;
    else if (target.startsWith(ATTRIBUTE_TARGET_PREFIX)
      && attributeTargets.has(target.slice(ATTRIBUTE_TARGET_PREFIX.length))) clean[path] = target;
    else if (attributeTargets.has(target)) clean[path] = `${ATTRIBUTE_TARGET_PREFIX}${target}`;
    else clean[path] = 'metadata';
  }
  return clean;
}

/** Distinct raw values the mapped category path(s) carry, so they can be resolved in one pass. */
export function rawCategoryValues(nodes: XmlNode[], mappings: Record<string, string>): string[] {
  const paths = Object.entries(mappings).filter(([, t]) => t === 'material_category').map(([p]) => p);
  const seen = new Set<string>();
  for (const node of nodes) {
    for (const p of paths) {
      const v = valuesAt(node, p)[0];
      if (v) seen.add(v);
    }
  }
  return [...seen];
}

const splitList = (raw: string): string[] => raw.split(/[,|]/).map((s) => s.trim()).filter(Boolean);

export function buildProduct(node: XmlNode, ctx: BuildContext): BuiltProduct {
  const byTarget = new Map<string, string[]>();
  for (const [path, target] of Object.entries(ctx.mappings)) {
    if (!target) continue;
    const list = byTarget.get(target) ?? [];
    list.push(path);
    byTarget.set(target, list);
  }
  const value_sources: Record<string, ValueSource> = {};
  const product: Record<string, unknown> = {};
  const attributes: Record<string, string | string[]> = {};
  const metadata: Record<string, string | string[]> = {};

  const resolve = (target: string, multi: boolean): string[] => {
    for (const path of byTarget.get(target) ?? []) {
      const vals = valuesAt(node, path);
      if (vals.length > 0) {
        value_sources[target] = 'xml';
        return multi ? vals : [vals[0]];
      }
    }
    const fallback = ctx.manualValues[target]?.trim();
    if (fallback) {
      value_sources[target] = 'default';
      return [fallback];
    }
    return [];
  };

  for (const target of [...STRUCTURAL_TARGET_FIELDS, ...COLUMN_TARGET_FIELDS]) {
    if (target === 'material_category') continue;
    const [v] = resolve(target, false);
    if (v !== undefined) product[target] = v;
  }

  const rawCategory = (byTarget.get('material_category') ?? [])
    .map((p) => valuesAt(node, p)[0]).find(Boolean);
  const rowCategory = rawCategory ? ctx.categoryKeyFor(rawCategory) : null;
  if (rowCategory) {
    product.material_category = rowCategory;
    value_sources.material_category = 'xml';
  } else {
    product.material_category = ctx.uploadCategory;
    value_sources.material_category = 'default';
    if (rawCategory) metadata.category_unresolved = rawCategory;
  }

  const images: string[] = [];
  for (const v of resolve('images', true)) images.push(...splitList(v));
  product.images = [...new Set(images)];

  for (const [target, paths] of byTarget) {
    if (target === 'metadata') {
      for (const path of paths) {
        const vals = valuesAt(node, path);
        if (vals.length > 0) metadata[path] = vals.length > 1 ? vals : vals[0];
      }
      continue;
    }
    if (!target.startsWith(ATTRIBUTE_TARGET_PREFIX)) continue;
    const field = target.slice(ATTRIBUTE_TARGET_PREFIX.length);
    if (!ctx.attributeTargets.has(field)) continue;
    const vals = resolve(target, true);
    if (vals.length > 0) attributes[field] = vals.length > 1 ? vals : vals[0];
  }
  for (const [target, raw] of Object.entries(ctx.manualValues)) {
    if (!target.startsWith(ATTRIBUTE_TARGET_PREFIX) || byTarget.has(target)) continue;
    const field = target.slice(ATTRIBUTE_TARGET_PREFIX.length);
    if (ctx.attributeTargets.has(field) && raw?.trim()) {
      attributes[field] = raw.trim();
      value_sources[target] = 'default';
    }
  }

  product.attributes = attributes;
  product.metadata = metadata;

  const missingRequired = REQUIRED_TARGET_FIELDS.filter((t) => !product[t]);
  return { product, value_sources, missingRequired };
}
