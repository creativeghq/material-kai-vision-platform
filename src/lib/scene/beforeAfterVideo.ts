import { encodeVideo } from '@/lib/scene/encodeVideo';

const SECONDS = 7;
const FPS = 30;
const MAX_SIDE = 1280;
const HOLD = 0.2;

const load = async (url: string): Promise<HTMLImageElement> => {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await img.decode();
  return img;
};

export function wipeAt(p: number): number {
  const ease = (t: number) => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
  return p < HOLD ? 0 : ease((p - HOLD) / (1 - 2 * HOLD));
}

export async function recordBeforeAfter(beforeUrl: string, afterUrl: string): Promise<Blob> {
  const [before, after] = await Promise.all([load(beforeUrl), load(afterUrl)]);
  const k = Math.min(1, MAX_SIDE / Math.max(after.naturalWidth, after.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((after.naturalWidth * k) / 2) * 2;
  canvas.height = Math.round((after.naturalHeight * k) / 2) * 2;
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const cover = (img: HTMLImageElement) => {
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    ctx.drawImage(img, (W - img.naturalWidth * s) / 2, (H - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
  };
  const label = (text: string, x: number, align: CanvasTextAlign) => {
    ctx.font = `600 ${Math.round(H * 0.032)}px Arial, sans-serif`;
    ctx.textAlign = align;
    const w = ctx.measureText(text).width + 28;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillRect(align === 'left' ? x : x - w, H - H * 0.1, w, H * 0.06);
    ctx.fillStyle = '#1d1d1b';
    ctx.fillText(text, align === 'left' ? x + 14 : x - 14, H - H * 0.058);
  };
  const total = SECONDS * FPS;
  const video = await encodeVideo(canvas, FPS, total, (i) => {
    const x = wipeAt(i / (total - 1)) * W;
    cover(before);
    if (x > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, x, H);
      ctx.clip();
      cover(after);
      ctx.restore();
      if (x < W) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x - 2, 0, 4, H); }
    }
    if (x < W * 0.8) label('Before', W - 24, 'right');
    if (x > W * 0.2) label('After', 24, 'left');
  });
  if (!video) throw new Error('The video was stopped.');
  return video;
}
