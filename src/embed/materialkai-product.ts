/**
 * `<materialkai-product>` — the embeddable product widget (#321 M1 bullet 3, #258 Phase 1).
 *
 * Drops into a merchant's own page with two lines and renders one of their published products in
 * 3D, with an AR button on phones that support it:
 *
 *   <script src="https://app.materialshub.gr/embed/materialkai-product.js" defer></script>
 *   <materialkai-product api-key="mk_embed_…" product-id="…"></materialkai-product>
 *
 * DESIGN CONSTRAINTS, all of them consequences of "this runs on someone else's website":
 *
 * • **No React.** The host page's framework is unknown and irrelevant; this is a custom element
 *   built on three.js directly. That is also why the placement math was pulled out into
 *   `modelTransform.ts` — the in-app viewer and this bundle share the FUNCTION, not a copy of it.
 * • **Shadow DOM.** The host's CSS must not reach in and our styles must not leak out. A widget
 *   that inherits `* { box-sizing }` from a random theme is a support burden with no upside.
 * • **`?key=` rather than the `x-embed-key` header.** A custom header makes the request non-simple
 *   and costs a CORS preflight on every load; a plain GET costs none. The key is publishable and
 *   already in the page source, so putting it in the query string reveals nothing new.
 * • **Never throw into the host page.** Every failure renders a quiet message in our own box.
 *   Breaking a merchant's product page because our API had a bad minute is not acceptable.
 * • **Lazy-load on visibility.** three.js plus a GLB is real weight; a widget below the fold does
 *   not pay for itself until it is seen.
 */
import {
  ACESFilmicToneMapping, AmbientLight, DirectionalLight, PerspectiveCamera, PMREMGenerator,
  Scene, SRGBColorSpace, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { TARGET_SIZE, normalizeModelTransform } from '@/components/features/ar/modelTransform';
// The SAME swap functions the in-app configurator uses. Both are React-free for exactly this
// reason: a second implementation of "recolour material X" would drift, and the cache-isolation
// bug it guards against (three shares materials across clone()) would come back here first.
import {
  applyMaterialOverrides, cloneSceneWithOwnMaterials, type MaterialOverride,
} from '@/components/features/ar/materialOverrides';
import { formatMoney } from '@/utils/decimal';
// Registers `<materialkai-builder>` in the same bundle. They ship together because the builder's
// success case IS the product widget — an exact match mounts one — and because splitting them
// would give a merchant two script tags to get right for one feature.
import './materialkai-builder';

interface EmbedModel {
  format: string;
  url: string;
  width_m: number | null;
  height_m: number | null;
  depth_m: number | null;
}

interface EmbedOptionValue {
  id: string;
  label: string;
  price_delta: number;
  base_color_hex: string | null;
  roughness: number | null;
  metalness: number | null;
  is_default: boolean;
}

interface EmbedOptionGroup {
  id: string;
  key: string;
  label: string;
  target_material_name: string | null;
  is_required: boolean;
  values: EmbedOptionValue[];
}

interface EmbedProduct {
  product_id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  images: string[];
  models: EmbedModel[];
  options?: EmbedOptionGroup[];
}

/** Where the API lives. Overridable per-element so a staging page can point elsewhere. */
const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';

/**
 * One session id per browser tab, shared by every widget on the page.
 *
 * sessionStorage rather than localStorage: "session" in the analytics sense is a visit, not a
 * person, and a persistent id across visits would be tracking the merchant never asked for.
 */
function sessionId(): string {
  const KEY = 'materialkai:embed-session';
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked (private mode, third-party cookie rules). A per-widget id is still a valid
    // session id; it just does not group.
    return crypto.randomUUID();
  }
}

// Price formatting comes from the canonical formatter, not a local copy — `decimal.ts` has no
// imports of its own, so a React-free bundle can take it as-is. tests/unit/moneyPrimitives.test.ts
// caught the local `money()` this file started with; it was the 40th copy of that same function.

const STYLE = `
:host { display:block; position:relative; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.frame { position:relative; width:100%; aspect-ratio:1/1; border-radius:12px; overflow:hidden; background:#f4f2ef; }
canvas { display:block; width:100%; height:100%; touch-action:none; }
.meta { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:10px 2px 0; }
.name { font-size:15px; font-weight:600; }
.price { font-size:15px; font-weight:600; white-space:nowrap; }
.actions { display:flex; gap:8px; padding-top:10px; }
button, a.btn {
  font:inherit; font-size:14px; padding:8px 16px; border-radius:999px; border:1px solid #d9d4cd;
  background:#fff; color:inherit; cursor:pointer; text-decoration:none; display:inline-flex;
  align-items:center; gap:6px;
}
button.primary { background:#1c1a1e; color:#fff; border-color:#1c1a1e; }
button:disabled { opacity:.5; cursor:default; }
.overlay {
  position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
  padding:16px; text-align:center; font-size:14px; color:#6b6560; background:#f4f2ef;
}
.fallback { width:100%; height:100%; object-fit:contain; }
.options { display:flex; flex-direction:column; gap:10px; padding-top:12px; }
.optgroup > .optlabel { font-size:12px; color:#6b6560; padding-bottom:5px; }
.swatches { display:flex; flex-wrap:wrap; gap:6px; }
.swatch {
  font:inherit; font-size:13px; padding:5px 11px; border-radius:999px;
  border:1px solid #d9d4cd; background:#fff; color:inherit; cursor:pointer;
  display:inline-flex; align-items:center; gap:6px;
}
.swatch[aria-pressed="true"] { border-color:#1c1a1e; box-shadow:inset 0 0 0 1px #1c1a1e; }
.dot { width:13px; height:13px; border-radius:50%; border:1px solid rgba(0,0,0,.18); }
.delta { font-size:11px; color:#6b6560; }
.violations { display:flex; flex-direction:column; gap:4px; padding-top:10px; }
.violation { margin:0; font-size:12px; color:#a3341f; }
@media (prefers-color-scheme: dark) {
  .optgroup > .optlabel, .delta { color:#a9a2ad; }
  .violation { color:#f08a72; }
  .swatch { background:#2c2833; border-color:#3d3745; color:#f2eef2; }
  .swatch[aria-pressed="true"] { border-color:#f2eef2; box-shadow:inset 0 0 0 1px #f2eef2; }
}
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  .frame, .overlay { background:#221f26; color:#a9a2ad; }
  button, a.btn { background:#2c2833; border-color:#3d3745; color:#f2eef2; }
  button.primary { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
}
`;

export class MaterialKaiProduct extends HTMLElement {
  static get observedAttributes() { return ['product-id', 'api-key', 'api-base', 'autorotate']; }

  private root: ShadowRoot;
  private frame!: HTMLDivElement;
  private overlay!: HTMLDivElement;
  private metaEl!: HTMLDivElement;
  private actionsEl!: HTMLDivElement;

  private product: EmbedProduct | null = null;
  private renderer: WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private frameHandle = 0;
  private resizeObserver: ResizeObserver | null = null;
  private observer: IntersectionObserver | null = null;
  private started = false;
  private disposed = false;

  // Configurator state (#258 Phase 2).
  private optionsEl!: HTMLDivElement;
  /** group id → chosen value id. */
  private selection: Record<string, string> = {};
  /** The loaded scene, kept so a later choice can repaint it without reloading the GLB. */
  private modelScene: import('three').Object3D | null = null;
  /** Rising counter so a slow price response cannot overwrite a newer one. */
  private priceRequest = 0;
  /**
   * Rule violations, as the SERVER evaluated them (#260 Phase 2).
   *
   * The widget has no rules engine. A local copy would eventually disagree with the one that
   * prices the line, and the visitor would be told a combination is fine right up until the
   * merchant's quote rejected it.
   */
  private violations: Array<{ type: string; when_label: string; then_label: string; note: string | null }> = [];
  private violationsEl!: HTMLDivElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.renderShell();
    // Defer everything expensive until the widget is actually near the viewport.
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        this.observer?.disconnect();
        void this.start();
      }
    }, { rootMargin: '200px' });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    this.disposed = true;
    this.observer?.disconnect();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frameHandle);
    this.controls?.dispose();
    // Explicit GL teardown: a browser allows only a handful of live WebGL contexts, and a listing
    // page that mounts and unmounts widgets would otherwise exhaust them and blank the others.
    this.renderer?.dispose();
    this.renderer?.forceContextLoss();
    this.renderer = null;
  }

  private get apiBase(): string {
    return (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  private renderShell() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.frame = document.createElement('div');
    this.frame.className = 'frame';
    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.textContent = 'Loading…';
    this.frame.appendChild(this.overlay);
    this.metaEl = document.createElement('div');
    this.metaEl.className = 'meta';
    this.optionsEl = document.createElement('div');
    this.optionsEl.className = 'options';
    this.violationsEl = document.createElement('div');
    this.violationsEl.className = 'violations';
    this.actionsEl = document.createElement('div');
    this.actionsEl.className = 'actions';
    this.root.replaceChildren(style, this.frame, this.metaEl, this.optionsEl, this.violationsEl, this.actionsEl);
  }

  private fail(message: string) {
    this.overlay.textContent = message;
    this.overlay.style.display = 'flex';
  }

  private async start() {
    if (this.started || this.disposed) return;
    this.started = true;

    const productId = this.getAttribute('product-id');
    const apiKey = this.getAttribute('api-key');
    if (!productId || !apiKey) {
      this.fail('Missing product-id or api-key.');
      return;
    }

    let product: EmbedProduct;
    try {
      const url = `${this.apiBase}/functions/v1/products-3d-api`
        + `?action=product&product_id=${encodeURIComponent(productId)}&key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // These branches are reachable only because the API answers refusals with readable CORS.
        // When it refused opaquely, `fetch` rejected with a bare TypeError and every one of these
        // collapsed into the catch below — including 403, which names the single most common
        // integration mistake and is a five-second fix in Profile → Keys.
        this.fail(
          res.status === 403 ? 'This website is not allowed to use this embed key.'
            : res.status === 401 ? 'This embed key is not valid.'
              : res.status === 429 ? 'Too many requests — please refresh in a moment.'
                : 'This product is not available.',
        );
        return;
      }
      const body = await res.json();
      product = body.product;
      if (!product) { this.fail('This product is not available.'); return; }
    } catch {
      this.fail('Could not reach the product service.');
      return;
    }
    if (this.disposed) return;

    this.product = product;
    // Default selection before first paint, so the model renders in the finish the visitor sees
    // selected rather than flashing the authored colours and correcting itself.
    for (const g of product.options ?? []) {
      const pick = g.values.find((v) => v.is_default) ?? g.values[0];
      if (pick) this.selection[g.id] = pick.id;
    }
    this.renderMeta();
    this.renderOptions();
    this.track('embed_view');

    const glb = product.models.find((m) => m.format === 'glb' || m.format === 'gltf');
    if (glb) {
      await this.mountViewer(glb.url);
    } else {
      // No geometry — show the product's own photo rather than an empty box. A merchant embedding
      // a product that has no model yet should still get something that looks intentional.
      this.showImageFallback();
    }
    this.renderActions();
  }

  private renderMeta() {
    if (!this.product) return;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = this.product.name;
    const price = document.createElement('span');
    price.className = 'price';
    price.textContent = formatMoney(this.product.price, this.product.currency);
    this.metaEl.replaceChildren(name, price);
  }

  /** The chosen value ids, in group order. */
  private selectedValueIds(): string[] {
    return (this.product?.options ?? [])
      .map((g) => this.selection[g.id])
      .filter(Boolean);
  }

  /** Visual overrides for the current selection, in the shape the shared swap function takes. */
  private currentOverrides(): MaterialOverride[] {
    const out: MaterialOverride[] = [];
    for (const g of this.product?.options ?? []) {
      // A group with no target material is a priced choice with no visual effect — an extended
      // warranty, an assembly service. It counts toward the price and paints nothing.
      if (!g.target_material_name) continue;
      const v = g.values.find((x) => x.id === this.selection[g.id]);
      if (!v) continue;
      out.push({
        targetMaterialName: g.target_material_name,
        baseColorHex: v.base_color_hex,
        roughness: v.roughness,
        metalness: v.metalness,
      });
    }
    return out;
  }

  private renderOptions() {
    const groups = this.product?.options ?? [];
    if (groups.length === 0) { this.optionsEl.replaceChildren(); return; }

    const nodes = groups.map((g) => {
      const wrap = document.createElement('div');
      wrap.className = 'optgroup';
      const label = document.createElement('div');
      label.className = 'optlabel';
      label.textContent = g.label;
      const row = document.createElement('div');
      row.className = 'swatches';

      for (const v of g.values) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.setAttribute('aria-pressed', String(this.selection[g.id] === v.id));
        if (v.base_color_hex) {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.style.backgroundColor = v.base_color_hex;
          b.appendChild(dot);
        }
        b.appendChild(document.createTextNode(v.label));
        if (Number(v.price_delta) !== 0) {
          const d = document.createElement('span');
          d.className = 'delta';
          // ONE option's authored delta, already gross from the API. The TOTAL is never assembled
          // here — it is re-asked of the server on every change.
          d.textContent = `${Number(v.price_delta) > 0 ? '+' : ''}${formatMoney(Number(v.price_delta), this.product?.currency ?? 'EUR')}`;
          b.appendChild(d);
        }
        b.addEventListener('click', () => this.choose(g.id, v.id));
        row.appendChild(b);
      }

      wrap.append(label, row);
      return wrap;
    });
    this.optionsEl.replaceChildren(...nodes);
  }

  private choose(groupId: string, valueId: string) {
    if (this.selection[groupId] === valueId) return;
    this.selection[groupId] = valueId;
    this.renderOptions();
    this.applySelectionToModel();
    void this.reprice();
    // The one event on #258's list that was never emitted. It is also the most interesting one a
    // merchant can read: a visitor who repaints the sofa four times and leaves is a different story
    // from one who never touched a swatch, and neither is visible from views and carts alone.
    //
    // Emitted on a real CHANGE, not on every render — re-selecting the current value returns above,
    // so the count means "changed their mind", not "clicked something".
    this.track('embed_configure');
  }

  /** Repaint the already-loaded scene. No reload — the geometry did not change. */
  private applySelectionToModel() {
    if (!this.modelScene) return;
    applyMaterialOverrides(this.modelScene, this.currentOverrides());
  }

  /**
   * Ask the server what this configuration costs.
   *
   * Never computed here. The widget knows each option's delta only to LABEL it; the total is a
   * money quantity with exactly one derivation, and it lives in SQL. A visitor being shown a total
   * the server would disagree with is worse than a moment of "…".
   */
  private async reprice() {
    const productId = this.getAttribute('product-id');
    const apiKey = this.getAttribute('api-key');
    if (!productId || !apiKey || !this.product) return;

    const ticket = ++this.priceRequest;
    const priceEl = this.metaEl.querySelector('.price');
    if (priceEl) priceEl.textContent = '…';

    try {
      const url = `${this.apiBase}/functions/v1/products-3d-api`
        + `?action=configure&product_id=${encodeURIComponent(productId)}&key=${encodeURIComponent(apiKey)}`
        + `&option_value_ids=${encodeURIComponent(this.selectedValueIds().join(','))}`;
      const res = await fetch(url);
      const body = await res.json();
      // A stale response from a slower earlier click must not overwrite a newer price.
      if (ticket !== this.priceRequest || this.disposed) return;
      if (res.ok && body?.configured_price != null) {
        this.product.price = body.configured_price;
      }
      // Rule violations as the server evaluated them. No local rules engine exists to disagree.
      this.violations = res.ok && Array.isArray(body?.violations) ? body.violations : [];
    } catch {
      // Leave the last known price rather than blanking it.
    } finally {
      if (ticket === this.priceRequest) {
        this.renderMeta();
        this.renderViolations();
        this.renderActions();
      }
    }
  }

  /** Show what the visitor has to change, in their words rather than the rules table's. */
  private renderViolations() {
    if (!this.violationsEl) return;
    if (this.violations.length === 0) { this.violationsEl.replaceChildren(); return; }
    const nodes = this.violations.map((v) => {
      const p = document.createElement('p');
      p.className = 'violation';
      p.textContent = v.note
        ? v.note
        : v.type === 'excludes'
          ? `${v.when_label} cannot be combined with ${v.then_label}`
          : `${v.when_label} requires ${v.then_label}`;
      return p;
    });
    this.violationsEl.replaceChildren(...nodes);
  }

  private showImageFallback() {
    const src = this.product?.images?.[0];
    if (!src) { this.fail('No preview available for this product.'); return; }
    const img = document.createElement('img');
    img.className = 'fallback';
    img.src = src;
    img.alt = this.product?.name ?? '';
    this.overlay.style.display = 'none';
    this.frame.replaceChildren(img, this.overlay);
  }

  /**
   * Android Scene Viewer, from the GLB.
   *
   * iOS is deliberately not offered. Quick Look needs a USDZ, nothing in the platform can produce
   * one, and the branch that looked for it could only ever return null — so an iPhone gets the 3D
   * viewer and no AR button, rather than a button that fails or a promise of a format that is not
   * coming (2026-08-11).
   */
  private arLink(): { href: string; ios: boolean } | null {
    if (!this.product) return null;
    const glb = this.product.models.find((m) => m.format === 'glb');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!isIOS && /Android/.test(navigator.userAgent) && glb) {
      const fallback = encodeURIComponent(location.href);
      return {
        href: `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(glb.url)}&mode=ar_preferred`
          + '#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;'
          + `S.browser_fallback_url=${fallback};end;`,
        ios: false,
      };
    }
    return null;
  }

  private renderActions() {
    const nodes: HTMLElement[] = [];

    const ar = this.arLink();
    if (ar) {
      const a = document.createElement('a');
      a.className = 'btn';
      a.href = ar.href;
      // `rel="ar"` is what makes iOS Safari open Quick Look instead of downloading the file.
      if (ar.ios) a.setAttribute('rel', 'ar');
      a.textContent = 'View in your space';
      a.addEventListener('click', () => this.track('embed_ar_launch'));
      nodes.push(a);
    }

    // "Place it" — stage 4 of the flow, and the one a widget cannot host itself (#341 join 4).
    //
    // A LINK to our hosted planner rather than a planner in this bundle: shipping React and a 3D
    // scene graph into a merchant's product page, for a feature most visitors never open, is a
    // cost every visitor pays and few use. Offered only when the product HAS a model, because
    // without one the planner has no measured size to place it at and would draw a 60 x 60
    // placeholder — inviting someone to check whether it fits, at a size nobody measured.
    if (this.product?.models.some((m) => m.format === 'glb' || m.format === 'gltf')) {
      const plan = document.createElement('a');
      plan.className = 'btn';
      plan.target = '_blank';
      plan.rel = 'noopener';
      plan.href = `${this.appOrigin()}/embed/planner`
        + `?key=${encodeURIComponent(this.getAttribute('api-key') ?? '')}`
        + `&product=${encodeURIComponent(this.getAttribute('product-id') ?? '')}`;
      plan.textContent = 'Plan your room';
      plan.addEventListener('click', () => this.track('embed_plan_room'));
      nodes.push(plan);
    }

    // Add-to-cart is opt-in: without `show-add-to-cart` the widget is a viewer, and a merchant who
    // has not wired the event should not be shown a button that does nothing.
    if (this.hasAttribute('show-add-to-cart')) {
      const btn = document.createElement('button');
      btn.className = 'primary';
      // A combination the merchant's own rules forbid must not be addable to a cart. The message
      // above says what to change; a disabled button without it would just look broken.
      const blocked = this.violations.length > 0;
      btn.disabled = blocked;
      btn.textContent = blocked ? 'Unavailable combination' : 'Add to cart';
      if (!blocked) btn.addEventListener('click', () => this.emitAddToCart());
      nodes.push(btn);
    }
    this.actionsEl.replaceChildren(...nodes);
  }

  /**
   * The add-to-cart handoff. We never take payment — we hand the merchant a payload and their own
   * cart does the rest (#258: "No checkout on our side; we hand back a payload").
   *
   * Both channels fire, because the widget can be mounted either way and the merchant should not
   * have to care: a DOM CustomEvent for the normal inline case, and postMessage for the case where
   * the widget sits in an iframe and the listener is a frame up.
   */
  private emitAddToCart() {
    if (!this.product) return;
    // The chosen options travel WITH the handoff. Without them a configured item reaches the
    // merchant's cart indistinguishable from an unconfigured one, and the person picking the order
    // has no idea which fabric was chosen. Both shapes are sent: readable labels for line-item
    // properties (what a Shopify cart displays and a picker reads), and the ids for anything that
    // needs to reconstruct the configuration exactly.
    const options: Record<string, string> = {};
    for (const g of this.product.options ?? []) {
      const v = g.values.find((x) => x.id === this.selection[g.id]);
      if (v) options[g.label] = v.label;
    }
    const detail = {
      type: 'materialkai:add-to-cart',
      product_id: this.product.product_id,
      name: this.product.name,
      price: this.product.price,
      currency: this.product.currency,
      quantity: 1,
      options,
      option_value_ids: this.selectedValueIds(),
    };
    this.dispatchEvent(new CustomEvent('materialkai:add-to-cart', {
      detail, bubbles: true, composed: true,
    }));
    // targetOrigin '*' is deliberate and safe HERE: the payload is the public product data this
    // page already renders, and we cannot know the merchant's parent origin. Nothing secret ships.
    if (window.parent !== window) window.parent.postMessage(detail, '*');
    this.track('embed_add_to_cart');
  }

  /** Fire-and-forget telemetry. Never blocks, never surfaces, never throws into the host page. */
  /**
   * Where the hosted pages live.
   *
   * Derived from the script tag's own src rather than hardcoded: the widget is served from the app
   * origin, so whatever loaded this bundle is the right host for the planner too. A constant would
   * be wrong on staging and in any self-hosted deployment.
   */
  private appOrigin(): string {
    const src = (document.currentScript as HTMLScriptElement | null)?.src
      ?? Array.from(document.querySelectorAll('script'))
        .map((s) => s.src)
        .find((u) => u.includes('materialkai-product'));
    try {
      if (src) return new URL(src).origin;
    } catch { /* fall through to the page's own origin */ }
    return location.origin;
  }

  private track(eventType: string) {
    const productId = this.getAttribute('product-id');
    const apiKey = this.getAttribute('api-key');
    if (!productId || !apiKey) return;
    const url = `${this.apiBase}/functions/v1/products-3d-api`
      + `?action=event&event_type=${encodeURIComponent(eventType)}`
      + `&product_id=${encodeURIComponent(productId)}&key=${encodeURIComponent(apiKey)}`
      + `&session_id=${encodeURIComponent(sessionId())}`
      + `&source_page=${encodeURIComponent(location.href.slice(0, 500))}`;
    // keepalive so an add-to-cart that navigates away still reports.
    fetch(url, { method: 'POST', keepalive: true }).catch(() => {});
  }

  private async mountViewer(url: string) {
    const canvas = document.createElement('canvas');
    this.frame.replaceChildren(canvas, this.overlay);

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      // No WebGL (old device, blocked GPU). The photo is a better answer than a dead grey box.
      this.showImageFallback();
      return;
    }
    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;

    const scene = new Scene();
    scene.background = null;

    // A generated room environment rather than a fetched HDR: the CSP on a merchant's site may
    // block our origin for assets, and a lit product must not depend on that.
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 1;

    scene.add(new AmbientLight(0xffffff, 0.4));
    const key = new DirectionalLight(0xffffff, 1.0);
    key.position.set(5, 8, 5);
    scene.add(key);
    const fill = new DirectionalLight(0xffffff, 0.4);
    fill.position.set(-3, 4, -2);
    scene.add(fill);

    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, TARGET_SIZE * 0.8, TARGET_SIZE * 1.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    this.controls = controls;
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 8;
    controls.target.set(0, TARGET_SIZE / 2 - 0.25, 0);
    controls.autoRotate = this.getAttribute('autorotate') !== 'false';
    controls.autoRotateSpeed = 1.2;

    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (this.disposed) return;
      // Private copies of the node tree AND materials before anything is recoloured. GLTFLoader
      // has no cache here, but two widgets on one page can load the same URL, and a configurator
      // that repaints a shared material would repaint the other widget too.
      const model = cloneSceneWithOwnMaterials(gltf.scene);
      // The SAME normalization the in-app viewer uses, imported rather than reimplemented — which
      // is what makes its guard test (an empty-bounding-box GLB placing at -Infinity) protect this
      // bundle too.
      const { scale, offset } = normalizeModelTransform(model);
      model.scale.setScalar(scale);
      model.position.copy(offset);
      // Paint the default selection BEFORE the first frame, so the visitor never sees the authored
      // colours flash and correct themselves.
      this.modelScene = model;
      this.applySelectionToModel();
      scene.add(model);
      this.overlay.style.display = 'none';
      this.track('embed_model_load');
    } catch {
      this.showImageFallback();
      return;
    }

    const resize = () => {
      const w = this.frame.clientWidth || 1;
      const h = this.frame.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize);
    this.resizeObserver.observe(this.frame);

    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
  }
}

// Guarded so a page that includes the script twice (a theme plus a manual paste — it happens)
// does not throw a "name already used" DOMException and take the page down with it.
if (!customElements.get('materialkai-product')) {
  customElements.define('materialkai-product', MaterialKaiProduct);
}
