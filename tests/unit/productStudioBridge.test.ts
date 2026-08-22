/**
 * The product → Interior Designer hand-off.
 *
 * `product-shot`, `product-lifestyle` and `material-texture` have existed in
 * generate_gemini since it shipped — each with its own prompt builder in
 * `_shared/product-prompt-builder.ts` — and until 2026-08-22 NOTHING could reach them:
 * no button, no quick-start. The capability was complete and the entry point absent,
 * which is the same shape that left `generate_3d` with one call in the platform's
 * lifetime. These cases pin the entry point so it cannot quietly disappear again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildProductStudioUrl,
  buildTestOnRoomUrl,
  type ProductStudioMode,
} from '../../src/utils/testOnRoom';
import { TOOLKITS } from '../../src/components/features/ai/agentToolsCatalog';

const MODES: ProductStudioMode[] = ['product-shot', 'product-lifestyle', 'material-texture'];

/** The zod enum generate_gemini actually accepts, read from the tool definition itself. */
function geminiModes(): string[] {
  const src = readFileSync(
    join(process.cwd(), 'supabase/functions/_shared/tools/generation-tools.ts'),
    'utf8',
  );
  const m = src.match(/mode:\s*z\s*\.enum\(\[([^\]]+)\]\)/);
  if (!m) throw new Error('could not find generate_gemini mode z.enum');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('product studio bridge', () => {
  it('pins the specialist, the product and the mode', () => {
    for (const mode of MODES) {
      const url = buildProductStudioUrl({
        productId: 'p-1', productName: 'Fenwick chair', productImage: 'https://x/y.jpg', mode,
      });
      const q = new URLSearchParams(url.split('?')[1]);
      // interior-designer, not the generalist: its prompt carries the tool doctrine, it is
      // exempt from the Haiku cost-router, and forceToolCall is keyed to its id.
      expect(q.get('agent'), mode).toBe('interior-designer');
      expect(q.get('generation_mode'), mode).toBe(mode);
      expect(q.get('pinned_product_id'), mode).toBe('p-1');
      expect(q.get('pinned_product_image'), mode).toBe('https://x/y.jpg');
      expect(q.get('prompt'), mode).toContain('Fenwick chair');
    }
  });

  it('works without a product photo — the case that matters most', () => {
    // A catalogue item with no photography yet is exactly who needs a generated shot.
    const url = buildProductStudioUrl({ productId: 'p-1', productName: 'Fenwick chair', mode: 'product-shot' });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.has('pinned_product_image')).toBe(false);
    expect(q.get('generation_mode')).toBe('product-shot');
  });

  it('emits a mode generate_gemini actually accepts', () => {
    // A mode the zod enum rejects would fail at the tool boundary, after the user clicked.
    const allowed = geminiModes();
    for (const mode of MODES) expect(allowed, mode).toContain(mode);
  });

  it('does NOT collide with the material direction', () => {
    // "Test on a room" applies a material TO a room photo; these photograph the product
    // itself. Pinning a mode on the material flow would silently retarget it.
    const room = new URLSearchParams(
      buildTestOnRoomUrl({ productId: 'p-1', productName: 'Fenwick chair' }).split('?')[1],
    );
    expect(room.get('generation_mode')).toBeNull();
    expect(room.get('agent')).toBe('interior-designer');
  });

  it('the Product modal reaches the studio, not just the room flow', () => {
    // The regression this guards: the modal offered "Test on a room" alone for months
    // while three product modes sat unreachable behind it.
    const modal = readFileSync(
      join(process.cwd(), 'src/components/features/products/ProductDetailModal.tsx'),
      'utf8',
    );
    expect(modal).toContain('buildProductStudioUrl');
    expect(modal).toContain("mode: 'product-shot'");
    expect(modal).toContain("mode: 'product-lifestyle'");
  });

  it('every product mode is reachable from a quick-start too', () => {
    // Two doors on purpose: the modal (I am looking at this product) and the toolkit
    // (I want a product shot). Neither should be the only one.
    const gen = TOOLKITS.find((t) => t.id === 'generation');
    expect(gen, 'generation toolkit missing').toBeTruthy();
    const modes = (gen!.quick_starts ?? []).map((q) => q.generation?.mode).filter(Boolean);
    for (const mode of MODES) expect(modes, `no quick-start for ${mode}`).toContain(mode);
  });

  it('product modes never bind the interior Replicate grid', () => {
    // Every Replicate model in that grid is a ROOM-restyling specialist. Point one at
    // "this chair on seamless white" and it renders a room, confidently and off-brief.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/agent-chat/index.ts'),
      'utf8',
    );
    const m = src.match(/const GEMINI_ONLY_MODES = \[([\s\S]*?)\];/);
    expect(m, 'GEMINI_ONLY_MODES not found').toBeTruthy();
    for (const mode of MODES) expect(m![1], mode).toContain(`'${mode}'`);
  });
});
