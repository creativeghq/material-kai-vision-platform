const PDF_LIB_EMBEDDABLE_TYPES = new Set(['image/jpeg', 'image/png']);

export async function downscaleToJpeg(file: Blob, maxEdge = 2000): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not available');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), 'image/jpeg', 0.85));
  if (!blob) throw new Error('Could not encode image');
  return { blob, w, h };
}

export class UnsupportedImageError extends Error {}

export async function toPdfEmbeddableImage(file: File): Promise<{ blob: Blob; type: string; ext: string }> {
  if (PDF_LIB_EMBEDDABLE_TYPES.has(file.type)) {
    return { blob: file, type: file.type, ext: file.type === 'image/png' ? 'png' : 'jpg' };
  }
  try {
    const { blob } = await downscaleToJpeg(file);
    return { blob, type: 'image/jpeg', ext: 'jpg' };
  } catch {
    throw new UnsupportedImageError(`This image format (${file.type || 'unknown'}) cannot be used — please upload a JPEG, PNG or WebP.`);
  }
}
