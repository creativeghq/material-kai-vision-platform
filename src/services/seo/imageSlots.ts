export interface ImageSlot {
  line: string;
  alt: string;
  prompt: string;
}

const SLOT = /^[ \t]*\[IMAGE:\s*([^|\]\n]+?)\s*\|\s*([^\]\n]+?)\s*\][ \t]*$/gm;

export function imageSlots(markdown: string | null | undefined): ImageSlot[] {
  if (!markdown) return [];
  return [...markdown.matchAll(SLOT)].map((m) => ({ line: m[0], alt: m[1].trim(), prompt: m[2].trim() }));
}

export function fillImageSlot(markdown: string, slot: ImageSlot, url: string): string {
  const alt = slot.alt.replace(/[[\]]/g, '');
  return markdown.replace(slot.line, `![${alt}](${url})`);
}

export function removeImageSlot(markdown: string, slot: ImageSlot): string {
  return markdown.replace(`${slot.line}\n`, '').replace(slot.line, '');
}
