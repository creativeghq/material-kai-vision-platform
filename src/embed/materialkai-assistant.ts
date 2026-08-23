/**
 * `<materialkai-assistant>` — the platform's tools on a merchant's page (#382 Phase 3).
 *
 *   <materialkai-assistant api-key="mk_embed_…"></materialkai-assistant>
 *
 * NOT A CHAT BOX, ON PURPOSE. A blinking cursor is the facet wizard's emptiness in a different
 * shape: most visitors do not know what to type, and every keystroke would bill the merchant a
 * model turn. This opens as BUTTONS. Each one calls `embed-agent?action=run`, which invokes one
 * allowlisted tool directly — no model, no tokens, no Anthropic spend — and returns the merchant's
 * own data.
 *
 * EVERY RESULT IS RENDERED. This is the rule the in-app agent learned the hard way: a handler that
 * only logs is the bug, and it bites hardest on a deterministic run because there is no prose to
 * fall back on — the visitor gets a cheerful "done" over an empty screen. So each tool has a real
 * renderer here, and `renderUnknown` is the backstop: a shape nobody anticipated still shows its
 * own contents rather than disappearing.
 *
 * Guest rules as its siblings: shadow DOM, no React, never throws into the host page, nothing runs
 * until the widget is near the viewport.
 */
import { formatMoney } from '@/utils/decimal';
import { referralLink } from './appOrigin';

const DEFAULT_API_BASE = 'https://bgbavxtjlbvgplozizxu.supabase.co';

interface PublicToolInfo { name: string; label: string; writes: boolean }

/** What the assistant said about the last result, if the key may spend on that. */
interface AskState { asking: boolean; answer: string | null; pending: boolean }

const STYLE = `
:host { display:block; font-family:system-ui,-apple-system,'Segoe UI',sans-serif; color:#1c1a1e; }
.card { border:1px solid #e3ddd2; border-radius:12px; padding:16px; background:#fff; display:grid; gap:14px; }
h3 { font-size:15px; margin:0; font-weight:650; }
p.hint { margin:0; font-size:13px; color:#6b6560; line-height:1.5; }
.actions { display:flex; flex-wrap:wrap; gap:8px; }
button.act { font:inherit; font-size:13px; padding:7px 14px; border-radius:999px; border:1px solid #d9d4cd;
             background:#fff; color:inherit; cursor:pointer; }
button.act[aria-pressed="true"] { border-color:#1c1a1e; box-shadow:inset 0 0 0 1px #1c1a1e; }
button.act:disabled { opacity:.5; cursor:default; }
.form { display:grid; gap:8px; }
label.f { display:grid; gap:4px; font-size:12px; color:#6b6560; }
input, textarea { font:inherit; font-size:14px; padding:8px 10px; border-radius:7px; border:1px solid #d9d4cd;
                  background:#fff; color:inherit; box-sizing:border-box; width:100%; }
button.go { font:inherit; font-size:14px; padding:9px 18px; border-radius:999px; border:1px solid #1c1a1e;
            background:#1c1a1e; color:#fff; cursor:pointer; justify-self:start; }
button.go:disabled { opacity:.45; cursor:default; }
.result { border-top:1px solid #e3ddd2; padding-top:12px; display:grid; gap:8px; }
.headline { font-size:20px; font-weight:700; font-variant-numeric:tabular-nums; }
.sub { font-size:13px; color:#6b6560; }
ul.rows { list-style:none; margin:0; padding:0; display:grid; gap:5px; }
ul.rows li { display:flex; justify-content:space-between; gap:10px; font-size:13px; }
ul.rows .n { font-variant-numeric:tabular-nums; color:#6b6560; }
.kv { display:grid; gap:3px; font-size:12.5px; }
.kv div { display:flex; justify-content:space-between; gap:10px; }
.kv .k { color:#6b6560; }
.err { font-size:13px; color:#a3341f; margin:0; }
.attrib { margin:0; font-size:11px; color:#8b857f; }
.attrib a { color:inherit; }
.ok { font-size:13px; color:#2f7d50; margin:0; }
@media (prefers-color-scheme: dark) {
  :host { color:#f2eef2; }
  .card { background:#2c2833; border-color:#3d3745; }
  p.hint, .sub, ul.rows .n, .kv .k, label.f { color:#a9a2ad; }
  button.act, input, textarea { background:#221f26; border-color:#3d3745; color:#f2eef2; }
  button.act[aria-pressed="true"] { border-color:#f2eef2; box-shadow:inset 0 0 0 1px #f2eef2; }
  button.go { background:#f2eef2; color:#221f26; border-color:#f2eef2; }
  .result { border-color:#3d3745; }
  .err { color:#f08a72; } .ok { color:#4fbe7e; }
  .attrib { color:#8b8394; }
}
`;

export class MaterialKaiAssistant extends HTMLElement {
  private root: ShadowRoot;
  private tools: PublicToolInfo[] = [];
  private active: string | null = null;
  private result: Record<string, unknown> | null = null;
  private busy = false;
  private ask: AskState = { asking: false, answer: null, pending: false };
  /**
   * The embedder's referral code, when their workspace has one enabled.
   *
   * This is the half of attribution the key cannot do on its own. A visitor who requests a quote
   * today already belongs to the embedder; this is the one who reads a calculator, leaves, and
   * signs up later — the code makes them the embedder's CLIENT rather than an anonymous arrival.
   */
  private referralCode: string | null = null;
  private failure = '';
  private started = false;
  private disposed = false;
  private observer: IntersectionObserver | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
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

  private get apiKey(): string {
    return this.getAttribute('api-key') || '';
  }

  private url(action: string): string {
    return `${this.apiBase}/functions/v1/embed-agent?action=${action}&key=${encodeURIComponent(this.apiKey)}`;
  }

  private async start() {
    if (this.started || this.disposed) return;
    this.started = true;
    if (!this.apiKey) { this.failure = 'This assistant is missing its embed key.'; this.render(); return; }
    try {
      const res = await fetch(this.url('capabilities'));
      if (!res.ok) {
        this.failure = res.status === 403 ? 'This website is not allowed to use this embed key.'
          : res.status === 401 ? 'This embed key is not valid.'
            : 'The assistant is not available right now.';
        this.render();
        return;
      }
      const body = await res.json();
      // The one WRITE is not offered as a bare button here. It needs a name and an email, which is
      // a form, and a form the visitor did not ask for is noise on a product page — it appears
      // after a result, where asking for it makes sense.
      this.tools = (body?.tools ?? []).filter((t: PublicToolInfo) => !t.writes);
      this.referralCode = typeof body?.referral_code === 'string' ? body.referral_code : null;
    } catch {
      this.failure = 'Could not reach the assistant.';
    }
    this.render();
  }

  private async run(name: string, args: Record<string, unknown>) {
    this.busy = true; this.failure = ''; this.render();
    try {
      const res = await fetch(this.url('run'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: name, args }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? 'failed');
      this.result = (body?.result ?? null) as Record<string, unknown> | null;
      // A new result invalidates the previous explanation — it described the old one.
      this.ask = { asking: false, answer: null, pending: false };
    } catch {
      this.failure = 'That did not work. Please try again.';
      this.result = null;
    } finally {
      this.busy = false;
      this.render();
    }
  }

  // ── Renderers, one per tool, plus a backstop ─────────────────────────────────────────────────

  private renderSpecResult(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    const product = r.product as Record<string, unknown> | null;

    if (product) {
      const h = document.createElement('div');
      h.className = 'headline';
      const price = (product.price ?? product.net_price) as number | null;
      h.textContent = price == null
        ? String(product.name ?? 'Match found')
        : formatMoney(Number(price), String(product.currency ?? 'EUR'));
      const s = document.createElement('div');
      s.className = 'sub';
      s.textContent = `We have exactly that — ${String(product.name ?? '')}`;
      box.append(h, s);
    } else {
      const s = document.createElement('div');
      s.className = 'sub';
      // A miss is an OFFER, not a refusal — the same rule the design-to-quote skill states.
      s.textContent = 'Nothing in the catalogue matches that exactly, so we will quote it for you.';
      box.appendChild(s);

      const near = (r.near_matches ?? []) as Array<Record<string, unknown>>;
      if (near.length) {
        const ul = document.createElement('ul');
        ul.className = 'rows';
        // Deliberately UNPRICED, matching the endpoint: putting a number on a near match quotes
        // something the merchant never agreed to.
        for (const n of near.slice(0, 5)) {
          const li = document.createElement('li');
          const l = document.createElement('span');
          l.textContent = String(n.name ?? '');
          li.appendChild(l);
          ul.appendChild(li);
        }
        box.appendChild(ul);
      }
    }
    return box;
  }

  private renderKitchenResult(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    const currency = String(r.currency ?? 'EUR');

    const h = document.createElement('div');
    h.className = 'headline';
    h.textContent = formatMoney(Number(r.subtotal ?? 0), currency);
    const s = document.createElement('div');
    s.className = 'sub';
    const dims = (r.dimensions ?? []) as Array<Record<string, unknown>>;
    s.textContent = dims.map((d) => `${d.label}: ${d.value}${d.unit ? ` ${d.unit}` : ''}`).join(' · ') || 'Estimated total';
    box.append(h, s);

    const sections = (r.sections ?? []) as Array<Record<string, unknown>>;
    if (sections.length) {
      const ul = document.createElement('ul');
      ul.className = 'rows';
      for (const sec of sections) {
        const li = document.createElement('li');
        const l = document.createElement('span');
        l.textContent = String(sec.section ?? '');
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = formatMoney(Number(sec.total ?? 0), currency);
        li.append(l, n);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    return box;
  }

  private renderHeatPumpResult(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    const range = (r.recommendedRange ?? {}) as Record<string, unknown>;

    const h = document.createElement('div');
    h.className = 'headline';
    // The RANGE is the answer, not the raw load: nobody buys a 7.3 kW heat pump.
    h.textContent = range.minKW != null
      ? `${range.minKW}–${range.maxKW} kW`
      : `${Number(r.totalDesignKW ?? 0)} kW`;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = `Design load ${Number(r.totalDesignKW ?? 0)} kW · flow temperature ${Number(r.flowTempC ?? 0)}°C`;
    box.append(h, sub);

    const ul = document.createElement('ul');
    ul.className = 'rows';
    for (const [label, value] of [
      ['Space heating', `${Number(r.spaceHeatingKW ?? 0)} kW`],
      ['Hot water', `${Number(r.dhwKW ?? 0)} kW`],
      ['Specific load', `${Number(r.effectiveWattsPerM2 ?? 0)} W/m²`],
    ] as Array<[string, string]>) {
      const li = document.createElement('li');
      const l = document.createElement('span');
      l.textContent = label;
      const n = document.createElement('span');
      n.className = 'n';
      n.textContent = value;
      li.append(l, n);
      ul.appendChild(li);
    }
    box.appendChild(ul);

    // The caveat travels with the number. A sizing figure shown without what it assumed is the
    // kind of confident answer that gets somebody the wrong unit.
    if (typeof r.emitterNote === 'string' && r.emitterNote) {
      const note = document.createElement('div');
      note.className = 'sub';
      note.textContent = r.emitterNote;
      box.appendChild(note);
    }
    return box;
  }

  private renderHeatingCostResult(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    const methods = (r.methods ?? []) as Array<Record<string, unknown>>;
    const cheapest = (r.cheapest ?? {}) as Record<string, unknown>;

    const h = document.createElement('div');
    h.className = 'headline';
    h.textContent = cheapest.annualCostEur != null
      ? formatMoney(Number(cheapest.annualCostEur), 'EUR')
      : '—';
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = cheapest.label
      ? `${String(cheapest.label)} is cheapest per year`
      : 'Annual running cost';
    box.append(h, sub);

    if (methods.length) {
      const ul = document.createElement('ul');
      ul.className = 'rows';
      // Ranked, with the gap to the cheapest — the comparison IS the tool.
      for (const m of methods.slice(0, 6)) {
        const li = document.createElement('li');
        const l = document.createElement('span');
        const pct = Number(m.pctVsCheapest ?? 0);
        l.textContent = pct > 0 ? `${String(m.label)} (+${pct}%)` : String(m.label);
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = formatMoney(Number(m.annualCostEur ?? 0), 'EUR');
        li.append(l, n);
        ul.appendChild(li);
      }
      box.appendChild(ul);
    }
    return box;
  }

  private renderSearchResult(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    // The search tool proxies MIVAA, whose payload shape is its own; take the first array of
    // objects with a name and show it rather than assuming one key.
    const rows = (Array.isArray(r.results) ? r.results
      : Array.isArray((r as { data?: unknown }).data) ? (r as { data: unknown[] }).data
        : []) as Array<Record<string, unknown>>;
    if (!rows.length) {
      // An empty corpus is the honest, common case on a young catalogue — and dumping
      // `corpus_size` / `processing_time` at a shopper is not an answer. Say it plainly and let
      // the other buttons carry the visit.
      const box2 = document.createElement('div');
      box2.className = 'result';
      const p = document.createElement('p');
      p.className = 'sub';
      p.textContent = r.corpus_empty
        ? 'There is nothing in this catalogue to search yet.'
        : 'Nothing matched that. Try fewer words, or a material name.';
      box2.appendChild(p);
      return box2;
    }

    const s = document.createElement('div');
    s.className = 'sub';
    s.textContent = `${rows.length} match${rows.length === 1 ? '' : 'es'}`;
    const ul = document.createElement('ul');
    ul.className = 'rows';
    for (const row of rows.slice(0, 8)) {
      const li = document.createElement('li');
      const l = document.createElement('span');
      l.textContent = String(row.name ?? row.title ?? row.label ?? 'Result');
      li.appendChild(l);
      ul.appendChild(li);
    }
    box.append(s, ul);
    return box;
  }

  /**
   * THE BACKSTOP. A result shape nobody anticipated still shows its own contents.
   *
   * This is the difference between "the tool returned something we do not recognise" and the
   * platform's worst habit — a branch that logs to the console under a comment saying the reply
   * will summarise it, leaving the visitor a blank panel. Scalars only: an object dumped raw is
   * not information either.
   */
  private renderUnknown(r: Record<string, unknown>): HTMLElement {
    const box = document.createElement('div');
    box.className = 'result';
    const kv = document.createElement('div');
    kv.className = 'kv';
    let shown = 0;
    for (const [k, v] of Object.entries(r)) {
      if (k === 'success' || k === 'guidance' || v == null) continue;
      if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
      const row = document.createElement('div');
      const key = document.createElement('span');
      key.className = 'k';
      key.textContent = k.replace(/_/g, ' ');
      const val = document.createElement('span');
      val.textContent = String(v);
      row.append(key, val);
      kv.appendChild(row);
      shown++;
    }
    if (shown === 0) {
      const p = document.createElement('p');
      p.className = 'sub';
      p.textContent = 'Nothing came back for that.';
      box.appendChild(p);
      return box;
    }
    box.appendChild(kv);
    return box;
  }

  /**
   * "Ask about this" — the one place the visitor can type.
   *
   * Deliberately AFTER a result, never before. A blank box asking an open question is what this
   * surface was built to avoid; a box asking about something already on screen is a follow-up,
   * which is a question people know how to write.
   */
  private renderAsk(host: HTMLElement) {
    if (!this.result) return;

    if (this.ask.answer) {
      const p = document.createElement('p');
      p.className = 'sub';
      p.textContent = this.ask.answer;
      host.appendChild(p);
      return;
    }

    if (!this.ask.asking) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'act';
      b.textContent = 'Ask about this';
      b.addEventListener('click', () => { this.ask.asking = true; this.render(); });
      host.appendChild(b);
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'form';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'e.g. would this suit a small bathroom?';
    input.maxLength = 500;
    const go = document.createElement('button');
    go.className = 'go';
    go.type = 'button';
    go.textContent = this.ask.pending ? 'Thinking…' : 'Ask';
    go.disabled = this.ask.pending;
    const submit = () => {
      const q = input.value.trim();
      if (q) void this.submitAsk(q);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') submit(); });
    wrap.append(input, go);
    host.appendChild(wrap);
  }

  private async submitAsk(question: string) {
    this.ask.pending = true;
    this.render();
    try {
      const res = await fetch(this.url('ask'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // The RESULT travels with the question — the model has no tools and cannot look anything
        // up, so what it is given is the whole of what it can say.
        body: JSON.stringify({ question, result: this.result }),
      });
      const body = await res.json();
      // `available: false` is the merchant's billing, not the visitor's business: the box simply
      // stops being offered rather than showing an error about somebody else's cap.
      this.ask.answer = body?.available && typeof body.answer === 'string' ? body.answer : null;
      this.ask.asking = false;
    } catch {
      this.ask.answer = null;
      this.ask.asking = false;
    } finally {
      this.ask.pending = false;
      this.render();
    }
  }

  private renderResult(): HTMLElement | null {
    if (!this.result) return null;
    if (this.result.error) {
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = String(this.result.error);
      return p;
    }
    switch (this.active) {
      case 'price_my_spec': return this.renderSpecResult(this.result);
      case 'calculate_kitchen_cost': return this.renderKitchenResult(this.result);
      case 'material_search': return this.renderSearchResult(this.result);
      case 'calculate_heat_pump_sizing': return this.renderHeatPumpResult(this.result);
      case 'calculate_heating_cost_comparison': return this.renderHeatingCostResult(this.result);
      default: return this.renderUnknown(this.result);
    }
  }

  /** The inputs one quick-start needs, kept minimal — a visitor answers one question, not a form. */
  private renderInput(host: HTMLElement) {
    if (!this.active) return;
    const form = document.createElement('div');
    form.className = 'form';
    const fields: Array<{ key: string; label: string; type: string; placeholder?: string }> =
      this.active === 'calculate_heat_pump_sizing'
        ? [{ key: 'floor_area_m2', label: 'Floor area (m²)', type: 'number', placeholder: '120' }]
        : this.active === 'calculate_heating_cost_comparison'
          ? [{ key: 'floor_area_m2', label: 'Floor area (m²)', type: 'number', placeholder: '120' }]
          : this.active === 'calculate_kitchen_cost'
        ? [{ key: 'run_length_m', label: 'How many metres of base units?', type: 'number', placeholder: '4' }]
        : [{ key: 'q', label: this.active === 'material_search' ? 'What are you looking for?' : 'Describe what you want', type: 'text', placeholder: 'oak kitchen worktop' }];

    const values: Record<string, string> = {};
    for (const f of fields) {
      const l = document.createElement('label');
      l.className = 'f';
      const span = document.createElement('span');
      span.textContent = f.label;
      const input = document.createElement('input');
      input.type = f.type;
      if (f.placeholder) input.placeholder = f.placeholder;
      input.addEventListener('input', () => { values[f.key] = input.value; });
      l.append(span, input);
      form.appendChild(l);
    }

    const go = document.createElement('button');
    go.className = 'go';
    go.textContent = this.busy ? 'Working…' : 'Go';
    go.disabled = this.busy;
    go.addEventListener('click', () => {
      const active = this.active!;
      if (active === 'calculate_heat_pump_sizing') {
        // Defaults for everything the visitor was not asked: one question is the most a widget on
        // somebody else's page can ask for before it stops being used at all. The tool states its
        // assumptions back, and `renderHeatPumpResult` shows them.
        void this.run(active, {
          floor_area_m2: Number(values.floor_area_m2) || 0,
          insulation_level: 'average',
          emitter: 'radiators',
          include_dhw: true,
        });
      } else if (active === 'calculate_heating_cost_comparison') {
        void this.run(active, {
          floor_area_m2: Number(values.floor_area_m2) || 0,
          insulation_level: 'average',
        });
      } else if (active === 'calculate_kitchen_cost') {
        void this.run(active, { run_length_m: Number(values.run_length_m) || 0 });
      } else if (active === 'material_search') {
        void this.run(active, { query: values.q ?? '' });
      } else {
        // price_my_spec takes the NOUN plus adjectives; a single free-text box gives us the noun,
        // which is the minimum the RPC needs and enough to come back with the real vocabulary.
        void this.run(active, { product_type: values.q ?? '' });
      }
    });
    form.appendChild(go);
    host.appendChild(form);
  }

  private render() {
    const style = document.createElement('style');
    style.textContent = STYLE;
    const card = document.createElement('div');
    card.className = 'card';

    const h = document.createElement('h3');
    h.textContent = 'What can we help you find?';
    card.appendChild(h);

    if (this.failure) {
      const p = document.createElement('p');
      p.className = 'err';
      p.textContent = this.failure;
      card.appendChild(p);
      this.root.replaceChildren(style, card);
      return;
    }

    if (this.tools.length === 0) {
      const p = document.createElement('p');
      p.className = 'hint';
      p.textContent = 'Loading…';
      card.appendChild(p);
      this.root.replaceChildren(style, card);
      return;
    }

    const actions = document.createElement('div');
    actions.className = 'actions';
    for (const t of this.tools) {
      const b = document.createElement('button');
      b.className = 'act';
      b.type = 'button';
      b.setAttribute('aria-pressed', String(this.active === t.name));
      b.textContent = t.label;
      b.disabled = this.busy;
      b.addEventListener('click', () => {
        this.active = this.active === t.name ? null : t.name;
        this.result = null;
        this.render();
      });
      actions.appendChild(b);
    }
    card.appendChild(actions);

    this.renderInput(card);

    const result = this.renderResult();
    if (result) card.appendChild(result);
    if (result) this.renderAsk(card);

    card.appendChild(this.renderAttribution());
    this.root.replaceChildren(style, card);
  }

  /**
   * The quid pro quo of the free tools, stated on the page.
   *
   * The embedder gets working tools and every lead they produce; we get an attributed way back.
   * Rendered plainly rather than hidden — a visitor should be able to see whose calculator this is,
   * and an embedder should be able to see what they are giving in exchange for it.
   */
  private renderAttribution(): HTMLElement {
    const p = document.createElement('p');
    p.className = 'attrib';
    const a = document.createElement('a');
    a.href = referralLink('/tools', this.referralCode);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'MaterialKai';
    p.append(document.createTextNode('Powered by '), a);
    return p;
  }
}

if (!customElements.get('materialkai-assistant')) {
  customElements.define('materialkai-assistant', MaterialKaiAssistant);
}
