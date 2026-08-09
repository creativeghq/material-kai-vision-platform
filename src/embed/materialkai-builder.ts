/**
 * `<materialkai-builder>` — the staged spec builder (#337).
 *
 *   <materialkai-builder api-key="mk_embed_…"></materialkai-builder>
 *
 * The product widget answers "show me THIS product". This answers "I want something like this —
 * what does it cost?", which is a different question with a different ending: a price only when a
 * real product matches, and otherwise a quote request.
 *
 * WHY THE FALLBACK IS THE DEFAULT, not the error case. A configurator bound to one product can
 * only ever sell what somebody already modelled and priced. A builder captures demand for things
 * that are not in the catalog yet, and that demand is the lead. So "nothing matched" is a normal,
 * successful outcome here — it is not a failure to apologise for.
 *
 * NOTHING IS PRICED LOCALLY. The widget sends the spec and renders whatever the server says. It
 * cannot compute a price even in principle: it has no catalog, and it must not appear to have one.
 */
import { formatMoney } from '@/utils/decimal';

interface SpecValue { value: string; in_catalog: boolean }
interface SpecFacet { facet_key: string; label: string; in_catalog_count: number; values: SpecValue[] }

interface ResolveResult {
  match_kind: 'exact' | 'near' | 'none';
  spec_facets: number;
  product: { product_id: string; name: string; price: number | null; currency: string } | null;
  near_matches: Array<{ product_id: string; name: string; matched_facets: number }>;
}

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';

const STYLE = `
:host { display:block; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.step { display:flex; align-items:center; gap:8px; padding-bottom:14px; }
.dot { width:22px; height:22px; border-radius:50%; display:grid; place-items:center;
       font-size:11px; font-weight:700; background:#eae4d8; color:#6b6560; }
.dot[data-on="1"] { background:#1c1a1e; color:#fff; }
.rule { flex:1; height:1px; background:#e3ddd2; }
h3 { font-size:15px; margin:0 0 3px; font-weight:650; }
p.hint { margin:0 0 14px; font-size:13px; color:#6b6560; line-height:1.5; }
.facet { padding-bottom:14px; }
.facet > .lbl { font-size:12px; color:#6b6560; padding-bottom:6px; }
.opts { display:flex; flex-wrap:wrap; gap:6px; }
.opt { font:inherit; font-size:13px; padding:5px 11px; border-radius:999px; border:1px solid #d9d4cd;
       background:#fff; color:inherit; cursor:pointer; }
.opt[aria-pressed="true"] { border-color:#1c1a1e; box-shadow:inset 0 0 0 1px #1c1a1e; }
.opt .tick { color:#2f7d50; font-size:10px; margin-left:5px; }
button.go { font:inherit; font-size:14px; padding:9px 18px; border-radius:999px; border:1px solid #1c1a1e;
            background:#1c1a1e; color:#fff; cursor:pointer; }
button.go:disabled { opacity:.45; cursor:default; }
button.ghost { font:inherit; font-size:13px; padding:8px 14px; border-radius:999px;
               border:1px solid #d9d4cd; background:#fff; color:inherit; cursor:pointer; }
.row { display:flex; gap:8px; align-items:center; padding-top:6px; }
.card { border:1px solid #e3ddd2; border-radius:10px; padding:14px; background:#fff; }
.price { font-size:22px; font-weight:700; }
.name { font-size:14px; font-weight:600; }
.muted { font-size:12px; color:#6b6560; }
label.f { display:block; padding-bottom:9px; }
label.f > span { display:block; font-size:12px; color:#6b6560; padding-bottom:4px; }
input, textarea { font:inherit; font-size:14px; width:100%; padding:8px 10px; border-radius:7px;
                  border:1px solid #d9d4cd; background:#fff; color:inherit; box-sizing:border-box; }
textarea { min-height:70px; resize:vertical; }
.near { display:flex; flex-direction:column; gap:6px; padding-top:8px; }
.near .n { display:flex; justify-content:space-between; gap:10px; font-size:13px;
           border:1px solid #e3ddd2; border-radius:7px; padding:8px 10px; }
.ok { color:#2f7d50; font-size:13px; }
.err { color:#a3341f; font-size:13px; }
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  .dot { background:#2c2833; color:#a9a2ad; } .dot[data-on="1"] { background:#f2eef2; color:#221f26; }
  .rule, .card, .near .n { border-color:#3d3745; } .card, .opt, input, textarea, button.ghost { background:#2c2833; }
  .opt, button.ghost, input, textarea { border-color:#3d3745; color:#f2eef2; }
  .opt[aria-pressed="true"] { border-color:#f2eef2; box-shadow:inset 0 0 0 1px #f2eef2; }
  button.go { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
  p.hint, .muted, .facet > .lbl, label.f > span { color:#a9a2ad; }
  .err { color:#f08a72; } .ok { color:#4fbe7e; }
}
`;

export class MaterialKaiBuilder extends HTMLElement {
  private root: ShadowRoot;
  private facets: SpecFacet[] = [];
  private spec: Record<string, string> = {};
  private stage: 1 | 2 | 3 = 1;
  private result: ResolveResult | null = null;
  private busy = false;
  private sent = false;
  private failure = '';

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    void this.loadFacets();
  }

  private get apiBase(): string {
    return (this.getAttribute('api-base') || DEFAULT_API_BASE).replace(/\/$/, '');
  }

  private get apiKey(): string {
    return this.getAttribute('api-key') || '';
  }

  private url(action: string): string {
    return `${this.apiBase}/functions/v1/products-3d-api?action=${action}&key=${encodeURIComponent(this.apiKey)}`;
  }

  private async loadFacets() {
    if (!this.apiKey) { this.failure = 'This builder is missing its embed key.'; this.render(); return; }
    try {
      const res = await fetch(this.url('spec_options'));
      const body = await res.json();
      this.facets = Array.isArray(body?.facets) ? body.facets : [];
    } catch {
      this.facets = [];
    }
    this.render();
  }

  private choose(key: string, value: string) {
    // Clicking the selected value clears it: every question is optional, because a spec is what the
    // visitor cares about, not a form they must complete.
    if (this.spec[key] === value) delete this.spec[key];
    else this.spec[key] = value;
    this.render();
  }

  private async priceIt() {
    this.busy = true; this.failure = ''; this.render();
    try {
      const res = await fetch(this.url('resolve'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spec: this.spec }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      this.result = body as ResolveResult;
      this.stage = 2;
    } catch {
      this.failure = 'Could not price that just now. Please try again.';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  private async submitQuote(name: string, email: string, message: string) {
    this.busy = true; this.failure = ''; this.render();
    try {
      const res = await fetch(this.url('request_quote'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, spec: this.spec }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      this.sent = true;
      this.stage = 3;
    } catch (e) {
      this.failure = e instanceof Error && e.message !== 'failed'
        ? e.message
        : 'Could not send that. Please try again.';
    } finally {
      this.busy = false;
      this.render();
    }
  }

  /** Hand a matched product to the product widget, so the model and AR come for free. */
  private mountProduct(host: HTMLElement, productId: string) {
    const el = document.createElement('materialkai-product');
    el.setAttribute('api-key', this.apiKey);
    el.setAttribute('product-id', productId);
    if (this.getAttribute('api-base')) el.setAttribute('api-base', this.getAttribute('api-base')!);
    host.appendChild(el);
  }

  private render() {
    const style = document.createElement('style');
    style.textContent = STYLE;

    const steps = document.createElement('div');
    steps.className = 'step';
    ['1', '2', '3'].forEach((n, i) => {
      const d = document.createElement('span');
      d.className = 'dot';
      d.dataset.on = this.stage >= i + 1 ? '1' : '0';
      d.textContent = n;
      steps.appendChild(d);
      if (i < 2) { const r = document.createElement('span'); r.className = 'rule'; steps.appendChild(r); }
    });

    const body = document.createElement('div');
    if (this.stage === 1) this.renderBuild(body);
    else if (this.stage === 2) this.renderResult(body);
    else this.renderSent(body);

    if (this.failure) {
      const e = document.createElement('p');
      e.className = 'err';
      e.textContent = this.failure;
      body.appendChild(e);
    }

    this.root.replaceChildren(style, steps, body);
  }

  private renderBuild(host: HTMLElement) {
    const h = document.createElement('h3');
    h.textContent = 'What are you looking for?';
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = this.facets.length
      ? 'Pick anything that matters to you — every question is optional.'
      : 'Tell us what you need and we will come back with a quote.';
    host.append(h, p);

    for (const f of this.facets) {
      const wrap = document.createElement('div');
      wrap.className = 'facet';
      const lbl = document.createElement('div');
      lbl.className = 'lbl';
      lbl.textContent = f.label;
      const opts = document.createElement('div');
      opts.className = 'opts';
      for (const v of f.values) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'opt';
        b.setAttribute('aria-pressed', String(this.spec[f.facet_key] === v.value));
        b.textContent = v.value;
        if (v.in_catalog) {
          // A quiet mark that this one exists today. Not a promise of a price — the server decides
          // that — but it stops the whole list looking equally likely.
          const t = document.createElement('span');
          t.className = 'tick';
          t.textContent = '●';
          t.title = 'In stock catalogue';
          b.appendChild(t);
        }
        b.addEventListener('click', () => this.choose(f.facet_key, v.value));
        opts.appendChild(b);
      }
      wrap.append(lbl, opts);
      host.appendChild(wrap);
    }

    const row = document.createElement('div');
    row.className = 'row';
    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = this.busy ? 'Checking…' : 'Price it';
    go.disabled = this.busy;
    go.addEventListener('click', () => this.priceIt());
    row.appendChild(go);

    const count = document.createElement('span');
    count.className = 'muted';
    const n = Object.keys(this.spec).length;
    count.textContent = n ? `${n} choice${n === 1 ? '' : 's'}` : 'no choices yet';
    row.appendChild(count);
    host.appendChild(row);
  }

  private renderResult(host: HTMLElement) {
    const r = this.result;
    if (!r) return;

    if (r.match_kind === 'exact' && r.product) {
      const h = document.createElement('h3');
      h.textContent = 'We have exactly that';
      host.appendChild(h);
      const card = document.createElement('div');
      card.className = 'card';
      const nm = document.createElement('div');
      nm.className = 'name';
      nm.textContent = r.product.name;
      const pr = document.createElement('div');
      pr.className = 'price';
      pr.textContent = r.product.price != null
        ? formatMoney(r.product.price, r.product.currency)
        : 'Price on request';
      card.append(nm, pr);
      // The matched product, with its model and AR, rendered by the widget that already does that.
      this.mountProduct(card, r.product.product_id);
      host.appendChild(card);
      host.appendChild(this.backRow());
      return;
    }

    const h = document.createElement('h3');
    h.textContent = 'We will quote you for it';
    const p = document.createElement('p');
    p.className = 'hint';
    // Said plainly. Nothing matched is a normal outcome, not an error, and pretending otherwise
    // teaches people that the builder is broken.
    p.textContent = r.match_kind === 'near'
      ? 'Nothing matches that exactly, so we will price it for you. A few close ones are below.'
      : 'Nothing in the catalogue matches that, so we will price it for you.';
    host.append(h, p);

    if (r.near_matches?.length) {
      const near = document.createElement('div');
      near.className = 'near';
      for (const n of r.near_matches) {
        const d = document.createElement('div');
        d.className = 'n';
        const nm = document.createElement('span');
        nm.textContent = n.name;
        const mf = document.createElement('span');
        mf.className = 'muted';
        // No price on a near match, deliberately — it is a suggestion, not an offer.
        mf.textContent = `matches ${n.matched_facets} of ${r.spec_facets}`;
        d.append(nm, mf);
        near.appendChild(d);
      }
      host.appendChild(near);
    }

    host.appendChild(this.quoteForm());
    host.appendChild(this.backRow());
  }

  private quoteForm(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.marginTop = '12px';

    const mk = (label: string, el: HTMLInputElement | HTMLTextAreaElement) => {
      const l = document.createElement('label');
      l.className = 'f';
      const s = document.createElement('span');
      s.textContent = label;
      l.append(s, el);
      return l;
    };
    const name = document.createElement('input');
    name.type = 'text'; name.autocomplete = 'name';
    const email = document.createElement('input');
    email.type = 'email'; email.autocomplete = 'email';
    const msg = document.createElement('textarea');
    msg.placeholder = 'Anything else we should know?';

    card.append(mk('Your name', name), mk('Email', email), mk('Message (optional)', msg));

    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = this.busy ? 'Sending…' : 'Request a quote';
    go.disabled = this.busy;
    go.addEventListener('click', () => {
      if (!name.value.trim() || !email.value.trim()) {
        this.failure = 'Please add your name and email so we can reply.';
        this.render();
        return;
      }
      void this.submitQuote(name.value, email.value, msg.value);
    });
    card.appendChild(go);
    return card;
  }

  private backRow(): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row';
    const back = document.createElement('button');
    back.className = 'ghost';
    back.textContent = 'Change my choices';
    back.addEventListener('click', () => { this.stage = 1; this.result = null; this.render(); });
    row.appendChild(back);
    return row;
  }

  private renderSent(host: HTMLElement) {
    const h = document.createElement('h3');
    h.textContent = 'Thanks — that is with us';
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = 'We have your specification and will come back to you with a price.';
    const ok = document.createElement('p');
    ok.className = 'ok';
    ok.textContent = Object.entries(this.spec).map(([k, v]) => `${k}: ${v}`).join(' · ') || 'Your request';
    host.append(h, p, ok);
  }
}

if (!customElements.get('materialkai-builder')) {
  customElements.define('materialkai-builder', MaterialKaiBuilder);
}
