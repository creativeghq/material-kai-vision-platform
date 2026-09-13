/** "Test on a room" deep-link builder. */
export function buildTestOnRoomUrl(args: {
  productId: string;
  productName: string;
  productImage?: string;
}): string {
  const { productId, productName, productImage } = args;
  const params = new URLSearchParams({
    agent: 'interior-designer',
    pinned_product_id: productId,
    pinned_product_name: productName,
    prompt:
      `I want to see "${productName}" applied on a real room. ` +
      'I\'ll upload a photo of my room — apply this material onto a surface ' +
      '(floor or wall) and show me the result, keeping everything else in place.',
  });
  if (productImage) {
    params.set('pinned_product_image', productImage);
    // ATTACHED, not only pinned: attachment 0 is the reference slot the edit sends as pixels
    // beside the room photo the user adds as attachment 1 (`resolveImageSlots`). A pin alone is
    // read only by text-to-image, so the tile never reached the edit.
    params.set('image', productImage);
  }
  return `/agent-hub?${params.toString()}`;
}

/** "Build with this product" deep-link builder. */
export type ProductStudioMode = 'product-shot' | 'product-lifestyle' | 'material-texture';

export function buildProductStudioUrl(args: {
  productId: string;
  productName: string;
  productImage?: string;
  mode: ProductStudioMode;
}): string {
  const { productId, productName, productImage, mode } = args;

  const prompt =
    mode === 'product-shot'
      ? `Render a catalog hero shot of "${productName}" on a seamless white background, ` +
        'true to its real materials, finish and proportions.'
      : mode === 'product-lifestyle'
        ? `Stage "${productName}" in a styled room and photograph it as a lifestyle shot, ` +
          'keeping the product itself exactly as it is.'
        : `Create a seamless, tileable texture swatch of "${productName}" that can be applied ` +
          'to a surface in a render.';

  const params = new URLSearchParams({
    agent: 'interior-designer',
    pinned_product_id: productId,
    pinned_product_name: productName,
    generation_mode: mode,
    prompt,
  });
  if (productImage) params.set('pinned_product_image', productImage);
  return `/agent-hub?${params.toString()}`;
}
