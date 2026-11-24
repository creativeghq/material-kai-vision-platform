export interface BoardDecorRef { brand: string; code: string; name: string | null }

export function decorOfRow(row: { decor_brand?: string | null; decor_code?: string | null; decor_name?: string | null } | null | undefined): BoardDecorRef | null {
  if (!row?.decor_code) return null;
  return { brand: row.decor_brand ?? '', code: row.decor_code, name: row.decor_name ?? null };
}

export const decorLabel = (d: BoardDecorRef): string =>
  `${[d.brand, d.code].filter(Boolean).join(' ')}${d.name ? ` · ${d.name}` : ''}`;

export const decorPrompt = (d: BoardDecorRef): string =>
  `${[d.brand, d.code].filter(Boolean).join(' ')}${d.name ? ` "${d.name}"` : ''} melamine`;

const WOOD = /\b(oak|walnut|ash|elm|pine|beech|cherry|wenge|teak|larch|maple|hickory|acacia|birch|chestnut|wood|timber)\b/;

const WOOD_TONES: Array<[RegExp, string]> = [
  [/\bwalnut\b/, '#5d4030'],
  [/\bwenge\b/, '#3b2a22'],
  [/\bcherry\b/, '#8a4a2f'],
  [/\b(black|dark|smoked|tobacco|brown|chocolate|coffee|mocha)\b/, '#6b4a33'],
  [/\b(grey|gray|silver)\b/, '#9a8f84'],
  [/\b(white|bleached|light|natural|sand|nordic|pale|cream)\b/, '#c9a77c'],
];

const COLOUR_TONES: Array<[RegExp, string]> = [
  [/\b(aluminium|aluminum|steel|silver|inox|metal|metallic|chrome)\b/, '#b8babb'],
  [/\b(gold|brass|champagne)\b/, '#b89a5e'],
  [/\b(copper|bronze|rust)\b/, '#8c5a3c'],
  [/\bolive\b/, '#6b6a3e'],
  [/\b(green|sage|agave|mint|jade)\b/, '#5f7356'],
  [/\b(blue|navy|petrol|indigo|denim)\b/, '#2f4a66'],
  [/\b(terracotta|brick|orange)\b/, '#b0603e'],
  [/\b(red|bordeaux|burgundy|wine)\b/, '#7c2f2f'],
  [/\b(yellow|ochre|curry|mustard)\b/, '#c9a13b'],
  [/\b(pink|rose|blush)\b/, '#d7a7a2'],
  [/\b(anthracite|graphite|lava)\b/, '#3a3d40'],
  [/\b(black|onyx|carbon)\b/, '#1f1f1f'],
  [/\bdark grey\b|\bdark gray\b/, '#5a5c5e'],
  [/\blight grey\b|\blight gray\b|\bpebble\b/, '#c4c4c0'],
  [/\b(white|alabaster|snow|polar|arctic)\b/, '#f2f1ec'],
  [/\b(cream|ivory|vanilla|magnolia)\b/, '#ece3cf'],
  [/\b(beige|cashmere|almond|sand|cubanit|linen)\b/, '#d8c8ad'],
  [/\b(taupe|mink|truffle|fango)\b/, '#a39383'],
  [/\b(brown|cappuccino|mocha|chocolate|coffee)\b/, '#7a5c44'],
  [/\b(grey|gray|concrete|cement|stone|slate|platinum)\b/, '#8f9093'],
  [/\bmarble\b/, '#e8e6e1'],
];

export function decorTone(name: string | null | undefined): string | null {
  const n = (name ?? '').toLowerCase().replace(/-/g, ' ');
  if (!n.trim()) return null;
  if (WOOD.test(n)) return WOOD_TONES.find(([re]) => re.test(n))?.[1] ?? '#a97c50';
  return COLOUR_TONES.find(([re]) => re.test(n))?.[1] ?? null;
}
