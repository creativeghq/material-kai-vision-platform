export type AuditFinding = {
  kind: string;
  detail: string;
  at?: string;
};

export type AuditResult = {
  url: string;
  title: string;
  bodyLen: number;
  findings: AuditFinding[];
};

export const HARD_KINDS = [
  'obscured-control',
  'raw-data-on-screen',
  'table-clipped',
  'dead-opacity-class',
];

export const AUDIT_FN = `(() => {
  const F = [];
  const add = (kind, detail, extra) => F.push(Object.assign({ kind, detail }, extra || {}));
  const vis = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 3 && r.height > 3;
  };
  const label = (el) => (el.innerText || el.value || el.getAttribute('aria-label') || el.placeholder || el.name || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
  const where = (el) => {
    let p = el, path = [];
    while (p && p !== document.body && path.length < 4) { path.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '')); p = p.parentElement; }
    return path.join('>');
  };

  const ctrls = [...document.querySelectorAll('button,a[href],input:not([type=hidden]),select,textarea,[role=button],[role=tab],[role=menuitem]')];
  const seen = new Set();
  for (const el of ctrls.slice(0, 220)) {
    if (el.disabled || !vis(el)) continue;
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { continue; }
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth) continue;
    const top = document.elementFromPoint(cx, cy);
    if (!top || top === el || el.contains(top) || top.contains(el)) continue;
    const key = label(el) + '|' + top.tagName;
    if (seen.has(key)) continue;
    seen.add(key);
    const ts = getComputedStyle(top);
    add('obscured-control', '"' + label(el) + '" (' + el.tagName.toLowerCase() + ') is covered by ' + top.tagName.toLowerCase() + '.' + (typeof top.className === 'string' ? top.className : '').slice(0, 60) + ' [position:' + ts.position + ' z:' + ts.zIndex + ']', { at: where(el) });
  }

  const body = document.body.innerText || '';
  const leaks = [
    [/\\[object Object\\]/g, 'literal "[object Object]"'],
    [/(^|[\\s:>])undefined([\\s.,<]|$)/g, 'literal "undefined"'],
    [/(^|[\\s:>])NaN([\\s.,%<]|$)/g, 'literal "NaN"'],
    [/\\{"[a-z_]+":/gi, 'raw JSON'],
    [/\\bInvalid Date\\b/g, 'literal "Invalid Date"'],
  ];
  for (const pair of leaks) {
    const m = body.match(pair[0]);
    if (!m) continue;
    const i = body.search(pair[0]);
    add('raw-data-on-screen', pair[1] + ' x' + m.length + ' — context: ' + JSON.stringify(body.slice(Math.max(0, i - 50), i + 70)));
  }

  for (const t of document.querySelectorAll('table')) {
    if (!vis(t)) continue;
    let sc = t.parentElement, scrollable = false;
    while (sc && sc !== document.body) {
      const ox = getComputedStyle(sc).overflowX;
      if (ox === 'auto' || ox === 'scroll') { scrollable = true; break; }
      sc = sc.parentElement;
    }
    const host = t.parentElement;
    if (!scrollable && host && t.scrollWidth > host.clientWidth + 2) {
      add('table-clipped', 'table is ' + t.scrollWidth + 'px inside a ' + host.clientWidth + 'px box with no scroller — right-hand columns unreachable', { at: where(t) });
    }
  }

  const OK = new Set(['0','5','10','15','20','25','30','35','40','45','50','55','60','65','70','75','80','85','90','95','100']);
  const bad = new Map();
  for (const el of document.querySelectorAll('[class]')) {
    const cn = typeof el.className === 'string' ? el.className : '';
    for (const m of cn.matchAll(/\\b(bg|text|border|ring|from|to|via|fill|stroke)-[a-z0-9-]+\\/(\\d{1,3})\\b/g)) {
      if (!OK.has(m[2])) bad.set(m[0], (bad.get(m[0]) || 0) + 1);
    }
  }
  for (const entry of bad) add('dead-opacity-class', entry[0] + ' is off the emitted opacity scale — this rule produces no CSS (x' + entry[1] + ')');

  const EMPTY = /\\b(no |there are no |nothing |you have no )(\\w+ ){0,3}(yet|found|available|configured|recorded)?\\b/i;
  for (const el of document.querySelectorAll('div,section,article,td')) {
    const txt = (el.innerText || '').trim();
    if (!txt || txt.length > 120 || !EMPTY.test(txt)) continue;
    if (el.querySelector('button,a[href]')) continue;
    let host = el.closest('section,[class*=card],div');
    for (let i = 0; i < 3 && host; i++) { if (host.querySelector('button,a[href]')) break; host = host.parentElement; }
    if (!(host && host.querySelector('button,a[href]'))) add('empty-state-no-action', '"' + txt.replace(/\\s+/g, ' ').slice(0, 80) + '" — no action offered', { at: where(el) });
  }

  return JSON.stringify({ url: location.pathname, title: document.title, bodyLen: body.length, findings: F });
})()`;
