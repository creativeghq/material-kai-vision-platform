/** `<materialkai-place>` (#474): products on the visitor's own photo, which is composited here and never uploaded. */
import { formatMoney } from '@/utils/decimal';
import { trackEmbedEvent } from './embedSession';
import { loadTurnstile } from './turnstileLoader';
import {
  cutoutStudioBackground, handlePoint, hitItem, itemHeight, topItemAt, type PlacedItem,
} from './placeGeometry';

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const PHOTO_MAX_SIDE = 1600;
const SPRITE_MAX_SIDE = 900;

interface ShelfProduct {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  image: string;
  widthM: number | null;
}

interface Sprite {
  source: CanvasImageSource;
  aspect: number;
  cut: boolean;
  tainted: boolean;
}

const STYLE = `
:host { display:block; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.wrap { display:grid; gap:14px; grid-template-columns:minmax(0,1fr); }
@media (min-width:720px) { .wrap { grid-template-columns:minmax(0,1fr) 240px; } }
.stage { position:relative; }
canvas { display:block; width:100%; height:auto; border-radius:10px; border:1px solid #e3ddd2; background:#f6f3ee; touch-action:none; }
.empty { display:grid; place-items:center; gap:10px; text-align:center; border:1px dashed #d9d4cd; border-radius:10px;
         padding:36px 16px; background:#faf8f5; }
.empty p { margin:0; font-size:13px; color:#6b6560; max-width:340px; }
.side { display:grid; gap:11px; align-content:start; }
.lbl { font-size:12px; color:#6b6560; display:block; }
.shelf { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; max-height:300px; overflow-y:auto; }
.card { font:inherit; display:grid; gap:4px; padding:6px; border:1px solid #e3ddd2; border-radius:8px; background:#fff;
        color:inherit; cursor:pointer; text-align:left; }
.card img { width:100%; aspect-ratio:1; object-fit:contain; background:#f6f3ee; border-radius:5px; }
.card span { font-size:11px; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.card b { font-size:11px; font-weight:600; font-variant-numeric:tabular-nums; }
.row { display:flex; gap:6px; flex-wrap:wrap; }
button.act { font:inherit; font-size:13px; padding:7px 12px; border-radius:7px; border:1px solid #d9d4cd;
             background:#fff; color:inherit; cursor:pointer; }
button.go { font:inherit; font-size:13px; padding:8px 15px; border-radius:7px; border:1px solid #1c1a1e;
            background:#1c1a1e; color:#fff; cursor:pointer; }
button:disabled { opacity:.55; cursor:default; }
.sel { border:1px solid #e3ddd2; border-radius:8px; padding:9px 10px; background:#faf8f5; display:grid; gap:7px; }
.sel h4 { margin:0; font-size:12px; font-weight:650; }
.hint, .note { font-size:11px; color:#6b6560; margin:0; line-height:1.45; }
.quote { display:grid; gap:7px; border-top:1px solid #e3ddd2; padding-top:10px; }
label.f { display:grid; gap:3px; font-size:12px; color:#6b6560; }
input[type="text"], input[type="email"] { font:inherit; font-size:13px; padding:6px 8px; border-radius:7px;
  border:1px solid #d9d4cd; background:#fff; color:inherit; width:100%; box-sizing:border-box; }
.state { font-size:13px; color:#6b6560; padding:16px 0; }
.state:empty { display:none; }
.err { font-size:12px; color:#a3341f; margin:0; }
.ok { font-size:12px; color:#2f7d50; margin:0; }
input[type="file"] { display:none; }
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  canvas, .empty, .sel, .card img { background:#2c2833; border-color:#3d3745; }
  .card, button.act, input[type="text"], input[type="email"] { background:#221f26; border-color:#3d3745; color:#f2eef2; }
  .lbl, .hint, .note, .state, .empty p { color:#a9a2ad; }
  .quote { border-color:#3d3745; }
  .err { color:#f08a72; }
  .ok { color:#4fbe7e; }
  button.go { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
}
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function loadImage(url: string, cors: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = url;
  });
}

export class MaterialKaiPlace extends HTMLElement {
  private root: ShadowRoot;
  private stage: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private side: HTMLDivElement;
  private status: HTMLDivElement;

  private products: ShelfProduct[] = [];
  private sprites = new Map<string, Sprite>();
  private photo: HTMLCanvasElement | null = null;
  private items: PlacedItem[] = [];
  private selectedUid: number | null = null;
  private nextUid = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { kind: 'move' | 'scale' | 'pinch'; uid: number; startW: number; startRot: number;
    offX: number; offY: number; startDist: number; startAngle: number } | null = null;

  private siteKey: string | null = null;
  private turnstileToken = '';
  private asking = false;
  private sending = false;
  private sent = false;
  private started = false;
  private observer: IntersectionObserver | null = null;
  private formValues = { name: '', email: '', message: '' };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = el('style');
    style.textContent = STYLE;
    this.stage = el('div', 'stage');
    this.canvas = el('canvas');
    this.side = el('div', 'side');
    this.status = el('div', 'state', 'Loading…');
    const wrap = el('div', 'wrap');
    const left = el('div');
    left.append(this.stage, this.status);
    wrap.append(left, this.side);
    this.root.append(style, wrap);
    this.bindPointer();
  }

  private get apiBase(): string {
    return (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  private get apiKey(): string | null {
    return this.getAttribute('api-key');
  }

  connectedCallback() {
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        this.observer?.disconnect();
        this.observer = null;
        void this.start();
      }
    }, { rootMargin: '200px' });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.observer?.disconnect();
    this.observer = null;
  }

  private async start() {
    if (this.started) return;
    this.started = true;
    const key = this.apiKey;
    if (!key) { this.status.textContent = 'This widget is missing its api-key.'; return; }

    const picked = (this.getAttribute('product-ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const params = new URLSearchParams({ action: 'list', limit: '60', key });
    if (picked.length) params.set('product_ids', picked.join(','));
    try {
      const res = await fetch(`${this.apiBase}/functions/v1/products-3d-api?${params}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        this.status.textContent = typeof body?.error === 'string' ? body.error : 'Could not load the products.';
        return;
      }
      this.products = ((body.products ?? []) as Array<Record<string, unknown>>)
        .map((p) => ({
          id: String(p.product_id),
          name: String(p.name ?? ''),
          price: typeof p.price === 'number' ? p.price : null,
          currency: String(p.currency ?? 'EUR'),
          image: Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : '',
          widthM: typeof p.width_m === 'number' ? p.width_m : null,
        }))
        .filter((p) => p.image);
      fetch(`${this.apiBase}/functions/v1/products-3d-api?action=form_config&key=${encodeURIComponent(key)}`)
        .then((r) => r.json())
        .then((b) => { this.siteKey = typeof b?.turnstile_site_key === 'string' ? b.turnstile_site_key : null; })
        .catch(() => { this.siteKey = null; });
    } catch {
      this.status.textContent = 'Could not reach the catalogue.';
      return;
    }
    if (this.products.length === 0) {
      this.status.textContent = 'No product here has a picture to place yet.';
      return;
    }
    this.status.textContent = '';
    this.renderStage();
    this.renderSide();
  }

  private photoInputs(): HTMLDivElement {
    const row = el('div', 'row');
    const mk = (label: string, camera: boolean, primary: boolean) => {
      const input = el('input');
      input.type = 'file';
      input.accept = 'image/*';
      if (camera) input.setAttribute('capture', 'environment');
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (file) void this.usePhoto(file);
        input.value = '';
      });
      const btn = el('button', primary ? 'go' : 'act', label);
      btn.type = 'button';
      btn.addEventListener('click', () => input.click());
      row.append(input, btn);
    };
    mk('Take a photo', true, true);
    mk('Upload a photo', false, false);
    return row;
  }

  private renderStage() {
    if (!this.photo) {
      const empty = el('div', 'empty');
      empty.append(
        el('p', undefined, 'Take a photo of your space, or upload one, then place our products in it.'),
        this.photoInputs(),
        el('p', undefined, 'Your photo stays on your device. It is not uploaded.'),
      );
      this.stage.replaceChildren(empty);
      return;
    }
    this.stage.replaceChildren(this.canvas);
    this.paint(true);
  }

  private async usePhoto(file: File) {
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url, false);
      const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const c = el('canvas');
      c.width = Math.max(1, Math.round(img.naturalWidth * scale));
      c.height = Math.max(1, Math.round(img.naturalHeight * scale));
      c.getContext('2d')?.drawImage(img, 0, 0, c.width, c.height);
      const prev = this.photo;
      if (prev) {
        const fx = c.width / prev.width;
        const fy = c.height / prev.height;
        for (const it of this.items) { it.cx *= fx; it.cy *= fy; it.w *= fx; }
      }
      this.photo = c;
      this.canvas.width = c.width;
      this.canvas.height = c.height;
      this.status.textContent = this.items.length ? '' : 'Now pick a product to place it.';
      this.renderStage();
      this.renderSide();
    } catch {
      this.status.textContent = 'That photo could not be opened. Try a JPEG or PNG.';
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private async spriteFor(product: ShelfProduct): Promise<Sprite | null> {
    const known = this.sprites.get(product.id);
    if (known) return known;
    let sprite: Sprite;
    try {
      const img = await loadImage(product.image, true);
      const scale = Math.min(1, SPRITE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const c = el('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const result = cutoutStudioBackground(data.data, w, h);
      if (result.cut) {
        ctx.putImageData(data, 0, 0);
        const t = el('canvas');
        t.width = result.box.w;
        t.height = result.box.h;
        t.getContext('2d')?.drawImage(c, result.box.x, result.box.y, result.box.w, result.box.h, 0, 0, result.box.w, result.box.h);
        sprite = { source: t, aspect: result.box.w / result.box.h, cut: true, tainted: false };
      } else {
        sprite = { source: c, aspect: w / h, cut: false, tainted: false };
      }
    } catch {
      try {
        const img = await loadImage(product.image, false);
        sprite = { source: img, aspect: img.naturalWidth / Math.max(1, img.naturalHeight), cut: false, tainted: true };
      } catch {
        return null;
      }
    }
    this.sprites.set(product.id, sprite);
    return sprite;
  }

  private async place(product: ShelfProduct) {
    if (!this.photo) { this.status.textContent = 'Add a photo of your space first.'; return; }
    const sprite = await this.spriteFor(product);
    if (!sprite) { this.status.textContent = `The picture of ${product.name} could not be loaded.`; return; }
    const w = Math.min(this.photo.width * 0.32, this.photo.height * 0.5 * sprite.aspect);
    const h = w / sprite.aspect;
    const item: PlacedItem = {
      uid: this.nextUid++, productId: product.id, cx: this.photo.width / 2,
      cy: Math.min(this.photo.height * 0.62, this.photo.height - h / 2 - this.photo.height * 0.04),
      w, aspect: sprite.aspect, rot: 0, flip: false,
    };
    this.items.push(item);
    this.selectedUid = item.uid;
    this.status.textContent = sprite.cut ? '' : 'This picture has a background we could not remove; it is shown as it is.';
    this.paint(true);
    this.renderSide();
    this.report('embed_place_product');
  }

  private get selected(): PlacedItem | null {
    return this.items.find((i) => i.uid === this.selectedUid) ?? null;
  }

  private productOf(item: PlacedItem | null): ShelfProduct | null {
    return item ? this.products.find((p) => p.id === item.productId) ?? null : null;
  }

  private paint(withChrome: boolean) {
    const ctx = this.canvas.getContext('2d');
    if (!ctx || !this.photo) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.photo, 0, 0);
    for (const item of this.items) {
      const sprite = this.sprites.get(item.productId);
      if (!sprite) continue;
      const h = itemHeight(item);
      ctx.save();
      ctx.translate(item.cx, item.cy);
      ctx.rotate(item.rot);
      if (sprite.cut) {
        ctx.save();
        ctx.translate(0, h / 2);
        ctx.scale(1, 0.16);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, item.w / 2);
        g.addColorStop(0, 'rgba(0,0,0,0.32)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, item.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      if (item.flip) ctx.scale(-1, 1);
      ctx.drawImage(sprite.source, -item.w / 2, -h / 2, item.w, h);
      ctx.restore();
    }
    const sel = this.selected;
    if (withChrome && sel) {
      const h = itemHeight(sel);
      const unit = Math.max(this.canvas.width, this.canvas.height) / 600;
      ctx.save();
      ctx.translate(sel.cx, sel.cy);
      ctx.rotate(sel.rot);
      ctx.setLineDash([6 * unit, 4 * unit]);
      ctx.lineWidth = 1.5 * unit;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(-sel.w / 2, -h / 2, sel.w, h);
      ctx.restore();
      const hp = handlePoint(sel);
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 9 * unit, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * unit;
      ctx.strokeStyle = '#1c1a1e';
      ctx.stroke();
    }
  }

  private toCanvas(e: PointerEvent): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.canvas.width, y: ((e.clientY - r.top) / r.height) * this.canvas.height };
  }

  private bindPointer() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.photo) return;
      const p = this.toCanvas(e);
      this.pointers.set(e.pointerId, p);
      c.setPointerCapture(e.pointerId);
      const sel = this.selected;
      if (this.pointers.size === 2 && sel) {
        const [a, b] = [...this.pointers.values()];
        this.gesture = {
          kind: 'pinch', uid: sel.uid, startW: sel.w, startRot: sel.rot, offX: 0, offY: 0,
          startDist: Math.hypot(b.x - a.x, b.y - a.y), startAngle: Math.atan2(b.y - a.y, b.x - a.x),
        };
        return;
      }
      const unit = Math.max(c.width, c.height) / 600;
      if (sel) {
        const hp = handlePoint(sel);
        if (Math.hypot(p.x - hp.x, p.y - hp.y) <= 18 * unit) {
          this.gesture = {
            kind: 'scale', uid: sel.uid, startW: sel.w, startRot: sel.rot, offX: 0, offY: 0,
            startDist: Math.hypot(p.x - sel.cx, p.y - sel.cy), startAngle: 0,
          };
          return;
        }
      }
      const hit = sel && hitItem(sel, p.x, p.y) ? sel : topItemAt(this.items, p.x, p.y);
      if (hit) {
        this.selectedUid = hit.uid;
        this.gesture = {
          kind: 'move', uid: hit.uid, startW: hit.w, startRot: hit.rot, offX: p.x - hit.cx, offY: p.y - hit.cy,
          startDist: 0, startAngle: 0,
        };
      } else {
        this.selectedUid = null;
        this.gesture = null;
      }
      this.paint(true);
      this.renderSide();
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = this.toCanvas(e);
      this.pointers.set(e.pointerId, p);
      const g = this.gesture;
      const item = g ? this.items.find((i) => i.uid === g.uid) : null;
      if (!g || !item) return;
      if (g.kind === 'move') {
        item.cx = p.x - g.offX;
        item.cy = p.y - g.offY;
      } else if (g.kind === 'scale' && g.startDist > 0) {
        item.w = Math.max(24, g.startW * (Math.hypot(p.x - item.cx, p.y - item.cy) / g.startDist));
      } else if (g.kind === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (g.startDist > 0) item.w = Math.max(24, g.startW * (d / g.startDist));
        item.rot = g.startRot + (Math.atan2(b.y - a.y, b.x - a.x) - g.startAngle);
      }
      this.paint(true);
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size === 0) this.gesture = null;
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  private adjust(fn: (item: PlacedItem) => void) {
    const sel = this.selected;
    if (!sel) return;
    fn(sel);
    this.paint(true);
  }

  private renderSide() {
    const parts: HTMLElement[] = [];
    if (this.photo) {
      const change = el('div', 'row');
      change.append(this.photoInputs());
      parts.push(change);
    }

    parts.push(el('span', 'lbl', this.photo ? 'Pick a product to place it' : 'Products'));
    const shelf = el('div', 'shelf');
    for (const p of this.products) {
      const card = el('button', 'card');
      card.type = 'button';
      const img = el('img');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      card.append(img, el('span', undefined, p.name));
      const price = formatMoney(p.price, p.currency, { fallback: '' });
      if (price) card.append(el('b', undefined, price));
      card.addEventListener('click', () => void this.place(p));
      shelf.append(card);
    }
    parts.push(shelf);

    const sel = this.selected;
    const selProduct = this.productOf(sel);
    if (sel && selProduct) {
      const box = el('div', 'sel');
      box.append(el('h4', undefined, selProduct.name));
      if (selProduct.widthM) box.append(el('p', 'note', `Real width: ${Math.round(selProduct.widthM * 100)} cm`));
      const row = el('div', 'row');
      const btn = (label: string, fn: () => void) => {
        const b = el('button', 'act', label);
        b.type = 'button';
        b.addEventListener('click', fn);
        row.append(b);
      };
      btn('Smaller', () => this.adjust((i) => { i.w = Math.max(24, i.w * 0.9); }));
      btn('Bigger', () => this.adjust((i) => { i.w *= 1.1; }));
      btn('↺', () => this.adjust((i) => { i.rot -= Math.PI / 24; }));
      btn('↻', () => this.adjust((i) => { i.rot += Math.PI / 24; }));
      btn('Flip', () => this.adjust((i) => { i.flip = !i.flip; }));
      btn('Remove', () => {
        this.items = this.items.filter((i) => i.uid !== sel.uid);
        this.selectedUid = null;
        this.paint(true);
        this.renderSide();
      });
      box.append(row);
      const cart = el('button', 'go', 'Add to cart');
      cart.type = 'button';
      cart.addEventListener('click', () => this.emitAddToCart(selProduct));
      box.append(cart);
      parts.push(box);
    }

    if (this.items.length > 0) {
      parts.push(el('p', 'hint', 'Drag to move. Drag the round corner, or pinch, to resize. Two fingers also rotate.'));
      const actions = el('div', 'row');
      const tainted = this.items.some((i) => this.sprites.get(i.productId)?.tainted);
      const save = el('button', 'act', 'Save image');
      save.type = 'button';
      save.disabled = tainted;
      save.title = tainted ? 'One of these product pictures cannot be saved into an image.' : '';
      save.addEventListener('click', () => this.saveImage());
      const ask = el('button', 'act', 'Ask for a quote');
      ask.type = 'button';
      ask.addEventListener('click', () => { this.asking = !this.asking; this.renderSide(); });
      actions.append(save, ask);
      parts.push(actions);
      if (this.asking && !this.sent) parts.push(this.quoteForm());
      if (this.sent) parts.push(el('p', 'ok', 'Thank you — we have your request and the products you placed.'));
    }
    this.side.replaceChildren(...parts);
    if (this.asking && !this.sent) this.mountChallenge();
  }

  private saveImage() {
    this.paint(false);
    this.canvas.toBlob((blob) => {
      this.paint(true);
      if (!blob) return;
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'my-space.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }

  private emitAddToCart(product: ShelfProduct) {
    const detail = {
      type: 'materialkai:add-to-cart',
      product_id: product.id,
      name: product.name,
      price: product.price,
      currency: product.currency,
      quantity: 1,
      options: {},
      option_value_ids: [],
    };
    this.dispatchEvent(new CustomEvent('materialkai:add-to-cart', { detail, bubbles: true, composed: true }));
    if (window.parent !== window) window.parent.postMessage(detail, '*');
    this.report('embed_add_to_cart');
  }

  private report(eventType: string) {
    const productId = this.selected?.productId ?? this.items[0]?.productId ?? null;
    trackEmbedEvent({ apiBase: this.apiBase, apiKey: this.apiKey, productId, eventType });
  }

  private challengeHost: HTMLDivElement | null = null;
  private errorEl: HTMLParagraphElement | null = null;
  private sendEl: HTMLButtonElement | null = null;

  private quoteForm(): HTMLDivElement {
    const form = el('div', 'quote');
    const field = (label: string, type: string, key: 'name' | 'email' | 'message') => {
      const wrap = el('label', 'f', label);
      const input = el('input');
      input.type = type;
      input.value = this.formValues[key];
      input.addEventListener('input', () => { this.formValues[key] = input.value; });
      wrap.append(input);
      form.append(wrap);
    };
    field('Name', 'text', 'name');
    field('Email', 'email', 'email');
    field('Anything we should know (optional)', 'text', 'message');
    const holder = el('div');
    form.append(holder);
    this.challengeHost = this.siteKey ? holder : null;
    const err = el('p', 'err');
    err.hidden = true;
    form.append(err);
    this.errorEl = err;
    const send = el('button', 'go', 'Send request');
    send.type = 'button';
    send.addEventListener('click', () => void this.submitQuote());
    form.append(send);
    this.sendEl = send;
    return form;
  }

  private mountChallenge() {
    const holder = this.challengeHost;
    if (!this.siteKey || !holder || holder.childElementCount > 0) return;
    loadTurnstile()
      .then((api) => {
        api.render(holder, {
          sitekey: this.siteKey,
          size: 'flexible',
          callback: (token: string) => { this.turnstileToken = token; },
          'expired-callback': () => { this.turnstileToken = ''; },
          'error-callback': () => { this.turnstileToken = ''; },
        });
      })
      .catch(() => { this.challengeHost = null; });
  }

  private setError(message: string) {
    if (!this.errorEl) return;
    this.errorEl.textContent = message;
    this.errorEl.hidden = !message;
  }

  private async submitQuote() {
    const key = this.apiKey;
    if (!key || this.sending) return;
    const { name, email, message } = this.formValues;
    if (!name.trim() || !email.trim()) { this.setError('Please give a name and an email address.'); return; }
    this.setError('');
    this.sending = true;
    if (this.sendEl) { this.sendEl.disabled = true; this.sendEl.textContent = 'Sending…'; }

    const counts = new Map<string, number>();
    for (const i of this.items) counts.set(i.productId, (counts.get(i.productId) ?? 0) + 1);
    const spec = {
      place_products: [...counts].map(([id, quantity]) => ({
        product_id: id, name: this.products.find((p) => p.id === id)?.name ?? null, quantity,
      })),
      place_photo: 'Placed on the visitor’s own photo, which stays on their device and was not sent.',
    };
    try {
      const res = await fetch(
        `${this.apiBase}/functions/v1/products-3d-api?action=request_quote&key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(), email: email.trim(), message: message.trim() || undefined, spec,
            turnstile_token: this.turnstileToken || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        this.setError(typeof body?.error === 'string' ? body.error : 'That did not send. Please try again.');
        this.sending = false;
        if (this.sendEl) { this.sendEl.disabled = false; this.sendEl.textContent = 'Send request'; }
        return;
      }
      this.sent = true;
      this.sending = false;
      this.asking = false;
      this.report('embed_place_quote');
      this.dispatchEvent(new CustomEvent('materialkai:quote-request', { bubbles: true, composed: true, detail: { spec } }));
      this.renderSide();
    } catch {
      this.setError('That did not send. Please try again.');
      this.sending = false;
      if (this.sendEl) { this.sendEl.disabled = false; this.sendEl.textContent = 'Send request'; }
    }
  }
}

if (!customElements.get('materialkai-place')) {
  customElements.define('materialkai-place', MaterialKaiPlace);
}
