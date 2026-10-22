import { useEffect, useState } from 'react';
import * as THREE from 'three';

import { applyHomography, computeHomography, type Pt } from '@/lib/surfaceRenderer/homography';

export interface PhotoWall {
  map: THREE.Texture;
  color: string;
  width: number;
  height: number;
  marginX: number;
}

const PX_PER_M = 360;

export function usePhotoWall(url: string | null, front: Pt[] | null, widthM: number, heightM: number): PhotoWall | null {
  const [wall, setWall] = useState<PhotoWall | null>(null);
  const key = front ? front.map((p) => `${p.x},${p.y}`).join(';') : '';
  useEffect(() => {
    setWall(null);
    if (!url || !front || front.length !== 4 || widthM <= 0 || heightM <= 0) return;
    let live = true;
    let made: THREE.Texture | null = null;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (!live) return;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const [bl, br, tr, tl] = front.map((p) => ({ x: p.x * iw, y: p.y * ih }));
      const at = (a: Pt, b: Pt, t: number): Pt => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      const corners = (m: number, e: number) => {
        const sx = m / widthM;
        const sy = e / heightM;
        const top = (lo: Pt, hi: Pt) => at(lo, hi, 1 + sy);
        const tlE = top(bl, tl);
        const trE = top(br, tr);
        return [at(trE, tlE, 1 + sx), at(tlE, trE, 1 + sx), at(bl, br, 1 + sx), at(br, bl, 1 + sx)];
      };
      const inside = (ps: Pt[]) => ps.every((p) => p.x >= 0 && p.x <= iw && p.y >= 0 && p.y <= ih);
      let m = Math.max(0.6, widthM * 0.6);
      let e = 1.4;
      for (let i = 0; i < 24 && !inside(corners(m, e)); i++) {
        const c = corners(m, e);
        if (c.some((p) => p.x < 0 || p.x > iw)) m *= 0.85;
        if (c.some((p) => p.y < 0 || p.y > ih)) e *= 0.85;
      }
      const quad = corners(m, e);
      const width = widthM + 2 * m;
      const height = heightM + e;
      const scale = Math.min(PX_PER_M, 2048 / width, 2048 / height);
      const cw = Math.max(2, Math.round(width * scale));
      const ch = Math.max(2, Math.round(height * scale));

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = iw;
      srcCanvas.height = ih;
      const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
      const out = document.createElement('canvas');
      out.width = cw;
      out.height = ch;
      const octx = out.getContext('2d');
      if (!sctx || !octx) return;
      sctx.drawImage(img, 0, 0);
      let src: Uint8ClampedArray;
      try {
        src = sctx.getImageData(0, 0, iw, ih).data;
      } catch {
        return;
      }
      const H = computeHomography([{ x: 0, y: 0 }, { x: cw, y: 0 }, { x: cw, y: ch }, { x: 0, y: ch }], quad);
      const dst = octx.createImageData(cw, ch);
      const fadeX = Math.max(1, (m / width) * cw * 0.7);
      const fadeY = Math.max(1, (e / height) * ch * 0.45);
      const border: number[][] = [[], [], []];
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const p = applyHomography(H, { x: x + 0.5, y: y + 0.5 });
          const sx = Math.min(iw - 1, Math.max(0, Math.round(p.x)));
          const sy = Math.min(ih - 1, Math.max(0, Math.round(p.y)));
          const si = (sy * iw + sx) * 4;
          const di = (y * cw + x) * 4;
          dst.data[di] = src[si];
          dst.data[di + 1] = src[si + 1];
          dst.data[di + 2] = src[si + 2];
          const f = Math.min(1, x / fadeX, (cw - 1 - x) / fadeX, y / fadeY);
          const s = f * f * (3 - 2 * f);
          dst.data[di + 3] = Math.round(255 * s);
          if (f < 0.08 && (x + y) % 3 === 0) {
            border[0].push(src[si]);
            border[1].push(src[si + 1]);
            border[2].push(src[si + 2]);
          }
        }
      }
      octx.putImageData(dst, 0, 0);
      const median = (v: number[]) => {
        if (v.length === 0) return 220;
        const s = [...v].sort((a, b) => a - b);
        return s[Math.floor(s.length / 2)];
      };
      const hex = (n: number) => n.toString(16).padStart(2, '0');
      const color = `#${hex(median(border[0]))}${hex(median(border[1]))}${hex(median(border[2]))}`;
      const map = new THREE.CanvasTexture(out);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      made = map;
      setWall({ map, color, width, height, marginX: m });
    };
    img.src = url;
    return () => {
      live = false;
      made?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, key, widthM, heightM]);
  return wall;
}
