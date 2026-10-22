import { useEffect, useState } from 'react';
import * as THREE from 'three';

import type { Pt } from '@/lib/surfaceRenderer/homography';

export interface PhotoWall {
  map: THREE.Texture;
  color: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  left: { x: number; color: string } | null;
  right: { x: number; color: string } | null;
}

const PX_PER_M = 360;
const SNAP_M = 0.35;

/** x is metres from the product's left end along its front; y is height. A corner within SNAP_M of an end is the product standing against that wall. */
export function usePhotoWall(
  url: string | null,
  front: Pt[] | null,
  corners: { left: number | null; right: number | null } | null,
  widthM: number,
  heightM: number,
): PhotoWall | null {
  const [wall, setWall] = useState<PhotoWall | null>(null);
  const key = `${front ? front.map((p) => `${p.x},${p.y}`).join(';') : ''}|${corners?.left ?? ''}|${corners?.right ?? ''}`;
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
      const frontScale = Math.abs(tr.x - tl.x + br.x - bl.x) / 2 / widthM;
      const leftPx = (tl.x + bl.x) / 2;
      const alongFront = (cx: number) => (cx * iw - leftPx) / frontScale;
      const snap = (m: number, end: number) => (Math.abs(m - end) < SNAP_M || (end === 0 ? m > 0 : m < widthM) ? end : m);
      const cl = corners?.left != null ? { px: corners.left * iw, m: snap(alongFront(corners.left), 0) } : null;
      const cr = corners?.right != null ? { px: corners.right * iw, m: snap(alongFront(corners.right), widthM) } : null;
      const scale = cl && cr && cr.m - cl.m > 0.2 && cr.px > cl.px ? (cr.px - cl.px) / (cr.m - cl.m) : frontScale;
      const anchor = cl ?? cr ?? { px: leftPx, m: 0 };
      const toPx = (m: number) => anchor.px + (m - anchor.m) * scale;
      const yTop = (tl.y + tr.y) / 2;
      const toPy = (h: number) => yTop - (h - heightM) * scale;

      const x0 = cl ? cl.m : Math.max(-widthM * 0.6 - 0.6, (0 - anchor.px) / scale + anchor.m);
      const x1 = cr ? cr.m : Math.min(widthM * 1.6 + 0.6, (iw - anchor.px) / scale + anchor.m);
      const y1 = Math.min(heightM + 1.4, heightM + yTop / scale);
      const y0 = Math.max(0, heightM - (ih - yTop) / scale);
      if (x1 - x0 < 0.1 || y1 - y0 < 0.1) return;
      const k = Math.min(PX_PER_M, 2048 / (x1 - x0), 2048 / (y1 - y0));
      const cw = Math.max(2, Math.round((x1 - x0) * k));
      const ch = Math.max(2, Math.round((y1 - y0) * k));

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
      const dst = octx.createImageData(cw, ch);
      const fadeL = cl ? 0 : cw * 0.12;
      const fadeR = cr ? 0 : cw * 0.12;
      const fadeY = ch * 0.12;
      const border: number[][] = [[], [], []];
      for (let y = 0; y < ch; y++) {
        const sy = Math.min(ih - 1, Math.max(0, Math.round(toPy(y1 - ((y + 0.5) / ch) * (y1 - y0)))));
        for (let x = 0; x < cw; x++) {
          const sx = Math.min(iw - 1, Math.max(0, Math.round(toPx(x0 + ((x + 0.5) / cw) * (x1 - x0)))));
          const si = (sy * iw + sx) * 4;
          const di = (y * cw + x) * 4;
          dst.data[di] = src[si];
          dst.data[di + 1] = src[si + 1];
          dst.data[di + 2] = src[si + 2];
          const f = Math.min(1, fadeL ? x / fadeL : 1, fadeR ? (cw - 1 - x) / fadeR : 1, y / fadeY);
          dst.data[di + 3] = Math.round(255 * f * f * (3 - 2 * f));
          if (y > fadeY && y < fadeY * 2 && (x + y) % 3 === 0) {
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
      const toHex = (c: number[][]) => `#${hex(median(c[0]))}${hex(median(c[1]))}${hex(median(c[2]))}`;
      const sideColor = (px: number, dir: -1 | 1) => {
        const acc: number[][] = [[], [], []];
        for (let y = Math.max(0, Math.floor(toPy(heightM + 0.9))); y < Math.min(ih, toPy(heightM + 0.1)); y += 3) {
          for (let d = iw * 0.01; d < iw * 0.05; d += 3) {
            const x = Math.round(px + dir * d);
            if (x < 0 || x >= iw) break;
            const i = (y * iw + x) * 4;
            acc[0].push(src[i]);
            acc[1].push(src[i + 1]);
            acc[2].push(src[i + 2]);
          }
        }
        return toHex(acc);
      };
      const map = new THREE.CanvasTexture(out);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = 8;
      made = map;
      setWall({
        map,
        color: toHex(border),
        x0,
        x1,
        y0,
        y1,
        left: cl ? { x: cl.m, color: sideColor(cl.px, -1) } : null,
        right: cr ? { x: cr.m, color: sideColor(cr.px, 1) } : null,
      });
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
