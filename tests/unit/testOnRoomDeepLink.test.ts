/**
 * "Test on a room" hands the product to the edit as the REFERENCE ATTACHMENT, not only as a pin:
 * a pin is read by text-to-image alone, so the tile never reached the edit (#404 Phase 0.1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import { buildTestOnRoomUrl, buildProductStudioUrl } from '../../src/utils/testOnRoom';

const params = (url: string) => new URL(url, 'http://x').searchParams;

describe('the product card deep link', () => {
  it('attaches the product image as attachment 0, the reference slot, and still pins it', () => {
    const p = params(buildTestOnRoomUrl({ productId: 'p1', productName: 'Calacatta 60x60', productImage: 'https://cdn/x.jpg' }));
    expect(p.get('agent')).toBe('interior-designer');
    expect(p.get('image')).toBe('https://cdn/x.jpg');
    expect(p.get('pinned_product_id')).toBe('p1');
    expect(p.get('pinned_product_image')).toBe('https://cdn/x.jpg');
    expect(p.get('prompt')).toMatch(/upload a photo of my room/);
  });

  it('attaches nothing when the product has no image — there is no reference to send', () => {
    const p = params(buildTestOnRoomUrl({ productId: 'p1', productName: 'No photo' }));
    expect(p.get('image')).toBeNull();
    expect(p.get('pinned_product_image')).toBeNull();
  });

  it('the product studio modes keep the product as their SUBJECT, not as a reference attachment', () => {
    const p = params(buildProductStudioUrl({ productId: 'p1', productName: 'Chair', productImage: 'https://cdn/c.jpg', mode: 'product-shot' }));
    expect(p.get('image')).toBeNull();
    expect(p.get('generation_mode')).toBe('product-shot');
  });

  it('the Agent Hub page reads that attachment, and the slot convention makes it the reference', () => {
    const page = stripComments(readFileSync(join(process.cwd(), 'src/pages/AgentHub.tsx'), 'utf8'));
    expect(page).toContain("searchParams.get('image')");
    // The tool must not promote the pin on its own — that would apply it to every later edit.
    const tools = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/_shared/tools/generation-tools.ts'), 'utf8'));
    expect(tools).not.toMatch(/styleReferenceUrl\s*=\s*pinnedMaterialImages/);
  });
});
