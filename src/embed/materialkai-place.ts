/** `<materialkai-place>` (#474): products on the visitor's own photo, which is composited here and never uploaded. */
import { formatMoney } from '@/utils/decimal';
import { compareSurfaceFidelity } from '@/lib/surfaceRenderer/fidelity';
import { raster, type Raster } from '@/lib/surfaceRenderer/render';
import { trackEmbedEvent } from './embedSession';
import { loadTurnstile } from './turnstileLoader';
import { brandStyle, loadBrandFonts } from './theme';
import {
  cutoutStudioBackground, handlePoint, hitItem, itemHeight, objectSizeM, topItemAt, widthsPerMetre,
  type PlacedItem, type SpaceReading,
} from './placeGeometry';

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const PHOTO_MAX_SIDE = 1600;
const SPRITE_MAX_SIDE = 900;
const LAND_MS = 260;
const REVEAL_MS = 1400;
const READ_MAX_SIDE = 1280;

const READ_FAILED: Record<string, string> = {
  no_floor: 'We could not find the floor in this photo. A wider shot that shows the floor works best.',
  daily_cap: 'Room reading is resting for today. You can still place pieces by hand.',
  not_configured: 'Room reading is not set up yet. You can still place pieces by hand.',
};

interface ShelfProduct {
  id: string;
  name: string;
  price: number | null;
  currency: string;
  image: string;
  cutout: string | null;
  buy: { shopify_variant_id?: string; woocommerce_product_id?: string; storefront_url?: string };
  widthM: number | null;
  heightM: number | null;
}

interface Sprite {
  source: CanvasImageSource;
  aspect: number;
  cut: boolean;
  tainted: boolean;
}

const STYLE = brandStyle(`
.root { display:grid; gap:18px; animation:mk-in .35s ease both; }
.head { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
.head .t { display:grid; gap:10px; }
.hero { position:relative; overflow:hidden; display:grid; gap:24px; align-items:center; grid-template-columns:minmax(0,1fr);
        min-height:400px; padding:clamp(24px,5vw,56px); border-radius:var(--mk-radius);
        background:radial-gradient(120% 90% at 85% 10%, var(--mk-accent-soft), transparent 60%), var(--mk-muted);
        border:1px solid var(--mk-line); transition:border-color .2s ease, background .2s ease; }
.hero.drag { border-color:var(--mk-accent); background:var(--mk-accent-soft); }
@media (min-width:760px) { .hero { grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); } }
.hero .copy { display:grid; gap:18px; justify-items:start; }
.hero .mk-title { font-size:clamp(36px,5vw,58px); }
.show { position:relative; height:300px; display:none; }
@media (min-width:760px) { .show { display:block; } }
.show .frame { position:absolute; inset:8% 6% 14% 10%; border-radius:var(--mk-radius);
               background:linear-gradient(180deg, var(--mk-surface) 0 58%, var(--mk-line) 58% 100%); border:1px solid var(--mk-line); }
.show img { position:absolute; object-fit:contain; object-position:bottom; mix-blend-mode:multiply; }
.show .a { left:16%; bottom:16%; width:38%; height:56%; }
.show .b { left:52%; bottom:18%; width:30%; height:42%; }
.show .c { left:70%; bottom:14%; width:18%; height:64%; }
.show .sel { position:absolute; left:50%; bottom:16%; width:34%; height:46%; border:1.5px dashed var(--mk-ink-2);
             border-radius:4px; animation:mk-in .6s .2s ease both; }
.show .sel::after { content:''; position:absolute; right:-8px; bottom:-8px; width:14px; height:14px; border-radius:50%;
                    background:var(--mk-accent); border:2px solid var(--mk-ink); }
:host([theme="dark"]) .show .frame { background:linear-gradient(180deg, oklch(94% .01 85) 0 58%, oklch(84% .02 78) 58% 100%); }
.hero p.lead { margin:0; max-width:460px; font-size:15px; line-height:1.6; color:var(--mk-ink-2); }
.hero .row { display:flex; gap:10px; flex-wrap:wrap; }
.hero .privacy { font-size:12px; color:var(--mk-ink-2); display:flex; align-items:center; gap:8px; margin:0; }
.hero .privacy::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--mk-ok); }
.peek { display:flex; gap:8px; margin-top:6px; }
.peek img { width:56px; height:56px; object-fit:contain; border-radius:12px; background:var(--mk-surface);
            border:1px solid var(--mk-line); padding:4px; }
.peek span { align-self:center; font-size:12px; color:var(--mk-ink-2); }
.stage { position:relative; }
canvas { display:block; width:100%; height:auto; border-radius:var(--mk-radius); background:var(--mk-muted);
         touch-action:none; cursor:grab; }
canvas:active { cursor:grabbing; }
.tag { position:absolute; left:14px; top:14px; display:flex; gap:8px; align-items:baseline; padding:7px 14px;
       border-radius:999px; background:oklch(18% .025 55 / .72); color:oklch(98.5% .008 85); font-size:13px;
       backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); max-width:calc(100% - 28px); }
.tag b { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.tag i { font-style:normal; opacity:.75; font-variant-numeric:tabular-nums; white-space:nowrap; }
.tools { position:absolute; left:50%; bottom:14px; transform:translateX(-50%); display:flex; gap:2px; padding:5px;
         border-radius:999px; background:oklch(18% .025 55 / .78); backdrop-filter:blur(10px);
         -webkit-backdrop-filter:blur(10px); box-shadow:0 10px 30px oklch(18% .025 55 / .25); animation:mk-in .2s ease both; }
.tools button { min-width:38px; height:38px; padding:0 12px; border-radius:999px; border:0; background:transparent;
                color:oklch(98.5% .008 85); cursor:pointer; font-size:13px; display:grid; place-items:center; }
.tools button:hover { background:oklch(98.5% .008 85 / .12); }
.tools .sep { width:1px; margin:8px 3px; background:oklch(98.5% .008 85 / .2); }
.shelfHead { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.shelfHead span { font-size:12px; color:var(--mk-ink-2); }
.shelf { display:grid; grid-auto-flow:column; grid-auto-columns:minmax(132px,160px); gap:10px; overflow-x:auto;
         padding:2px 2px 8px; scroll-snap-type:x mandatory; scrollbar-width:thin; }
.pc { font:inherit; display:grid; gap:8px; padding:8px; border:1px solid var(--mk-line); border-radius:var(--mk-radius);
      background:var(--mk-surface); color:var(--mk-ink); cursor:pointer; text-align:left; scroll-snap-align:start;
      transition:transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
.pc:hover { transform:translateY(-2px); border-color:var(--mk-line-strong); box-shadow:0 8px 22px oklch(18% .025 55 / .08); }
.pc .im { aspect-ratio:1; border-radius:10px; background:var(--mk-muted); display:grid; place-items:center; overflow:hidden; }
:host([theme="dark"]) .pc .im, :host([theme="dark"]) .peek img { background:oklch(95% .01 85); }
.pc img, .peek img { mix-blend-mode:multiply; }
:host([theme="dark"]) .peek img { mix-blend-mode:normal; }
.pc img { width:88%; height:88%; object-fit:contain; }
.pc .nm { font-size:12.5px; line-height:1.3; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.pc .pr { font-family:var(--mk-display); font-size:17px; font-variant-numeric:tabular-nums; }
.pc .add { font-size:11px; color:var(--mk-ink-2); letter-spacing:.14em; text-transform:uppercase; }
.bar { display:flex; gap:10px; flex-wrap:wrap; align-items:center; justify-content:space-between;
       border-top:1px solid var(--mk-line); padding-top:16px; }
.bar .l, .bar .r { display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
.hint { font-size:12px; margin:0; }
.quote { display:grid; gap:12px; max-width:520px; padding:20px; border:1px solid var(--mk-line); border-radius:var(--mk-radius);
         background:var(--mk-surface); animation:mk-in .25s ease both; }
.quote .grid { display:grid; gap:10px; grid-template-columns:1fr 1fr; }
@media (max-width:620px) {
  .quote .grid { grid-template-columns:1fr; }
  .tools { position:static; transform:none; margin:10px auto 0; width:max-content; max-width:100%; overflow-x:auto; }
  .tools button { min-width:36px; padding:0 9px; }
  .tag { left:10px; top:10px; font-size:12px; padding:6px 12px; }
}
.magic { position:relative; overflow:hidden; display:inline-flex; align-items:center; gap:8px; min-height:42px;
         padding:8px 18px; border-radius:999px; border:0; cursor:pointer; font-size:14px; font-weight:500;
         color:var(--mk-accent-ink); background:linear-gradient(110deg, var(--mk-accent) 0%, oklch(86% .06 85) 45%, var(--mk-accent) 90%);
         background-size:220% 100%; animation:mk-sheen 3.2s ease-in-out infinite; }
.magic:disabled { animation:none; }
@keyframes mk-sheen { 0%,100% { background-position:100% 0; } 50% { background-position:0 0; } }
.consent { font-size:11.5px; color:var(--mk-ink-2); margin:4px 0 0; max-width:340px; }
.scan { position:absolute; inset:0; border-radius:var(--mk-radius); overflow:hidden; pointer-events:none;
        background:oklch(18% .025 55 / .18); display:grid; place-items:center; }
.scan::before { content:''; position:absolute; left:0; right:0; height:28%;
                background:linear-gradient(180deg, transparent, oklch(86% .06 85 / .55), transparent);
                animation:mk-scan 1.6s ease-in-out infinite; }
@keyframes mk-scan { from { top:-30%; } to { top:100%; } }
.scan span { position:relative; padding:9px 18px; border-radius:999px; background:oklch(18% .025 55 / .78);
             color:oklch(98.5% .008 85); font-size:13px; letter-spacing:.04em; backdrop-filter:blur(8px); }
.read { display:flex; align-items:center; gap:8px; font-size:12px; color:var(--mk-ink-2); margin:0; }
.read b { font-weight:500; color:var(--mk-ink); }
.state { padding:6px 0 0; }
.state:empty { display:none; }
.state a { color:var(--mk-ink); font-weight:500; text-underline-offset:3px; margin-left:4px; }
input[type="file"] { display:none; }
`);

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
  private body: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private status: HTMLParagraphElement;

  private products: ShelfProduct[] = [];
  private sprites = new Map<string, Sprite>();
  private photo: HTMLCanvasElement | null = null;
  private items: PlacedItem[] = [];
  private landing = new Map<number, number>();
  private selectedUid: number | null = null;
  private nextUid = 1;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { kind: 'move' | 'scale' | 'pinch'; uid: number; startW: number; startRot: number;
    offX: number; offY: number; startDist: number; startAngle: number } | null = null;

  private siteKey: string | null = null;
  private placeAi = false;
  private space: SpaceReading | null = null;
  private reading: 'idle' | 'reading' | 'done' | 'failed' = 'idle';
  private readNote = '';
  private revealAt = 0;
  private nextSpot = 0;
  private realismAllowed = false;
  private realism: { state: 'idle' | 'working' | 'shown' | 'failed'; image: HTMLImageElement | null; after: boolean; note: string } = {
    state: 'idle', image: null, after: true, note: '',
  };
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
    this.body = el('div', 'root');
    this.canvas = el('canvas');
    this.status = el('p', 'state', 'Loading…');
    this.root.append(style, this.body, this.status);
    this.bindPointer();
  }

  private get apiBase(): string {
    return (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  private get apiKey(): string | null {
    return this.getAttribute('api-key');
  }

  connectedCallback() {
    loadBrandFonts();
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

    const fromStore = this.getAttribute('catalog') === 'store';
    const picked = (this.getAttribute('product-ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    const params = new URLSearchParams({ action: fromStore ? 'form_config' : 'list', limit: '60', key });
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
          image: typeof p.cutout_url === 'string' ? p.cutout_url
            : Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : '',
          cutout: typeof p.cutout_url === 'string' ? p.cutout_url : null,
          buy: p.buy && typeof p.buy === 'object' ? p.buy as ShelfProduct['buy'] : {},
          widthM: typeof p.width_m === 'number' ? p.width_m : null,
          heightM: typeof p.height_m === 'number' ? p.height_m : null,
        }))
        .filter((p) => p.image);
      fetch(`${this.apiBase}/functions/v1/products-3d-api?action=form_config&key=${encodeURIComponent(key)}`)
        .then((r) => r.json())
        .then((b) => {
          this.siteKey = typeof b?.turnstile_site_key === 'string' ? b.turnstile_site_key : null;
          this.placeAi = b?.place_ai === true;
          this.realismAllowed = b?.realism === true;
          if (this.photo) this.render();
        })
        .catch(() => { this.siteKey = null; });
      if (fromStore) this.products = await this.loadStoreProducts();
      else void this.loadSizes(key);
    } catch {
      this.status.textContent = 'Could not reach the catalogue.';
      return;
    }
    if (this.products.length === 0) {
      this.status.textContent = fromStore
        ? 'This widget shows the products of the shop it sits on, and found none here.'
        : 'No product here has a picture to place yet.';
      return;
    }
    this.status.textContent = '';
    this.render();
  }

  private async loadStoreProducts(): Promise<ShelfProduct[]> {
    const w = window as unknown as { Shopify?: { currency?: { active?: string } } };
    if (w.Shopify) {
      const res = await fetch('/products.json?limit=60');
      const body = await res.json().catch(() => null);
      const currency = w.Shopify.currency?.active ?? 'EUR';
      return ((body?.products ?? []) as Array<Record<string, any>>).map((p) => {
        const variant = (p.variants ?? []).find((v: Record<string, any>) => v.available !== false) ?? p.variants?.[0];
        return {
          id: `shopify:${p.id}`, name: String(p.title ?? ''), price: variant ? Number(variant.price) : null, currency,
          image: String(p.images?.[0]?.src ?? ''), cutout: null, widthM: null, heightM: null,
          buy: variant ? { shopify_variant_id: String(variant.id) } : {},
        };
      }).filter((p) => p.image);
    }
    const res = await fetch('/wp-json/wc/store/v1/products?per_page=60');
    if (!res.ok) return [];
    const rows = await res.json().catch(() => null);
    if (!Array.isArray(rows)) return [];
    return (rows as Array<Record<string, any>>).map((p) => {
      const minor = Number(p.prices?.currency_minor_unit ?? 2);
      const price = Number(p.prices?.price);
      return {
        id: `woo:${p.id}`, name: String(p.name ?? ''), price: Number.isFinite(price) ? price / 10 ** minor : null,
        currency: String(p.prices?.currency_code ?? 'EUR'), image: String(p.images?.[0]?.src ?? ''),
        cutout: null, widthM: null, heightM: null, buy: { woocommerce_product_id: String(p.id) },
      };
    }).filter((p) => p.image);
  }

  private async loadSizes(key: string) {
    const ids = this.products.filter((p) => p.widthM === null && p.heightM === null).map((p) => p.id);
    if (ids.length === 0) return;
    try {
      const res = await fetch(`${this.apiBase}/functions/v1/products-3d-api?action=faces`
        + `&product_ids=${encodeURIComponent(ids.join(','))}&key=${encodeURIComponent(key)}`);
      const body = await res.json().catch(() => null);
      for (const f of (body?.faces ?? []) as Array<{ product_id: string; attributes?: unknown; metadata?: unknown }>) {
        const size = objectSizeM(f);
        const p = this.products.find((x) => x.id === f.product_id);
        if (p && size) { p.widthM = size.widthM; p.heightM = size.heightM; }
      }
    } catch {
      return;
    }
  }

  private fileInput(camera: boolean): HTMLInputElement {
    const input = el('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (camera) input.setAttribute('capture', 'environment');
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) void this.usePhoto(file);
      input.value = '';
    });
    return input;
  }

  private photoButtons(primaryLabel: string): HTMLDivElement {
    const row = el('div', 'row');
    const camera = this.fileInput(true);
    const upload = this.fileInput(false);
    const take = el('button', 'go', primaryLabel);
    take.type = 'button';
    take.addEventListener('click', () => camera.click());
    const pick = el('button', 'act', 'Upload a photo');
    pick.type = 'button';
    pick.addEventListener('click', () => upload.click());
    row.append(camera, upload, take, pick);
    return row;
  }

  private render() {
    if (!this.photo) { this.renderHero(); return; }
    const parts: HTMLElement[] = [];

    const head = el('div', 'head');
    const t = el('div', 't');
    t.append(el('p', 'mk-eyebrow', 'Product in place'));
    const title = el('h3');
    title.append('Your space, ', Object.assign(el('em'), { textContent: 'our pieces.' }));
    t.append(title);
    const change = el('div', 'row');
    const camera = this.fileInput(true);
    const upload = this.fileInput(false);
    const newPhoto = el('button', 'act', 'New photo');
    newPhoto.type = 'button';
    newPhoto.addEventListener('click', () => (matchMedia('(pointer: coarse)').matches ? camera : upload).click());
    change.append(camera, upload);
    if (this.placeAi && this.reading !== 'done') {
      const magic = el('button', 'magic', this.reading === 'reading' ? 'Reading your room…' : '\u2728 Place it for me');
      magic.type = 'button';
      magic.disabled = this.reading === 'reading';
      magic.addEventListener('click', () => void this.analyseSpace());
      change.append(magic);
    }
    change.append(newPhoto);
    head.append(t, change);
    parts.push(head);
    if (this.placeAi && this.reading === 'idle') {
      parts.push(el('p', 'consent', 'Place it for me sends this photo once for an AI reading of the floor and scale. It is not stored.'));
    }
    if (this.reading === 'done' && this.space) {
      const read = el('p', 'read');
      read.append('\u2728 ', Object.assign(el('b'), { textContent: 'Room read.' }),
        ` Pieces now stand on the floor at real size and scale as you move them${this.space.confidence === 'low' ? ' — the scale is a rough guess for this photo' : ''}.`);
      parts.push(read);
    } else if (this.reading === 'failed' && this.readNote) {
      parts.push(el('p', 'read', this.readNote));
    }

    const stage = el('div', 'stage');
    stage.append(this.canvas);
    if (this.reading === 'reading' || this.realism.state === 'working') {
      const scan = el('div', 'scan');
      scan.append(el('span', undefined, this.reading === 'reading' ? 'Reading your room…' : 'Making it realistic…'));
      stage.append(scan);
    }
    const sel = this.selected;
    const selProduct = this.productOf(sel);
    if (sel && selProduct && this.realism.state !== 'shown') {
      const tag = el('div', 'tag');
      tag.append(el('b', undefined, selProduct.name));
      const price = formatMoney(selProduct.price, selProduct.currency, { fallback: '' });
      const size = selProduct.widthM
        ? `${Math.round(selProduct.widthM * 100)} cm wide${this.space && sel.realWidthM ? ' · true to scale' : ''}`
        : '';
      const meta = [price, size].filter(Boolean).join(' · ');
      if (meta) tag.append(el('i', undefined, meta));
      stage.append(tag, this.toolbar(sel));
    }
    parts.push(stage);

    const shelfHead = el('div', 'shelfHead');
    shelfHead.append(el('p', 'mk-eyebrow', 'Tap a piece to place it'), el('span', undefined, `${this.products.length} ${this.products.length === 1 ? 'piece' : 'pieces'}`));
    parts.push(shelfHead, this.shelf());

    const bar = el('div', 'bar');
    const left = el('div', 'l');
    left.append(el('p', 'hint', this.items.length
      ? 'Drag to move. Pinch or drag the round corner to resize; two fingers rotate.'
      : 'Pick a piece below to place it in your photo.'));
    const right = el('div', 'r');
    if (this.items.length > 0) {
      const tainted = this.items.some((i) => this.sprites.get(i.productId)?.tainted);
      const save = el('button', 'act', 'Save image');
      save.type = 'button';
      save.disabled = tainted;
      save.title = tainted ? 'One of these product pictures cannot be saved into an image.' : '';
      save.addEventListener('click', () => this.saveImage());
      const ask = el('button', 'act', this.sent ? 'Request sent' : 'Ask for a quote');
      ask.type = 'button';
      ask.disabled = this.sent;
      ask.addEventListener('click', () => { this.asking = !this.asking; this.render(); });
      right.append(save, ask);
      if (this.realism.state === 'shown') {
        const toggle = el('button', 'act', this.realism.after ? 'Show before' : 'Show after');
        toggle.type = 'button';
        toggle.addEventListener('click', () => { this.realism.after = !this.realism.after; this.render(); });
        const back = el('button', 'act', 'Back to editing');
        back.type = 'button';
        back.addEventListener('click', () => { this.realism = { state: 'idle', image: null, after: true, note: '' }; this.render(); });
        right.append(toggle, back);
      } else if (this.realismAllowed) {
        const magic = el('button', 'magic', this.realism.state === 'working' ? 'Making it realistic…' : '\u2728 Make it realistic');
        magic.type = 'button';
        magic.disabled = this.realism.state === 'working' || tainted;
        magic.addEventListener('click', () => void this.makeRealistic());
        right.append(magic);
      }
      if (selProduct) {
        const cart = el('button', 'go', 'Add to cart');
        cart.type = 'button';
        cart.addEventListener('click', () => void this.emitAddToCart(selProduct));
        right.append(cart);
      }
    }
    bar.append(left, right);
    parts.push(bar);
    if (this.realismAllowed && this.items.length > 0 && this.realism.state === 'idle') {
      parts.push(el('p', 'consent', 'Make it realistic sends this picture once to an image AI to match the light and shadows. It is not kept.'));
    }
    if (this.realism.note) parts.push(el('p', 'read', this.realism.note));

    if (this.asking && !this.sent) parts.push(this.quoteForm());
    if (this.sent) parts.push(el('p', 'ok', 'Thank you — we have your request and the pieces you placed.'));

    this.body.replaceChildren(...parts);
    this.paint(true);
    if (this.asking && !this.sent) this.mountChallenge();
  }

  private renderHero() {
    const hero = el('div', 'hero');
    const copy = el('div', 'copy');
    copy.append(el('p', 'mk-eyebrow', 'Product in place'));
    const title = el('h2', 'mk-title');
    title.append('See it in ', Object.assign(el('em'), { textContent: 'your' }), ' space.');
    copy.append(
      title,
      el('p', 'lead', 'Take a photo of your room, or upload one, then place our pieces in it — move them, size them, turn them until it looks right.'),
      this.photoButtons('Take a photo'),
    );
    const peek = el('div', 'peek');
    for (const p of this.products.slice(0, 4)) {
      const img = el('img');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      peek.append(img);
    }
    if (this.products.length > 4) peek.append(el('span', undefined, `+${this.products.length - 4} more`));
    copy.append(peek, el('p', 'privacy', 'Your photo stays on your device — it is never uploaded.'));
    const show = el('div', 'show');
    show.setAttribute('aria-hidden', 'true');
    show.append(el('div', 'frame'));
    this.products.slice(0, 3).forEach((p, i) => {
      const img = el('img', ['a', 'b', 'c'][i]);
      img.src = p.image;
      img.alt = '';
      show.append(img);
    });
    if (this.products.length > 1) show.append(el('div', 'sel'));
    hero.append(copy, show);

    hero.addEventListener('dragover', (e) => { e.preventDefault(); hero.classList.add('drag'); });
    hero.addEventListener('dragleave', () => hero.classList.remove('drag'));
    hero.addEventListener('drop', (e) => {
      e.preventDefault();
      hero.classList.remove('drag');
      const file = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
      if (file) void this.usePhoto(file);
    });
    this.body.replaceChildren(hero);
  }

  private shelf(): HTMLDivElement {
    const shelf = el('div', 'shelf');
    for (const p of this.products) {
      const card = el('button', 'pc');
      card.type = 'button';
      const im = el('div', 'im');
      const img = el('img');
      img.src = p.image;
      img.alt = '';
      img.loading = 'lazy';
      im.append(img);
      card.append(im, el('span', 'nm', p.name));
      const price = formatMoney(p.price, p.currency, { fallback: '' });
      if (price) card.append(el('span', 'pr', price));
      card.append(el('span', 'add', '+ Place'));
      card.addEventListener('click', () => void this.place(p));
      shelf.append(card);
    }
    return shelf;
  }

  private toolbar(sel: PlacedItem): HTMLDivElement {
    const bar = el('div', 'tools');
    const btn = (label: string, title: string, fn: () => void) => {
      const b = el('button', undefined, label);
      b.type = 'button';
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      bar.append(b);
    };
    const sep = () => bar.append(el('span', 'sep'));
    btn('−', 'Smaller', () => this.adjust((i) => { i.w = Math.max(24, i.w * 0.9); this.rebias(i); }));
    btn('+', 'Bigger', () => this.adjust((i) => { i.w *= 1.1; this.rebias(i); }));
    sep();
    btn('↺', 'Rotate left', () => this.adjust((i) => { i.rot -= Math.PI / 24; }));
    btn('↻', 'Rotate right', () => this.adjust((i) => { i.rot += Math.PI / 24; }));
    btn('⇋', 'Flip', () => this.adjust((i) => { i.flip = !i.flip; }));
    sep();
    btn('Front', 'Bring to front', () => {
      this.items = [...this.items.filter((i) => i.uid !== sel.uid), sel];
      this.paint(true);
    });
    btn('✕', 'Remove', () => {
      this.items = this.items.filter((i) => i.uid !== sel.uid);
      this.selectedUid = null;
      this.render();
    });
    return bar;
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
      this.space = null;
      this.reading = 'idle';
      this.readNote = '';
      this.nextSpot = 0;
      this.status.textContent = '';
      this.render();
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
    if (this.realism.state === 'shown') this.realism = { state: 'idle', image: null, after: true, note: '' };
    const sprite = await this.spriteFor(product);
    if (!sprite) { this.status.textContent = `The picture of ${product.name} could not be loaded.`; return; }
    const w = Math.min(this.photo.width * 0.32, this.photo.height * 0.5 * sprite.aspect);
    const h = w / sprite.aspect;
    const offset = (this.items.length % 4) * this.photo.width * 0.04;
    const item: PlacedItem = {
      uid: this.nextUid++, productId: product.id, cx: this.photo.width / 2 + offset,
      cy: Math.min(this.photo.height * 0.62, this.photo.height - h / 2 - this.photo.height * 0.04),
      w, aspect: sprite.aspect, rot: 0, flip: false,
      realWidthM: product.widthM, realHeightM: product.heightM, bias: 1,
    };
    const spot = this.space?.spots.length ? this.space.spots[this.nextSpot++ % this.space.spots.length] : null;
    if (spot) {
      item.cx = spot.x * this.photo.width;
      this.standOn(item, spot.y * this.photo.height);
    }
    this.items.push(item);
    this.selectedUid = item.uid;
    this.status.textContent = sprite.cut ? '' : `${product.name} has a photo background we could not remove, so it is shown as it is.`;
    this.render();
    this.animateLanding(item.uid);
    this.report('embed_place_product');
  }

  private realWidthPx(item: PlacedItem, footY: number): number | null {
    if (!this.space || !this.photo) return null;
    const pxPerM = widthsPerMetre(this.space, footY / this.photo.height) * this.photo.width;
    if (pxPerM <= 0) return null;
    if (item.realWidthM) return item.realWidthM * pxPerM;
    if (item.realHeightM) return item.realHeightM * pxPerM * item.aspect;
    return null;
  }

  /** Stand the item with its base on `footY`, resized to its real size there when that is known. */
  private standOn(item: PlacedItem, footY: number) {
    const minFoot = this.space && this.photo ? (this.space.horizon_y + 0.03) * this.photo.height : 0;
    const foot = Math.max(footY, minFoot);
    const real = this.realWidthPx(item, foot);
    if (real) item.w = Math.max(16, real * (item.bias ?? 1));
    item.cy = foot - itemHeight(item) / 2;
  }

  private rebias(item: PlacedItem) {
    const real = this.realWidthPx(item, item.cy + itemHeight(item) / 2);
    if (real) item.bias = item.w / real;
  }

  private rasterOf(source: CanvasImageSource, w: number, h: number): Raster | null {
    const c = el('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, w, h);
    return raster(w, h, ctx.getImageData(0, 0, w, h).data);
  }

  private async makeRealistic() {
    const key = this.apiKey;
    if (!key || !this.photo || this.realism.state === 'working') return;
    this.realism = { state: 'working', image: null, after: true, note: '' };
    this.selectedUid = null;
    this.render();
    this.paint(false);
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(this.canvas.width, this.canvas.height));
    const c = el('canvas');
    c.width = Math.round(this.canvas.width * scale);
    c.height = Math.round(this.canvas.height * scale);
    c.getContext('2d')?.drawImage(this.canvas, 0, 0, c.width, c.height);
    const ours = this.rasterOf(c, c.width, c.height);
    const failed = (note: string) => {
      this.realism = { state: 'idle', image: null, after: true, note };
      this.render();
    };
    try {
      const res = await fetch(`${this.apiBase}/functions/v1/products-3d-api?action=realism&key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: c.toDataURL('image/jpeg', 0.85).replace(/^data:image\/jpeg;base64,/, '') }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.available || typeof body.image !== 'string') {
        failed(body?.reason === 'daily_cap'
          ? 'Realistic renders are resting for today. Your placement is unchanged.'
          : 'A realistic render is not available right now. Your placement is unchanged.');
        return;
      }
      const img = await loadImage(body.image, false);
      const theirs = this.rasterOf(img, c.width, c.height);
      const shifted = !!ours && !!theirs && this.items.some((item) => {
        const h = itemHeight(item);
        const x0 = (item.cx - item.w * 0.3) / this.photo!.width;
        const x1 = (item.cx + item.w * 0.3) / this.photo!.width;
        const y0 = (item.cy - h * 0.3) / this.photo!.height;
        const y1 = (item.cy + h * 0.3) / this.photo!.height;
        const quad = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }] as [
          { x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
        return compareSurfaceFidelity(ours, theirs, quad).verdict === 'shifted';
      });
      this.realism = {
        state: 'shown', image: img, after: !shifted,
        note: shifted
          ? 'The AI changed the colour of a piece, so we are showing your own placement. Use Show after to see its version anyway.'
          : '\u2728 Light and shadows matched to your room. The pieces kept their real colours.',
      };
      this.render();
      this.report('embed_place_ai');
    } catch {
      failed('A realistic render is not available right now. Your placement is unchanged.');
    }
  }

  private async analyseSpace() {
    const key = this.apiKey;
    if (!key || !this.photo || this.reading === 'reading') return;
    this.reading = 'reading';
    this.render();
    const scale = Math.min(1, READ_MAX_SIDE / Math.max(this.photo.width, this.photo.height));
    const c = el('canvas');
    c.width = Math.round(this.photo.width * scale);
    c.height = Math.round(this.photo.height * scale);
    c.getContext('2d')?.drawImage(this.photo, 0, 0, c.width, c.height);
    const image = c.toDataURL('image/jpeg', 0.82).replace(/^data:image\/jpeg;base64,/, '');
    try {
      const res = await fetch(`${this.apiBase}/functions/v1/products-3d-api?action=analyze_space&key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: image }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.available || !body.space) {
        this.reading = 'failed';
        this.readNote = READ_FAILED[String(body?.reason)] ?? 'Room reading is not available right now. You can still place pieces by hand.';
        this.render();
        return;
      }
      this.space = body.space as SpaceReading;
      this.reading = 'done';
      this.revealAt = performance.now();
      for (const item of this.items) this.standOn(item, item.cy + itemHeight(item) / 2);
      this.render();
      this.animateReveal();
      if (this.items.length === 0 && this.products[0]) void this.place(this.products[0]);
      this.report('embed_place_ai');
    } catch {
      this.reading = 'failed';
      this.readNote = 'Room reading is not available right now. You can still place pieces by hand.';
      this.render();
    }
  }

  private animateReveal() {
    const tick = (now: number) => {
      this.paint(true);
      if (now - this.revealAt < REVEAL_MS) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private animateLanding(uid: number) {
    const start = performance.now();
    this.landing.set(uid, 0);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / LAND_MS);
      this.landing.set(uid, t);
      this.paint(true);
      if (t < 1) requestAnimationFrame(tick);
      else this.landing.delete(uid);
    };
    requestAnimationFrame(tick);
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
    if (this.realism.state === 'shown' && this.realism.image && this.realism.after) {
      ctx.drawImage(this.realism.image, 0, 0, this.canvas.width, this.canvas.height);
      return;
    }
    if (this.realism.state === 'shown') withChrome = false;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.photo, 0, 0);
    const revealT = this.space ? (performance.now() - this.revealAt) / REVEAL_MS : 1;
    if (withChrome && this.space && revealT < 1 && this.space.floor_polygon.length >= 3) {
      const a = Math.sin(Math.min(1, revealT) * Math.PI);
      ctx.save();
      ctx.beginPath();
      this.space.floor_polygon.forEach((pt, i) => {
        const x = pt.x * this.canvas.width;
        const y = pt.y * this.canvas.height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fillStyle = `rgba(212,190,150,${0.32 * a})`;
      ctx.fill();
      ctx.lineWidth = Math.max(2, this.canvas.width / 400);
      ctx.strokeStyle = `rgba(255,248,232,${0.85 * a})`;
      ctx.stroke();
      ctx.restore();
    }
    for (const item of this.items) {
      const sprite = this.sprites.get(item.productId);
      if (!sprite) continue;
      const land = this.landing.get(item.uid);
      const ease = land === undefined ? 1 : 1 - (1 - land) ** 3;
      const h = itemHeight(item);
      ctx.save();
      ctx.globalAlpha = ease;
      ctx.translate(item.cx, item.cy + (1 - ease) * h * 0.06);
      ctx.rotate(item.rot);
      ctx.scale(0.94 + 0.06 * ease, 0.94 + 0.06 * ease);
      if (sprite.cut) {
        ctx.save();
        ctx.translate(0, h / 2);
        ctx.scale(1, 0.16);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, item.w / 2);
        g.addColorStop(0, 'rgba(20,14,8,0.34)');
        g.addColorStop(1, 'rgba(20,14,8,0)');
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
      ctx.setLineDash([5 * unit, 5 * unit]);
      ctx.lineWidth = 1.4 * unit;
      ctx.strokeStyle = 'rgba(255,250,240,0.95)';
      ctx.shadowColor = 'rgba(20,14,8,0.35)';
      ctx.shadowBlur = 4 * unit;
      ctx.strokeRect(-sel.w / 2, -h / 2, sel.w, h);
      ctx.restore();
      const hp = handlePoint(sel);
      ctx.beginPath();
      ctx.arc(hp.x, hp.y, 10 * unit, 0, Math.PI * 2);
      ctx.fillStyle = 'rgb(212,190,150)';
      ctx.shadowColor = 'rgba(20,14,8,0.35)';
      ctx.shadowBlur = 6 * unit;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2.5 * unit;
      ctx.strokeStyle = 'rgb(38,28,20)';
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
      if (!this.photo || this.realism.state === 'shown') return;
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
        if (Math.hypot(p.x - hp.x, p.y - hp.y) <= 20 * unit) {
          this.gesture = {
            kind: 'scale', uid: sel.uid, startW: sel.w, startRot: sel.rot, offX: 0, offY: 0,
            startDist: Math.hypot(p.x - sel.cx, p.y - sel.cy), startAngle: 0,
          };
          return;
        }
      }
      const hit = sel && hitItem(sel, p.x, p.y) ? sel : topItemAt(this.items, p.x, p.y);
      const changed = (hit?.uid ?? null) !== this.selectedUid;
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
      if (changed) this.render();
      else this.paint(true);
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
        if (this.space) this.standOn(item, item.cy + itemHeight(item) / 2);
      } else if (g.kind === 'scale' && g.startDist > 0) {
        item.w = Math.max(24, g.startW * (Math.hypot(p.x - item.cx, p.y - item.cy) / g.startDist));
        this.rebias(item);
      } else if (g.kind === 'pinch' && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (g.startDist > 0) item.w = Math.max(24, g.startW * (d / g.startDist));
        item.rot = g.startRot + (Math.atan2(b.y - a.y, b.x - a.x) - g.startAngle);
        this.rebias(item);
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

  private async emitAddToCart(product: ShelfProduct) {
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
    const event = new CustomEvent('materialkai:add-to-cart', { detail, bubbles: true, composed: true, cancelable: true });
    const handledByPage = !this.dispatchEvent(event);
    if (window.parent !== window) window.parent.postMessage(detail, '*');
    this.report('embed_add_to_cart');
    if (handledByPage) return;

    const w = window as unknown as Record<string, unknown>;
    try {
      if (product.buy.shopify_variant_id && w.Shopify) {
        const res = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [{ id: Number(product.buy.shopify_variant_id), quantity: 1,
            properties: /^[0-9a-f-]{36}$/i.test(product.id) ? { _materialkai_product_id: product.id } : {} }] }),
        });
        if (!res.ok) throw new Error('cart refused');
        document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));
        this.cartNote(`${product.name} is in your cart.`, '/cart');
        return;
      }
      if (product.buy.woocommerce_product_id && (w.wc_add_to_cart_params || w.woocommerce_params)) {
        const form = new URLSearchParams({ product_id: product.buy.woocommerce_product_id, quantity: '1' });
        const res = await fetch('/?wc-ajax=add_to_cart', { method: 'POST', body: form });
        if (!res.ok) throw new Error('cart refused');
        const jq = w.jQuery as ((el: unknown) => { trigger: (e: string) => void }) | undefined;
        jq?.(document.body).trigger('wc_fragment_refresh');
        this.cartNote(`${product.name} is in your cart.`, '/cart');
        return;
      }
    } catch {
      this.cartNote('The cart did not accept it. Please try again, or ask for a quote.', null);
      return;
    }
    if (product.buy.storefront_url) {
      window.open(product.buy.storefront_url, '_blank', 'noopener');
      return;
    }
    this.asking = true;
    this.render();
  }

  private cartNote(message: string, href: string | null) {
    this.status.replaceChildren(message);
    if (href) {
      const a = el('a', undefined, ' View cart');
      a.href = href;
      this.status.append(a);
    }
  }

  private report(eventType: string) {
    const first = this.selected?.productId ?? this.items[0]?.productId ?? this.products[0]?.id ?? null;
    const productId = first && /^[0-9a-f-]{36}$/i.test(first) ? first : null;
    trackEmbedEvent({ apiBase: this.apiBase, apiKey: this.apiKey, productId, eventType });
  }

  private challengeHost: HTMLDivElement | null = null;
  private errorEl: HTMLParagraphElement | null = null;
  private sendEl: HTMLButtonElement | null = null;

  private quoteForm(): HTMLDivElement {
    const form = el('div', 'quote');
    const title = el('h3');
    title.append('Ask for a ', Object.assign(el('em'), { textContent: 'quote' }));
    form.append(title, el('p', 'hint', 'We will send prices for the pieces you placed. Your photo is not sent.'));
    const grid = el('div', 'grid');
    const field = (label: string, type: string, key: 'name' | 'email' | 'message', host: HTMLElement) => {
      const wrap = el('label', 'f');
      wrap.append(el('span', undefined, label));
      const input = el('input');
      input.type = type;
      input.value = this.formValues[key];
      input.addEventListener('input', () => { this.formValues[key] = input.value; });
      wrap.append(input);
      host.append(wrap);
    };
    field('Name', 'text', 'name', grid);
    field('Email', 'email', 'email', grid);
    form.append(grid);
    field('Anything we should know (optional)', 'text', 'message', form);
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
      this.render();
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
