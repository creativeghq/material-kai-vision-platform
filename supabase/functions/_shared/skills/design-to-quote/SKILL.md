---
name: Design to Quote
slug: design-to-quote
description: Turn "I want something like this" into a spec, show it, then price it or raise a quote request — never an invented number. Use when a customer describes a product they want rather than naming one, asks "how much would X cost", "do you have X in Y", or wants something the catalogue may not stock.
agents: [kai, erp]
tags: [sales, quotes, pricing, embed, spec]
---

# Design to Quote

The website widget walks a visitor through four steps and always ends somewhere real. This skill is the same walk, conversationally — which suits chat better, because the hard part is turning "something low, linen, for a hotel lobby" into a specification, and that is a language problem.

```
1  what are you after   the noun: product_type
2  configure            the adjectives: facets — material, finish, colour, dimensions
3  see it               a picture, when they want one
4  price it             price_my_spec  → exact  = quote the price
                                       → near / none = raise_quote_request
```

**Step 4 is not optional.** Every conversation that reaches a specification ends either with a derived price or with a recorded request. Ending it any other way — "we probably don't stock that", "that'd be somewhere around €400" — is the failure this skill exists to prevent.

## The three rules the model breaks by default

**1. Never state a number that did not come from `price_my_spec`.**
Asked "roughly what would that cost", you will want to produce a plausible figure. Plausible is exactly what is dangerous: it commits the workspace to a price nobody approved, on a specification nobody has costed. The widget shows near matches with **no price at all** for this reason. If you have no derived number, you have no number.

**2. A miss is an offer, not a refusal.**
`match_kind: none` means *"let me get that quoted for you"* — not *"we don't do that"*. The catalogue is small; most real requests will miss. A miss that ends in a recorded request is a lead. A miss that ends in an apology is a lost customer and no record that they ever asked.

**3. Retry once with the returned vocabulary before concluding anything.**
Facet keys are per-tenant and you cannot guess them. Asked for a navy armchair you will send `{"color": "navy"}` when this workspace's key is `available_colors`, get nothing back, and confidently report that we do not stock navy. On a miss `price_my_spec` returns `available_vocabulary` — the keys and in-stock values this catalogue actually uses. Re-send with those before you believe the miss. Only the **second** miss is trustworthy.

## The walk

**Step 1 — get the noun.** "A chair" is not a spec; "lounge armchair" is. Ask one question if you have to. Everything else can stay vague.

**Step 2 — collect adjectives, do not interrogate.** Two or three facets is plenty to try a match with. You do not need a complete specification before calling `price_my_spec` — call it early, and let the vocabulary it returns tell you what is worth asking next. That is faster than guessing which questions matter and it uses the real taxonomy instead of an invented one.

**Step 3 — show it, but prefer what we own.**
- If the match has a 3D model, that model **is** the picture. Say so and stop.
- Only generate an impression when there is nothing real to show — `generate_gemini` with `mode: 'product-shot'` and the spec in the prompt.
- Label it as an impression, every time. A generated picture presented as a catalogue photo is a promise about a thing that may not exist.
- Generating an impression of something we already own a model of spends the merchant's credits inventing what they already have.

**Step 4 — price it, or record it.**

| verdict | what you do |
|---|---|
| `exact` | Quote the returned price. Offer `create_quote` if they want it in writing. |
| `near` | Show the suggestions **without prices** — they are close, not equivalent. Ask whether one of them works. If yes, re-run `price_my_spec` against that one. If no, raise the request. |
| `none` | Retry once with `available_vocabulary`. Still nothing → `raise_quote_request`. |

**Raising the request:** pass the same `spec` you sent to `price_my_spec`, plus the customer's name and email if you have them, plus anything they said that the facets cannot carry — deadline, dimensions, budget, the room it is for — in `notes`. Then tell them plainly: it has been passed on and someone will come back with a price. Do not promise when, and do not promise it can be made.

## Guardrails

- **Never call `create_quote` for an unmatched spec.** A quote is a priced document; a spec that did not match has no price, and inventing a line item to carry it produces a real quote for a product that does not exist.
- **A configured product is not the base product.** If options were chosen, the price must come back from the configured derivation, not from the plain product price — otherwise the customer is quoted the base and invoiced the upgrade.
- **Do not create a CRM contact just to have one.** `raise_quote_request` resolves an existing contact by id, email, then name, and only creates when you supply an email and nothing matched. Without an email the request is still recorded — attributed to you. Losing the lead to keep the CRM tidy is the wrong trade.
- **One request per ask.** If the same customer wants three different things, that is three specs and three requests, not one request with a paragraph in `notes` — each one is a separate thing to price.
