/**
 * Guard: the embed BUILDER's two rules (#337).
 *
 * The builder asks "what are you after?" and ends in one of two places — a price, or a quote
 * request. Which one it shows is not a presentation choice, it is the whole contract:
 *
 *   1. A PRICE APPEARS ONLY ON AN EXACT MATCH. The server prices exact matches and deliberately
 *      returns near matches WITHOUT a price, because a near match is a suggestion and not an offer.
 *      If the widget renders a number next to a near match — or worse, derives one — it has quoted
 *      a merchant's customer a figure the merchant never agreed to, on the merchant's own page.
 *      That is the money-derivation rule (CLAUDE.md: SQL derives, TypeScript formats) arriving at
 *      the last hop, where it is easiest to break and hardest to notice.
 *
 *   2. NO MATCH IS NOT A DEAD END. "Nothing in the catalogue matches that" must always land on the
 *      quote form. A builder that shows an empty result for an unstocked spec throws away the lead
 *      the feature exists to capture, and would look like a bug rather than a decision.
 *
 * Source-level rather than behavioural: the builder is a custom element and the suite runs on the
 * `node` environment with no DOM, so mounting it would mean adding jsdom for one file. Both rules
 * are fully visible in the text — the same trade `embedShellIntegrity` makes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src/embed/materialkai-builder.ts'), 'utf8');

/** Slice one method body out by name, terminating at the first 2-space-indented brace. */
function method(name: string): string {
  // `private async foo(` as well as `private foo(` — matching only the latter silently returned
  // -1 for every async method and made four assertions look like real failures.
  const start = SRC.search(new RegExp(`private (?:async )?${name}\\(`));
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  }', start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('the embed builder prices only exact matches', () => {
  const renderResult = method('renderResult');

  it('finds the result renderer (guards against a vacuous pass)', () => {
    expect(renderResult).toContain('match_kind');
    expect(renderResult.length).toBeGreaterThan(400);
  });

  it('formats no money at all — the product widget is the only thing on screen that prices', () => {
    // Stronger than "only price exact matches", and it replaced that rule for a concrete reason.
    // `resolve` returns the BASE price while the mounted product widget shows the CONFIGURED one.
    // Printing both put two numbers from two derivations on screen at once, free to disagree the
    // instant a finish was picked — the money rule (one derivation per quantity) arriving as a UI
    // bug rather than a SQL one. So the builder delegates the number entirely.
    expect(SRC, 'the builder must not format money itself').not.toContain('formatMoney');
    expect(renderResult, 'the exact branch must delegate the price to the product widget')
      .not.toMatch(/\.price\s*=/);
  });

  it('the near-match list renders no price field', () => {
    const nearStart = renderResult.indexOf('near_matches');
    expect(nearStart).toBeGreaterThan(-1);
    const near = renderResult.slice(nearStart);
    expect(near, 'near matches must not show a price').not.toMatch(/\.price\b/);
  });

  it('a matched product is given room for its finishes and its cart button', () => {
    // The viewport is a square clipped frame, which is right for a picture and wrong for the
    // product widget: its options and Add to cart sit below the clip, so the visitor gets a model
    // they cannot configure or buy — the one thing an exact match exists to give them.
    expect(method('renderViewport')).toMatch(/dataset\.mode = 'product'/);
    expect(SRC).toMatch(/\.viewport\[data-mode="product"\][^}]*aspect-ratio:\s*auto/);
    expect(SRC).toMatch(/\.viewport\[data-mode="product"\][^}]*overflow:\s*visible/);
  });

  it('does no arithmetic on money anywhere in the builder', () => {
    // The server returns a gross price ready to display. Any operator applied to it here is a
    // second derivation — VAT re-added, a discount re-applied, a delta summed.
    //
    // Comments are stripped first. The rule is about CODE, and prose trips it constantly: a line
    // ending in the word "price" followed by the next line's `//` reads as `price /` to the regex.
    const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
    const bad = [...code.matchAll(/\bprice\s*[*/+-]|[*/+-]\s*\bprice\b/g)].map((m) => m[0]);
    expect(bad, 'money arithmetic in the widget: ' + bad.join(', ')).toEqual([]);
  });
});

describe('the embed builder always offers a way forward', () => {
  it('the non-exact branch mounts the quote form', () => {
    const renderResult = method('renderResult');
    const exactEnd = renderResult.indexOf('return;', renderResult.indexOf("match_kind === 'exact'"));
    const fallback = renderResult.slice(exactEnd);
    expect(
      fallback,
      'a spec that matches nothing must land on the quote form, not an empty result',
    ).toContain('quoteForm()');
  });

  it('the quote form collects a name and an email, and refuses without them', () => {
    const form = method('quoteForm');
    expect(form).toContain("type = 'email'");
    expect(form).toMatch(/name\.value\.trim\(\)/);
    expect(form).toMatch(/email\.value\.trim\(\)/);
  });

  it('an exact match hands the visitor the real product widget, in the viewport', () => {
    // Otherwise the builder would have to re-implement the model viewer, AR and the cart — three
    // things that already exist one element away. It mounts from the VIEWPORT at the top of the
    // card, not from the result block: the visitor is configuring one thing, and showing the model
    // again beside the price would be a second copy of the same object on screen.
    expect(method('renderViewport')).toContain('mountProduct');
    expect(method('mountProduct')).toContain("createElement('materialkai-product')");
    expect(method('renderResult'), 'the result block must not mount a second copy of the model')
      .not.toContain('mountProduct');
  });

  it('a matched product is buyable, not just displayed', () => {
    // "Matched → price and add to cart, no match → request a quote" is the rule the whole widget
    // draws. Mounting the product without its cart button leaves the matched half unfinished: a
    // price the visitor cannot act on, which is the same dead end the quote form exists to avoid.
    expect(method('mountProduct')).toContain("setAttribute('show-add-to-cart'");
  });

  it('the verdict is rendered above the viewport, not stranded below the product', () => {
    // Rendered after it, "We have exactly that" lands underneath the product's own cart button and
    // reads as a caption for whatever happens to be last on screen.
    //
    // Measured from the WIZARD branch on purpose. Deep-link mode (#341 join 6) returns earlier and
    // renders the viewport with no heading at all — correctly, since there is no verdict when the
    // page named the product — and measuring from the top of the method picks up that call first,
    // which failed this assertion against ordering that is still right.
    const full = method('render');
    const render = full.slice(full.indexOf('const steps'));
    const headingAt = render.indexOf('stageHeading()');
    const viewportAt = render.indexOf('renderViewport()');
    expect(headingAt, 'the verdict heading is not rendered at all').toBeGreaterThan(-1);
    expect(headingAt).toBeLessThan(viewportAt);
  });

  it('"see it" is a visible step, not a side effect of pricing', () => {
    // It shipped as a silent consequence of pressing "Price it", on the branch where nothing
    // matched. No button, no mention, ~20s of nothing — so nobody could find it, and the stage
    // may as well not have existed. #337 also puts "see it" BEFORE "price it" for a reason: you
    // should be able to look at your specification without asking what it costs.
    const build = method('renderBuild');
    expect(build, 'no See it control in the build stage').toContain('See it');
    expect(build).toContain('this.seeIt()');
  });

  it('"see it" is offered only when the key can actually generate', () => {
    // A button that quietly does nothing because of someone else's billing setting is worse than
    // no button at all.
    expect(method('renderBuild')).toContain('this.generationEnabled');
    expect(method('loadFacets'), 'the flag is never read from the server')
      .toContain('generation_enabled');
  });

  it('"see it" prefers a real product over inventing one', () => {
    // Generating an impression of something already in the catalogue spends the merchant's credits
    // to invent a thing they own a model of.
    const see = method('seeIt');
    expect(see).toContain("'resolve'");
    expect(see).toMatch(/match_kind === 'exact'/);
    expect(see.indexOf("'resolve'")).toBeLessThan(see.indexOf('this.visualize()'));
  });

  it('the generator is told WHAT the thing is, not only what colour it is', () => {
    // With adjectives alone the model draws "something, in sunset" — it drew a gold cylinder. The
    // noun comes from stage 1's `product_type`, which is why that stage exists.
    expect(method('visualize')).toMatch(/item_name:\s*this\.spec\.product_type/);
  });

  it('the viewport falls back to a generated image, clearly labelled as one', () => {
    // A spec the catalog cannot satisfy has no photograph, because the thing does not exist. An
    // unlabelled AI picture of it is a promise the merchant cannot keep.
    const vp = method('renderViewport');
    expect(vp).toContain('this.generatedUrl');
    expect(vp).toMatch(/AI impression/);
  });

  it('a changed spec clears the viewport', () => {
    // Otherwise the previous answer sits there looking like the answer to the new selection.
    for (const m of ['choose', 'backRow']) {
      expect(method(m), `${m} leaves a stale result in the viewport`)
        .toContain('this.generatedUrl = null');
    }
  });
});

/**
 * These four exist because the quote path shipped dead and the live probe is what found it.
 *
 * `verifyTurnstile` fails CLOSED when a secret is configured, and it IS configured here — so a
 * builder that rendered no challenge had every single quote request answered "Bot check failed".
 * The priced half looked perfectly healthy the whole time, which is the silent-zero shape exactly:
 * the lead-capture half of the feature returning zero forever with nothing complaining.
 */
describe('the embed builder can actually pass the bot gate', () => {
  it('reads the site key the server sends with the vocabulary', () => {
    expect(method('loadFacets')).toContain('turnstile_site_key');
  });

  it('sends the token with the quote request', () => {
    expect(
      method('submitQuote'),
      'without this every quote request is rejected wherever Turnstile is configured',
    ).toContain('turnstile_token');
  });

  it('renders the challenge explicitly, never by Cloudflare class auto-scan', () => {
    // The auto-scan is a `document.querySelectorAll`, which does not descend into a shadow root:
    // the automatic mode finds nothing inside a web component and no challenge ever appears.
    expect(SRC).toContain('render=explicit');
    expect(SRC).toMatch(/api\.render\(\s*holder/);
    expect(SRC, 'cf-turnstile is the auto-scan class and cannot work in shadow DOM')
      .not.toContain('cf-turnstile');
  });

  it('the challenge lives in the light DOM, projected through a slot', () => {
    // Whether Cloudflare's explicit render works reliably INSIDE a shadow root is an assumption
    // that would be invisible until the quote path was dead in production. A slot removes the
    // question: the element it renders into is an ordinary document child of the host.
    const mount = method('mountChallenge');
    expect(mount).toMatch(/holder\.slot = 'turnstile'/);
    expect(mount, 'the holder must be a LIGHT-DOM child of the host, not of this.root')
      .toContain('this.appendChild(holder)');
    expect(mount).not.toContain('this.root');
    expect(method('quoteForm'), 'nothing projects the holder into the form')
      .toMatch(/slot\.name = 'turnstile'/);
  });

  it('mounts the challenge at most once per element', () => {
    // A second widget would leave the first registered, so a visitor who solved the old one sends
    // a token belonging to a widget nothing is watching.
    expect(method('mountChallenge')).toMatch(/if \(!this\.siteKey \|\| this\.challengeHost\) return/);
  });

  it('a failed submit does not re-render the form away', () => {
    // render() rebuilds the whole shadow tree — it would discard the visitor's typed name and
    // email AND a solved challenge, so a transient error would cost them the entire form.
    const submit = method('submitQuote');
    const catchAt = submit.indexOf('} catch');
    expect(catchAt, 'submitQuote no longer has a catch').toBeGreaterThan(-1);
    expect(
      submit.slice(catchAt),
      'the failure path re-renders, which wipes the form the visitor just filled in',
    ).not.toContain('this.render(');
  });

  it('a failed submit resets the challenge, because a token is single-use', () => {
    const form = method('quoteForm');
    expect(form).toMatch(/api\.reset\(/);
    expect(form).toMatch(/this\.turnstileToken = ''/);
  });
});

describe('the embed builder cannot call the API without its key', () => {
  it('every fetch goes through this.url(), which appends action and key', () => {
    const fetches = [...SRC.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
    expect(fetches.length, 'no fetch calls parsed').toBeGreaterThan(1);
    const raw = fetches.filter((arg) => !arg.startsWith('this.url('));
    expect(
      raw,
      'a fetch that does not build its URL through this.url() would omit the embed key and hit an '
      + 'unauthenticated endpoint: ' + raw.join(', '),
    ).toEqual([]);
  });

  it('the key is url-encoded into the query string, not sent as a custom header', () => {
    // A custom header forces a CORS preflight, and the preflight carries no headers — so the
    // key would be unreadable exactly when the browser is deciding whether to allow the call.
    const url = method('url');
    expect(url).toContain('encodeURIComponent(this.apiKey)');
    expect(SRC).not.toContain('x-embed-key');
  });
});

/**
 * Deep-link mode (#341 join 6) — `<materialkai-builder product-id="…">`.
 *
 * The program shipped two components and asked merchants to choose between them. They are one
 * entry with two modes: naming a product is the first question already answered. The distinction
 * is what gets deleted here, not the product widget — that still exists and is still what mounts
 * inside, on a match and on this path.
 *
 * Two ways this breaks quietly, both guarded below:
 *   • the wizard renders anyway, so a page about ONE product opens by asking what the visitor is
 *     after — and the verdict heading answers a question nobody asked;
 *   • the vocabulary is fetched regardless, spending a request (and a slice of the key's rate
 *     limit) on chips that are never drawn.
 */
describe('the embed builder is also the deep link', () => {
  // `method()` matches `private …` declarations; connectedCallback is a public lifecycle hook.
  // Loosening that helper to make `private` optional would make it match CALL sites (`this.render(`)
  // and silently slice the wrong text for every other assertion in this file.
  const connected = (() => {
    const start = SRC.indexOf('connectedCallback() {');
    expect(start, 'connectedCallback not found — was it renamed?').toBeGreaterThan(-1);
    return SRC.slice(start, SRC.indexOf('\n  }', start));
  })();

  it('a named product skips the wizard entirely', () => {
    expect(connected).toContain("getAttribute('product-id')");
    expect(connected).toContain('this.deepLinkProductId');
    // The product must reach the viewport, which is what mounts <materialkai-product>.
    expect(connected).toContain('this.matchedProductId');
  });

  it('does not fetch the spec vocabulary for a page that already knows the product', () => {
    const beforeReturn = connected.slice(0, connected.indexOf('return;'));
    expect(beforeReturn).not.toContain('loadFacets');
    // …and still loads it in the normal path, or the builder has no questions to ask.
    expect(connected).toContain('void this.loadFacets()');
  });

  it('renders the product alone — no steps, no verdict, no result panel', () => {
    const render = method('render');
    const early = render.slice(0, render.indexOf('const steps'));
    expect(early, 'deep-link mode must return before the wizard chrome is built')
      .toContain('this.deepLinkProductId');
    expect(early).toContain('renderViewport');
    expect(early).not.toContain('stageHeading');
  });
});
