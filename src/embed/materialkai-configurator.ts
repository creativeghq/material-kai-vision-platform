/**
 * `<materialkai-configurator>` — the tenant's own blueprint, on the tenant's own website (#382).
 *
 *   <materialkai-configurator api-key="mk_embed_…" blueprint="…"></materialkai-configurator>
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER TWO TAGS. `<materialkai-product>` shows a thing that
 * exists. `<materialkai-builder>` asks for adjectives and matches them against a catalogue. This
 * one lets a visitor BUILD something that does not exist yet — zones, module widths and counts,
 * finishes, appliances — and watch a real price move as they do.
 *
 * THE PRICE IS THE PLATFORM'S OWN DERIVATION, NOT A SECOND ONE. `deriveComposition` /
 * `composeEstimate` are imported from `@/utils/blueprintComposition` + `blueprintCompute`, which
 * are the GENERATED mirror of the edge copy that records plan money. That mirror exists, in its
 * own words, "only so an anonymous visitor sees the number the edge copy will record" — this is
 * the surface it was written for, and it took until #382 to be wired to one. A local pricer here
 * would be the shown price and the recorded price drifting apart, which is the money rule arriving
 * as a UI bug instead of a SQL one.
 *
 * WHAT THE SERVER SENDS AND DOES NOT. `products-3d-api?action=blueprint` folds every line's cost
 * basis to a single price before it leaves the server (`foldItemPricingForAnon`), so the material
 * cost, labour rate and margin behind each number never reach the page. The arithmetic below runs
 * on the folded figures and lands on the same total.
 *
 * The same guest rules as its siblings: shadow DOM, no React, never throws into the host page,
 * nothing loads until the widget is near the viewport.
 */
import type { Composition, RateItemLike, ZoneDef, ZoneConfig, ZoneGlobalDef } from '@/utils/blueprintComposition';
import {
  absorbedGroups, defaultComposition, hasComposition, rateChoices,
} from '@/utils/blueprintComposition';
import { composeEstimate, seedPlanItems } from '@/utils/blueprintCompute';
import { formatMoney } from '@/utils/decimal';

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';

interface BlueprintPayload {
  id: string;
  title: string;
  description: string | null;
  source_currency: string;
  dimensions_schema: Array<{ key: string; label: string; unit?: string; default?: number; role?: string }>;
  composition_schema: ZoneDef[];
  items: RateItemLike[];
}

const STYLE = `
:host { display:block; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.wrap { display:grid; gap:16px; }
h3 { font-size:16px; margin:0 0 2px; font-weight:650; }
p.hint { margin:0; font-size:13px; color:#6b6560; line-height:1.5; }
.zone { border:1px solid #e3ddd2; border-radius:10px; padding:14px; background:#fff; display:grid; gap:12px; }
.zoneHead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
.zoneName { font-size:14px; font-weight:650; }
.zoneLen { font-size:12px; color:#6b6560; font-variant-numeric:tabular-nums; }
.lbl { font-size:12px; color:#6b6560; padding-bottom:5px; }
.chips { display:flex; flex-wrap:wrap; gap:6px; }
.chip { font:inherit; font-size:13px; padding:5px 11px; border-radius:999px; border:1px solid #d9d4cd;
        background:#fff; color:inherit; cursor:pointer; }
.chip[aria-pressed="true"] { border-color:#1c1a1e; box-shadow:inset 0 0 0 1px #1c1a1e; }
.rows { display:grid; gap:8px; }
.row { display:grid; grid-template-columns:1fr 88px 74px 32px; gap:8px; align-items:center; }
select, input { font:inherit; font-size:13px; padding:6px 8px; border-radius:7px; border:1px solid #d9d4cd;
                background:#fff; color:inherit; width:100%; box-sizing:border-box; }
input[type="number"] { font-variant-numeric:tabular-nums; }
.iconBtn { font:inherit; font-size:15px; line-height:1; padding:6px; border-radius:7px; border:1px solid #d9d4cd;
           background:#fff; color:#6b6560; cursor:pointer; }
.addBtn { font:inherit; font-size:13px; padding:6px 12px; border-radius:999px; border:1px dashed #d9d4cd;
          background:transparent; color:#6b6560; cursor:pointer; justify-self:start; }
.total { display:flex; align-items:baseline; justify-content:space-between; gap:12px;
         border-top:1px solid #e3ddd2; padding-top:12px; }
.total .k { font-size:13px; color:#6b6560; }
.total .v { font-size:22px; font-weight:700; font-variant-numeric:tabular-nums; }
.sched { display:grid; gap:4px; }
.schedRow { display:flex; justify-content:space-between; gap:10px; font-size:12px; color:#6b6560; }
.schedRow .n { font-variant-numeric:tabular-nums; }
.issues { display:grid; gap:4px; }
.issue { margin:0; font-size:12px; color:#a3341f; }
button.go { font:inherit; font-size:14px; padding:9px 18px; border-radius:999px; border:1px solid #1c1a1e;
            background:#1c1a1e; color:#fff; cursor:pointer; justify-self:start; }
.state { font-size:13px; color:#6b6560; padding:18px 0; }
.err { font-size:13px; color:#a3341f; }
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  .zone { background:#2c2833; border-color:#3d3745; }
  .lbl, p.hint, .zoneLen, .total .k, .schedRow, .addBtn, .iconBtn, .state { color:#a9a2ad; }
  .chip, select, input, .iconBtn { background:#221f26; border-color:#3d3745; color:#f2eef2; }
  .chip[aria-pressed="true"] { border-color:#f2eef2; box-shadow:inset 0 0 0 1px #f2eef2; }
  .total, .addBtn { border-color:#3d3745; }
  button.go { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
  .issue, .err { color:#f08a72; }
}
`;

export class MaterialKaiConfigurator extends HTMLElement {
  private root: ShadowRoot;
  private bp: BlueprintPayload | null = null;
  private schema: ZoneDef[] = [];
  private config: Composition = {};
  private started = false;
  private disposed = false;
  private observer: IntersectionObserver | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.paintState('Loading…');
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
  }

  private get apiBase(): string {
    return (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  private paintState(message: string, isError = false) {
    const style = document.createElement('style');
    style.textContent = STYLE;
    const p = document.createElement('p');
    p.className = isError ? 'err' : 'state';
    p.textContent = message;
    this.root.replaceChildren(style, p);
  }

  private async start() {
    if (this.started || this.disposed) return;
    this.started = true;

    const key = this.getAttribute('api-key');
    const blueprintId = this.getAttribute('blueprint');
    if (!key || !blueprintId) {
      this.paintState('Missing api-key or blueprint.', true);
      return;
    }

    try {
      const url = `${this.apiBase}/functions/v1/products-3d-api`
        + `?action=blueprint&blueprint_id=${encodeURIComponent(blueprintId)}&key=${encodeURIComponent(key)}`;
      const res = await fetch(url);
      if (!res.ok) {
        // Readable because the API answers refusals with permissive CORS — see embed-key.ts.
        this.paintState(
          res.status === 403 ? 'This website is not allowed to use this embed key.'
            : res.status === 401 ? 'This embed key is not valid.'
              : res.status === 429 ? 'Too many requests — please refresh in a moment.'
                : 'This configurator is not available.',
          true,
        );
        return;
      }
      const body = await res.json();
      this.bp = body?.blueprint ?? null;
    } catch {
      this.paintState('Could not reach the configurator service.', true);
      return;
    }
    if (this.disposed) return;

    if (!this.bp || !hasComposition(this.bp.composition_schema)) {
      // A blueprint with no ZONES is a flat task list. It is a perfectly good blueprint for an
      // operator and it is not a configurator, so say that rather than rendering an empty frame.
      this.paintState('This configurator is not available.', true);
      return;
    }

    this.schema = this.bp.composition_schema;
    // Deterministic row ids rather than randomUUID, matching the in-app seeding: an id that
    // changes between renders would make every row look new to the diffing below.
    this.config = defaultComposition(this.schema, this.bp.items, (z, i) => `${z}-${i}`);
    this.render();
  }

  /** Base dimensions from the blueprint's own schema, before the zones publish theirs. */
  private baseDims(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const d of this.bp?.dimensions_schema ?? []) {
      if (typeof d.default === 'number') out[d.key] = d.default;
    }
    return out;
  }

  /**
   * The whole derivation, re-run from scratch on every change.
   *
   * Deliberately not incremental. A zone's length feeds another zone's, which feeds the formula
   * variables every line prices against, so a partial update is a wrong total — and a wrong total
   * is a valid number that nothing downstream can catch.
   */
  private compute() {
    const items = this.bp?.items ?? [];
    const absorbed = new Set(absorbedGroups(this.schema));
    const base = this.baseDims();
    // Seed once against the base dims, then let composeEstimate reprice with the derived vars.
    const flat = seedPlanItems(items, base, absorbed);
    return composeEstimate(this.schema, this.config, items, base, flat);
  }

  private zoneCfg(key: string): ZoneConfig {
    return (this.config[key] ??= {});
  }

  private setGlobal(zoneKey: string, g: ZoneGlobalDef, value: number | string | string[]) {
    const cfg = this.zoneCfg(zoneKey);
    cfg.globals = { ...(cfg.globals ?? {}), [g.key]: value };
    this.render();
  }

  private renderGlobal(zone: ZoneDef, g: ZoneGlobalDef): HTMLElement {
    const wrap = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'lbl';
    label.textContent = g.unit ? `${g.label} (${g.unit})` : g.label;
    wrap.appendChild(label);

    const current = this.zoneCfg(zone.key).globals?.[g.key];

    if (g.type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.value = String(typeof current === 'number' ? current : (g.default ?? 0));
      input.addEventListener('change', () => {
        this.setGlobal(zone.key, g, Number(input.value) || 0);
      });
      wrap.appendChild(input);
      return wrap;
    }

    const row = document.createElement('div');
    row.className = 'chips';

    // An option global's choices ARE the bound rate table's members — the price list the zone
    // uses. Read from the blueprint's own items so the labels are the merchant's.
    const choices = g.type === 'option'
      ? rateChoices(this.bp?.items ?? [], g.option_group).map((c) => ({ value: c.id, label: c.label }))
      : (g.choices ?? []).map((c) => ({ value: c.value, label: c.label }));

    for (const c of choices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      const on = g.multi
        ? Array.isArray(current) && current.includes(c.value)
        : current === c.value;
      b.setAttribute('aria-pressed', String(on));
      b.textContent = c.label;
      b.addEventListener('click', () => {
        if (g.multi) {
          // A multi global holds several answers at once ("we have electricity AND gas").
          const list = Array.isArray(current) ? [...current] : [];
          const at = list.indexOf(c.value);
          if (at >= 0) list.splice(at, 1); else list.push(c.value);
          this.setGlobal(zone.key, g, list);
        } else {
          this.setGlobal(zone.key, g, c.value);
        }
      });
      row.appendChild(b);
    }
    wrap.appendChild(row);
    return wrap;
  }

  private renderModules(zone: ZoneDef): HTMLElement {
    const wrap = document.createElement('div');
    const label = document.createElement('div');
    label.className = 'lbl';
    label.textContent = 'Units';
    const rows = document.createElement('div');
    rows.className = 'rows';

    const cfg = this.zoneCfg(zone.key);
    cfg.modules ??= [];

    cfg.modules.forEach((m, idx) => {
      const row = document.createElement('div');
      row.className = 'row';

      const type = document.createElement('select');
      for (const mt of zone.modules ?? []) {
        const opt = document.createElement('option');
        opt.value = mt.key;
        opt.textContent = mt.label;
        opt.selected = mt.key === m.type;
        type.appendChild(opt);
      }
      type.addEventListener('change', () => {
        const picked = (zone.modules ?? []).find((x) => x.key === type.value);
        m.type = type.value;
        // Take the new type's own default width. Carrying the old one over silently prices a
        // 90cm corner unit as whatever the previous module happened to be.
        if (picked) m.width_cm = picked.default_width_cm ?? m.width_cm;
        this.render();
      });

      const width = document.createElement('input');
      width.type = 'number';
      width.min = '0';
      width.step = '1';
      width.value = String(m.width_cm ?? 0);
      width.setAttribute('aria-label', 'Width in centimetres');
      width.addEventListener('change', () => { m.width_cm = Number(width.value) || 0; this.render(); });

      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '1';
      qty.step = '1';
      qty.value = String(m.qty ?? 1);
      qty.setAttribute('aria-label', 'How many');
      qty.addEventListener('change', () => { m.qty = Math.max(1, Number(qty.value) || 1); this.render(); });

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'iconBtn';
      del.textContent = '×';
      del.setAttribute('aria-label', `Remove ${m.type}`);
      del.addEventListener('click', () => { cfg.modules!.splice(idx, 1); this.render(); });

      row.append(type, width, qty, del);
      rows.appendChild(row);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'addBtn';
    add.textContent = '+ Add a unit';
    add.addEventListener('click', () => {
      const first = (zone.modules ?? [])[0];
      if (!first) return;
      cfg.modules!.push({
        id: `${zone.key}-${cfg.modules!.length}-${cfg.modules!.length}`,
        type: first.key,
        width_cm: first.default_width_cm ?? 60,
        qty: 1,
      });
      this.render();
    });

    wrap.append(label, rows, add);
    return wrap;
  }

  private render() {
    if (!this.bp) return;
    const style = document.createElement('style');
    style.textContent = STYLE;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const head = document.createElement('div');
    const h = document.createElement('h3');
    h.textContent = this.bp.title;
    head.appendChild(h);
    if (this.bp.description) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = this.bp.description;
      head.appendChild(p);
    }
    wrap.appendChild(head);

    const composed = this.compute();

    for (const zone of this.schema) {
      const card = document.createElement('div');
      card.className = 'zone';

      const zh = document.createElement('div');
      zh.className = 'zoneHead';
      const name = document.createElement('span');
      name.className = 'zoneName';
      name.textContent = zone.label;
      zh.appendChild(name);

      // The DERIVED length, shown where the operator's UI shows it — this is the number that used
      // to be typed into a slider and is now a consequence of the layout.
      const derivedZone = composed?.derived.zones?.find((z) => z.key === zone.key);
      if (derivedZone && typeof derivedZone.length_m === 'number') {
        const len = document.createElement('span');
        len.className = 'zoneLen';
        len.textContent = `${derivedZone.length_m.toFixed(2)} m`;
        zh.appendChild(len);
      }
      card.appendChild(zh);

      for (const g of zone.globals ?? []) card.appendChild(this.renderGlobal(zone, g));
      if ((zone.modules ?? []).length > 0) card.appendChild(this.renderModules(zone));

      wrap.appendChild(card);
    }

    // Issues the engine raised — a placement with nothing to sit in, a derived count no schedule
    // line consumes. Shown rather than swallowed: they are the difference between a confident
    // total and a kitchen that can actually be built.
    const issues = composed?.derived.issues ?? [];
    if (issues.length) {
      const box = document.createElement('div');
      box.className = 'issues';
      for (const i of issues) {
        const p = document.createElement('p');
        p.className = 'issue';
        p.textContent = i;
        box.appendChild(p);
      }
      wrap.appendChild(box);
    }

    // The hardware/service schedule: counts, never prices. The plan counts and the quote prices,
    // which is why a row here carries a quantity and a unit and no money at all.
    const schedule = (composed?.derived.schedule ?? []).filter((r) => r.quantity > 0);
    if (schedule.length) {
      const box = document.createElement('div');
      box.className = 'sched';
      for (const r of schedule) {
        const row = document.createElement('div');
        row.className = 'schedRow';
        const l = document.createElement('span');
        l.textContent = r.label;
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = r.unit ? `${r.quantity} ${r.unit}` : String(r.quantity);
        row.append(l, n);
        box.appendChild(row);
      }
      wrap.appendChild(box);
    }

    const total = document.createElement('div');
    total.className = 'total';
    const tk = document.createElement('span');
    tk.className = 'k';
    tk.textContent = 'Estimated total';
    const tv = document.createElement('span');
    tv.className = 'v';
    tv.textContent = formatMoney(composed?.subtotal ?? 0, this.bp.source_currency || 'EUR');
    total.append(tk, tv);
    wrap.appendChild(total);

    const cta = document.createElement('button');
    cta.className = 'go';
    cta.type = 'button';
    cta.textContent = 'Request a quote';
    cta.addEventListener('click', () => this.emitQuoteRequest(composed?.subtotal ?? 0));
    wrap.appendChild(cta);

    this.root.replaceChildren(style, wrap);
  }

  /**
   * Hand the merchant the whole configuration.
   *
   * The COMPOSITION travels, not just the total — it is what an operator needs to open this as a
   * real plan rather than reading a number and re-typing the kitchen. Turning that into a
   * `project_plans` row server-side is #382 Phase 4; emitting it now means a merchant who wants to
   * wire their own form is not blocked on that, and the payload shape does not change when it
   * lands.
   *
   * Both channels, same reason as the product widget's add-to-cart: the tag may be mounted inline
   * or in an iframe and the merchant should not have to care.
   */
  private emitQuoteRequest(total: number) {
    const detail = {
      type: 'materialkai:quote-request',
      blueprint_id: this.bp?.id,
      title: this.bp?.title,
      composition: this.config,
      estimated_total: total,
      currency: this.bp?.source_currency ?? 'EUR',
    };
    this.dispatchEvent(new CustomEvent('materialkai:quote-request', {
      detail, bubbles: true, composed: true,
    }));
    if (window.parent !== window) window.parent.postMessage(detail, '*');
  }
}

if (!customElements.get('materialkai-configurator')) {
  customElements.define('materialkai-configurator', MaterialKaiConfigurator);
}
