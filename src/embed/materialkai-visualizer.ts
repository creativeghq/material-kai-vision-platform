/**
 * `<materialkai-visualizer>` — the deterministic surface visualizer on the merchant's own page (#447).
 *
 * The renderer, the format parser and the coverage derivation are the app's own modules, bundled
 * here. Nothing is re-implemented for the embed: a visitor's count and the merchant's count come
 * from one piece of code, or they eventually disagree and only the customer finds out.
 */
import {
  renderSurface, normalizeFormat, patternWarning, hexToRgb, computeCoverage, wastageFor,
  PATTERNS, PATTERN_LABELS, COVERAGE_GAP_LABEL,
  type Pattern, type Raster, type Pt, type WastageRates, type Coverage,
} from '@/lib/surfaceRenderer';
import { loadRaster, loadMaskFor, drawRaster } from '@/components/features/visualizer/raster';
import { tileFormatM, packCoverageM2 } from '@/components/features/roomplanner/surfaceFormat';
import { trackEmbedEvent } from './embedSession';
import { appOrigin } from './appOrigin';
import { loadTurnstile } from './turnstileLoader';

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';

interface EmbedSurface {
  key: string;
  kind: string;
  quad: Array<[number, number]> | Array<{ x: number; y: number }>;
  width_cm: number;
  depth_cm: number;
  mask_url: string | null;
}

interface EmbedScene {
  id: string;
  name: string;
  room_type: string | null;
  image_url: string;
  width_px: number;
  height_px: number;
  surfaces: EmbedSurface[];
}

interface EmbedFace {
  product_id: string;
  url: string | null;
  source: 'albedo' | 'photo' | 'none';
  attributes: unknown;
  metadata: unknown;
}

interface PickerProduct {
  id: string;
  name: string;
  face: EmbedFace;
}

const STYLE = `
:host { display:block; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.wrap { display:grid; gap:14px; grid-template-columns:minmax(0,1fr); }
@media (min-width:720px) { .wrap { grid-template-columns:minmax(0,1fr) 230px; } }
canvas { display:block; width:100%; height:auto; border-radius:10px; border:1px solid #e3ddd2; background:#f6f3ee; }
.side { display:grid; gap:11px; align-content:start; }
.lbl { font-size:12px; color:#6b6560; padding-bottom:4px; display:block; }
select, input { font:inherit; font-size:13px; padding:6px 8px; border-radius:7px; border:1px solid #d9d4cd;
                background:#fff; color:inherit; width:100%; box-sizing:border-box; }
input[type="range"] { padding:0; }
.swatches { display:flex; flex-wrap:wrap; gap:5px; margin-top:6px; align-items:center; }
.sw { width:20px; height:20px; border-radius:4px; border:1px solid #d9d4cd; cursor:pointer; padding:0; }
.sw[aria-pressed="true"] { border-color:#1c1a1e; box-shadow:inset 0 0 0 1px #1c1a1e; }
.cov { border:1px solid #e3ddd2; border-radius:8px; padding:9px 10px; background:#faf8f5; display:grid; gap:2px; }
.cov h4 { margin:0 0 3px; font-size:11px; font-weight:650; }
.cr { display:flex; justify-content:space-between; gap:10px; font-size:12px; }
.cr .k { color:#6b6560; }
.cr .v { font-variant-numeric:tabular-nums; font-weight:500; }
.gap { font-size:11px; color:#8a5a12; margin:4px 0 0; line-height:1.45; }
.warn { font-size:11px; color:#8a5a12; margin:4px 0 0; line-height:1.45; }
.row { display:flex; gap:6px; flex-wrap:wrap; }
button.act { font:inherit; font-size:13px; padding:7px 13px; border-radius:7px; border:1px solid #d9d4cd;
             background:#fff; color:inherit; cursor:pointer; }
button.go { font:inherit; font-size:13px; padding:8px 15px; border-radius:7px; border:1px solid #1c1a1e;
            background:#1c1a1e; color:#fff; cursor:pointer; }
button:disabled { opacity:.55; cursor:default; }
.quote { display:grid; gap:7px; border-top:1px solid #e3ddd2; padding-top:10px; }
label.f { display:grid; gap:3px; font-size:12px; color:#6b6560; }
.state { font-size:13px; color:#6b6560; padding:16px 0; }
.err { font-size:12px; color:#a3341f; margin:0; }
.ok { font-size:12px; color:#2f7d50; margin:0; }
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  canvas { background:#2c2833; border-color:#3d3745; }
  .lbl, .cr .k, .state { color:#a9a2ad; }
  select, input, button.act, .sw { background:#221f26; border-color:#3d3745; color:#f2eef2; }
  .cov { background:#2c2833; border-color:#3d3745; }
  .quote { border-color:#3d3745; }
  .gap, .warn { color:#e0b062; }
  .err { color:#f08a72; }
  .ok { color:#4fbe7e; }
  button.go { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
  .sw[aria-pressed="true"] { border-color:#f2eef2; box-shadow:inset 0 0 0 1px #f2eef2; }
}
`;

const GROUT_SWATCHES = ['#b8b4ad', '#e8e4dc', '#8a857c', '#5a564f', '#2b2926'];

export class MaterialKaiVisualizer extends HTMLElement {
  private root: ShadowRoot;
  private canvas: HTMLCanvasElement;
  private side: HTMLDivElement;
  private status: HTMLDivElement;

  private scenes: EmbedScene[] = [];
  private products: PickerProduct[] = [];
  private wastage: WastageRates = {};
  private siteKey: string | null = null;

  private sceneId: string | null = null;
  private surfaceKey: string | null = null;
  private productId: string | null = null;
  private pattern: Pattern = 'stack';
  private groutMm = 3;
  private groutHex = '#b8b4ad';
  private rotationDeg = 0;

  private base: Raster | null = null;
  private mask: Raster | null = null;
  private face: Raster | null = null;
  private coverage: Coverage | null = null;
  private renderToken = 0;
  // One token per resource. Switching room twice quickly resolves the loads out of order, and
  // without these the second scene's surfaces get drawn onto the first scene's photo.
  private sceneToken = 0;
  private maskToken = 0;
  private faceToken = 0;
  private reportedRender = false;

  private started = false;
  private disposed = false;
  private observer: IntersectionObserver | null = null;

  // A repaint must not replace the control the visitor is holding: dragging the joint slider fires
  // `input` continuously, and rebuilding the panel detached the slider mid-drag.
  private covHost: HTMLDivElement | null = null;
  private quoteHost: HTMLDivElement | null = null;

  private asking = false;
  private sending = false;
  private sent = false;
  private turnstileToken = '';
  private challengeHost: HTMLDivElement | null = null;
  // The form is built ONCE and kept. Rebuilding it on a failed send blanked what the visitor typed
  // and threw away a solved Turnstile, so the retry could not succeed either.
  private formEl: HTMLDivElement | null = null;
  private formErrorEl: HTMLParagraphElement | null = null;
  private formSendEl: HTMLButtonElement | null = null;
  private formValues = { name: '', email: '', message: '' };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.canvas = document.createElement('canvas');
    this.side = document.createElement('div');
    this.side.className = 'side';
    this.status = document.createElement('div');
    this.status.className = 'state';
    this.status.textContent = 'Loading…';
    const wrap = document.createElement('div');
    wrap.className = 'wrap';
    const left = document.createElement('div');
    left.append(this.canvas, this.status);
    wrap.append(left, this.side);
    this.root.append(style, wrap);
  }

  private get apiBase(): string {
    return this.getAttribute('api-base') || DEFAULT_API_BASE;
  }

  private get apiKey(): string | null {
    return this.getAttribute('api-key');
  }

  connectedCallback() {
    // Moving an element in the DOM disconnects and reconnects it. Leaving `disposed` set made a
    // widget that was ever detached permanently dead.
    this.disposed = false;
    // Nothing loads until the widget is actually near the viewport: a merchant's page must not pay
    // for a room photo the visitor never scrolls to.
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
    this.disposed = true;
    this.observer?.disconnect();
    this.observer = null;
  }

  private async start() {
    if (this.started) return;
    this.started = true;
    const key = this.apiKey;
    if (!key) { this.fail('This visualizer is missing its api-key.'); return; }

    try {
      const scenesRes = await fetch(
        `${this.apiBase}/functions/v1/products-3d-api?action=scenes&key=${encodeURIComponent(key)}`,
      );
      const scenesBody = await scenesRes.json().catch(() => null);
      if (!scenesRes.ok || !scenesBody?.ok) { this.fail('Could not load the room scenes.'); return; }
      this.scenes = (scenesBody.scenes ?? []) as EmbedScene[];
      this.wastage = (scenesBody.wastage ?? {}) as WastageRates;
      this.siteKey = typeof scenesBody.turnstile_site_key === 'string' ? scenesBody.turnstile_site_key : null;

      const listRes = await fetch(
        `${this.apiBase}/functions/v1/products-3d-api?action=list&limit=24&key=${encodeURIComponent(key)}`,
      );
      // A 500 parsed as `{products: undefined}` reads as an empty catalogue, and the visitor is
      // told nothing has been published rather than that the load failed.
      if (!listRes.ok) { this.fail('Could not load the catalogue.'); return; }
      const listBody = await listRes.json().catch(() => null);
      const listed = (listBody?.products ?? []) as Array<{ product_id: string; name: string }>;
      if (listed.length > 0) {
        const ids = listed.map((p) => p.product_id).join(',');
        const facesRes = await fetch(
          `${this.apiBase}/functions/v1/products-3d-api?action=faces`
          + `&product_ids=${encodeURIComponent(ids)}&key=${encodeURIComponent(key)}`,
        );
        if (!facesRes.ok) { this.fail('Could not load the product images.'); return; }
        const facesBody = await facesRes.json().catch(() => null);
        const faces = new Map<string, EmbedFace>(
          ((facesBody?.faces ?? []) as EmbedFace[]).map((f) => [f.product_id, f]),
        );
        this.products = listed
          .map((p) => ({ id: p.product_id, name: p.name, face: faces.get(p.product_id)! }))
          .filter((p) => !!p.face && !!p.face.url);
      }
    } catch {
      this.fail('Could not reach the catalogue.');
      return;
    }
    if (this.disposed) return;

    if (this.scenes.length === 0) { this.fail('No room scenes have been published yet.'); return; }
    if (this.products.length === 0) { this.fail('No product in this catalogue has an image to lay yet.'); return; }

    const wantScene = this.getAttribute('scene-id');
    const wantProduct = this.getAttribute('product-id');
    const scene = this.scenes.find((s) => s.id === wantScene) ?? this.scenes[0];
    this.sceneId = scene.id;
    this.surfaceKey = scene.surfaces[0]?.key ?? null;
    this.productId = this.products.find((p) => p.id === wantProduct)?.id ?? this.products[0].id;

    this.status.textContent = '';
    this.drawControls();
    await this.loadScene();
  }

  private fail(message: string) {
    this.status.textContent = message;
    this.canvas.style.display = 'none';
  }

  /** Wipe the frame and say why, so a stale render is never mistaken for the current choice. */
  private clearCanvas(message: string) {
    const ctx = this.canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.status.textContent = message;
    if (this.covHost) this.covHost.replaceChildren();
  }

  private get scene(): EmbedScene | null {
    return this.scenes.find((s) => s.id === this.sceneId) ?? null;
  }

  private get surface(): EmbedSurface | null {
    return this.scene?.surfaces.find((s) => s.key === this.surfaceKey) ?? null;
  }

  private get product(): PickerProduct | null {
    return this.products.find((p) => p.id === this.productId) ?? null;
  }

  private async loadScene() {
    const scene = this.scene;
    if (!scene) return;
    const token = ++this.sceneToken;
    this.base = null;
    this.mask = null;
    let loaded: Raster;
    try {
      loaded = await loadRaster(scene.image_url, 1100);
    } catch {
      if (token === this.sceneToken) this.fail('That room photo could not be loaded.');
      return;
    }
    if (this.disposed || token !== this.sceneToken) return;
    this.base = loaded;
    await this.loadMask();
    await this.loadFace();
    if (this.disposed || token !== this.sceneToken) return;
    this.paint();
  }

  private async loadMask() {
    const surface = this.surface;
    const token = ++this.maskToken;
    this.mask = null;
    if (!surface?.mask_url || !this.base) return;
    try {
      const m = await loadMaskFor(surface.mask_url, this.base.width, this.base.height);
      if (token === this.maskToken && !this.disposed) this.mask = m;
    } catch {
      // A missing mask means the whole quad paints. Never a reason to refuse the render.
      if (token === this.maskToken) this.mask = null;
    }
  }

  private async loadFace() {
    const url = this.product?.face.url ?? null;
    const token = ++this.faceToken;
    this.face = null;
    if (!url) return;
    try {
      const f = await loadRaster(url, 512);
      if (token === this.faceToken && !this.disposed) this.face = f;
    } catch {
      if (token === this.faceToken) this.face = null;
    }
  }

  private currentFormat() {
    const face = this.product?.face;
    if (!face) return null;
    const fmt = tileFormatM({ attributes: face.attributes, metadata: face.metadata });
    return {
      format: normalizeFormat(fmt.tileWidthM * 100, fmt.tileLengthM * 100),
      assumed: fmt.formatSource === 'default',
      packM2: packCoverageM2(
        { attributes: face.attributes, metadata: face.metadata },
        fmt.tileWidthM * fmt.tileLengthM,
      ),
    };
  }

  private paint() {
    const scene = this.scene;
    const surface = this.surface;
    const spec = this.currentFormat();
    // Leaving the previous room on the canvas while the picker names a new one is worse than an
    // empty frame: the visitor believes they are looking at the thing they just chose.
    if (!this.base || !surface || !this.face || !spec || !scene) {
      this.clearCanvas(
        !surface ? 'No surface has been marked on this room yet.' : 'Nothing to draw yet.',
      );
      return;
    }
    this.status.textContent = '';

    const token = ++this.renderToken;
    const quad = (surface.quad as Array<any>).slice(0, 4).map((p: any) => {
      const x = Array.isArray(p) ? p[0] : p.x;
      const y = Array.isArray(p) ? p[1] : p.y;
      return { x: Number(x) * this.base!.width, y: Number(y) * this.base!.height };
    }) as [Pt, Pt, Pt, Pt];

    try {
      const out = renderSurface(
        this.base,
        { quad, widthCm: surface.width_cm, depthCm: surface.depth_cm, mask: this.mask ?? undefined },
        {
          face: this.face,
          format: spec.format,
          pattern: this.pattern,
          groutWidthMm: this.groutMm,
          groutColor: hexToRgb(this.groutHex),
          rotationDeg: this.rotationDeg,
        },
        { supersample: 1 },
      );
      if (token !== this.renderToken || this.disposed) return;
      drawRaster(this.canvas, out);
    } catch {
      this.fail('This surface could not be drawn.');
      return;
    }

    this.coverage = computeCoverage({
      surfaceWidthCm: surface.width_cm,
      surfaceDepthCm: surface.depth_cm,
      format: spec.format,
      formatAssumed: spec.assumed,
      groutCm: this.groutMm / 10,
      pattern: this.pattern,
      rotationDeg: this.rotationDeg,
      wastagePercent: wastageFor(this.wastage, this.pattern),
      m2PerBox: spec.packM2,
    });
    if (this.covHost) this.covHost.replaceChildren(this.coveragePanel(this.coverage));

    if (!this.reportedRender) {
      this.reportedRender = true;
      this.report('embed_visualize_surface');
    }
  }

  private report(eventType: string) {
    trackEmbedEvent({
      apiBase: this.apiBase, apiKey: this.apiKey, productId: this.productId, eventType,
    });
  }

  /** The render as the app's own URL, so the merchant reopens exactly what the visitor saw. */
  private shareLink(): string {
    const p = new URLSearchParams();
    if (this.sceneId) p.set('scene', this.sceneId);
    if (this.surfaceKey) p.set('surface', this.surfaceKey);
    if (this.productId) p.set('product', this.productId);
    if (this.pattern !== 'stack') p.set('pattern', this.pattern);
    if (this.groutMm !== 3) p.set('grout', String(this.groutMm));
    if (this.groutHex !== '#b8b4ad') p.set('groutColor', this.groutHex);
    if (this.rotationDeg !== 0) p.set('rot', String(this.rotationDeg));
    return `${appOrigin()}/visualizer?${p.toString()}`;
  }

  private field(label: string, control: HTMLElement): HTMLElement {
    const holder = document.createElement('div');
    const l = document.createElement('span');
    l.className = 'lbl';
    l.textContent = label;
    holder.append(l, control);
    return holder;
  }

  private select(options: Array<{ value: string; label: string }>, value: string | null, onChange: (v: string) => void): HTMLSelectElement {
    const el = document.createElement('select');
    for (const o of options) {
      const opt = document.createElement('option');
      opt.value = o.value;
      opt.textContent = o.label;
      el.append(opt);
    }
    if (value !== null) el.value = value;
    el.addEventListener('change', () => onChange(el.value));
    return el;
  }

  private drawControls() {
    const scene = this.scene;
    if (!scene) return;
    const parts: HTMLElement[] = [];

    parts.push(this.field('Room', this.select(
      this.scenes.map((s) => ({ value: s.id, label: s.name })),
      this.sceneId,
      (v) => {
        this.sceneId = v;
        this.surfaceKey = this.scene?.surfaces[0]?.key ?? null;
        void this.loadScene();
      },
    )));

    if (scene.surfaces.length > 1) {
      parts.push(this.field('Surface', this.select(
        scene.surfaces.map((s) => ({
          value: s.key,
          label: `${s.kind} · ${Math.round(s.width_cm / 10) / 10} × ${Math.round(s.depth_cm / 10) / 10} m`,
        })),
        this.surfaceKey,
        (v) => {
          this.surfaceKey = v;
          const token = this.maskToken + 1;
          // The mask assignment is already guarded; the PAINT was not, so the previous surface's
          // load repainted the new one before its own mask arrived — a flash of unmasked quad.
          void this.loadMask().then(() => { if (token === this.maskToken) this.paint(); });
        },
      )));
    }

    parts.push(this.field('Product', this.select(
      this.products.map((p) => ({ value: p.id, label: p.name })),
      this.productId,
      (v) => { this.productId = v; void this.loadFace().then(() => this.paint()); },
    )));

    parts.push(this.field('Pattern', this.select(
      PATTERNS.map((p) => ({ value: p, label: PATTERN_LABELS[p] })),
      this.pattern,
      (v) => { this.pattern = v as Pattern; this.paint(); },
    )));

    const spec = this.currentFormat();
    const warn = spec ? patternWarning(spec.format, this.pattern) : null;
    if (warn) {
      const w = document.createElement('p');
      w.className = 'warn';
      w.textContent = warn;
      parts.push(w);
    }

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '10';
    range.step = '0.5';
    range.value = String(this.groutMm);
    const grout = this.field(`Joint ${this.groutMm} mm`, range);
    const groutLabel = grout.querySelector('.lbl') as HTMLSpanElement | null;
    range.addEventListener('input', () => {
      this.groutMm = Number(range.value);
      if (groutLabel) groutLabel.textContent = `Joint ${this.groutMm} mm`;
      this.paint();
    });
    const swatches = document.createElement('div');
    swatches.className = 'swatches';
    for (const hex of GROUT_SWATCHES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sw';
      b.style.background = hex;
      b.setAttribute('aria-label', `Joint colour ${hex}`);
      b.setAttribute('aria-pressed', String(this.groutHex === hex));
      b.addEventListener('click', () => { this.groutHex = hex; this.paint(); });
      swatches.append(b);
    }
    grout.append(swatches);
    parts.push(grout);

    if (!this.covHost) this.covHost = document.createElement('div');
    if (this.coverage) this.covHost.replaceChildren(this.coveragePanel(this.coverage));
    parts.push(this.covHost);

    const actions = document.createElement('div');
    actions.className = 'row';
    const share = document.createElement('button');
    share.type = 'button';
    share.className = 'act';
    share.textContent = 'Copy link';
    share.addEventListener('click', () => {
      void navigator.clipboard?.writeText(this.shareLink()).catch(() => {});
      share.textContent = 'Copied';
      window.setTimeout(() => { share.textContent = 'Copy link'; }, 1600);
      this.report('embed_visualizer_share');
    });
    actions.append(share);

    if (!this.quoteHost) this.quoteHost = document.createElement('div');
    const ask = document.createElement('button');
    ask.type = 'button';
    ask.className = 'go';
    ask.textContent = 'Request a quote';
    ask.hidden = this.asking || this.sent;
    ask.addEventListener('click', () => {
      this.asking = true;
      ask.hidden = true;
      this.openQuote();
    });
    actions.append(ask);
    parts.push(actions, this.quoteHost);

    this.side.replaceChildren(...parts);
    if (this.asking && !this.sent) this.openQuote();
  }

  /** Fill the quote area once and mount the challenge once; calling again is a no-op. */
  private openQuote() {
    if (!this.quoteHost || this.sent) return;
    if (!this.formEl) {
      this.formEl = this.quoteForm();
      this.quoteHost.replaceChildren(this.formEl);
      this.mountChallenge();
    } else if (!this.quoteHost.contains(this.formEl)) {
      this.quoteHost.replaceChildren(this.formEl);
    }
  }

  private coveragePanel(c: Coverage): HTMLElement {
    const box = document.createElement('div');
    box.className = 'cov';
    const h = document.createElement('h4');
    h.textContent = 'How much you need';
    box.append(h);

    const row = (k: string, v: string) => {
      const r = document.createElement('div');
      r.className = 'cr';
      const kk = document.createElement('span');
      kk.className = 'k';
      kk.textContent = k;
      const vv = document.createElement('span');
      vv.className = 'v';
      vv.textContent = v;
      r.append(kk, vv);
      box.append(r);
    };

    row('Surface', `${c.surfaceM2.toFixed(2)} m²`);
    row('Pieces before cuts', c.piecesNet === null ? '—' : String(c.piecesNet));
    row('Cutting allowance', c.wastagePercent === null ? 'not set' : `${c.wastagePercent}%`);
    if (c.orderable) {
      row('Order', `${c.piecesGross} pieces · ${c.m2Gross?.toFixed(2)} m²`);
      row('Boxes', String(c.boxes));
    } else {
      // The missing input is named rather than the short count being shown as an order.
      for (const gap of c.gaps) {
        const p = document.createElement('p');
        p.className = 'gap';
        p.textContent = COVERAGE_GAP_LABEL[gap];
        box.append(p);
      }
    }
    return box;
  }

  private quoteForm(): HTMLDivElement {
    const form = document.createElement('div');
    form.className = 'quote';

    const mk = (label: string, input: HTMLInputElement, key: keyof typeof this.formValues) => {
      input.value = this.formValues[key];
      // Held on the component, so a failed send redisplays what the visitor typed.
      input.addEventListener('input', () => { this.formValues[key] = input.value; });
      const l = document.createElement('label');
      l.className = 'f';
      const s = document.createElement('span');
      s.textContent = label;
      l.append(s, input);
      return l;
    };

    const name = document.createElement('input');
    name.type = 'text';
    name.placeholder = 'Your name';
    const email = document.createElement('input');
    email.type = 'email';
    email.placeholder = 'you@example.com';
    const message = document.createElement('input');
    message.type = 'text';
    message.placeholder = 'Anything we should know (optional)';
    form.append(mk('Name', name, 'name'), mk('Email', email, 'email'), mk('Message', message, 'message'));

    const holder = document.createElement('div');
    form.append(holder);
    this.challengeHost = this.siteKey ? holder : null;

    const err = document.createElement('p');
    err.className = 'err';
    err.hidden = true;
    form.append(err);
    this.formErrorEl = err;

    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'go';
    send.textContent = 'Send request';
    send.addEventListener('click', () => void this.submitQuote());
    form.append(send);
    this.formSendEl = send;
    return form;
  }

  private setFormError(message: string) {
    if (!this.formErrorEl) return;
    this.formErrorEl.textContent = message;
    this.formErrorEl.hidden = !message;
  }

  private setSending(sending: boolean) {
    this.sending = sending;
    if (this.formSendEl) {
      this.formSendEl.disabled = sending;
      this.formSendEl.textContent = sending ? 'Sending…' : 'Send request';
    }
  }

  private mountChallenge() {
    if (!this.siteKey || !this.challengeHost) return;
    const holder = this.challengeHost;
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

  private async submitQuote() {
    const key = this.apiKey;
    if (!key || this.sending) return;
    const { name, email, message } = this.formValues;
    if (!name.trim() || !email.trim()) {
      this.setFormError('Please give a name and an email address.');
      return;
    }
    this.setFormError('');
    this.setSending(true);

    const c = this.coverage;
    // The render STATE, not a picture: the merchant reopens the exact composition, and a figure
    // we could not stand behind is sent as its reason instead of as a number.
    const spec: Record<string, unknown> = {
      visualizer_link: this.shareLink(),
      visualizer_scene: this.scene?.name ?? null,
      visualizer_surface: this.surfaceKey,
      visualizer_product: this.product?.name ?? null,
      visualizer_pattern: PATTERN_LABELS[this.pattern],
      visualizer_grout_mm: this.groutMm,
      visualizer_grout_color: this.groutHex,
      visualizer_rotation_deg: this.rotationDeg,
      coverage_surface_m2: c?.surfaceM2 ?? null,
      coverage_pieces_net: c?.piecesNet ?? null,
      coverage_order_pieces: c?.piecesGross ?? null,
      coverage_order_m2: c?.m2Gross ?? null,
      coverage_boxes: c?.boxes ?? null,
      coverage_is_order_quantity: c?.orderable ?? false,
      coverage_missing: (c?.gaps ?? []).join(', ') || null,
    };

    try {
      const res = await fetch(
        `${this.apiBase}/functions/v1/products-3d-api?action=request_quote&key=${encodeURIComponent(key)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim(),
            message: message.trim() || undefined,
            spec,
            turnstile_token: this.turnstileToken || undefined,
          }),
        },
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        // In place: the form keeps what was typed and the solved challenge, so the retry the
        // message invites is one the visitor can actually make.
        this.setFormError(typeof body?.error === 'string' ? body.error : 'That did not send. Please try again.');
        this.setSending(false);
        return;
      }
      this.sent = true;
      this.setSending(false);
      this.asking = false;
      this.report('embed_visualizer_quote');
      this.dispatchEvent(new CustomEvent('materialkai:quote-request', {
        bubbles: true, composed: true, detail: { spec },
      }));
      const ok = document.createElement('p');
      ok.className = 'ok';
      ok.textContent = 'Thank you — we have your request and the exact render you were looking at.';
      this.quoteHost?.replaceChildren(ok);
      this.formEl = null;
    } catch {
      this.setFormError('That did not send. Please try again.');
      this.setSending(false);
    }
  }
}

if (!customElements.get('materialkai-visualizer')) {
  customElements.define('materialkai-visualizer', MaterialKaiVisualizer);
}
