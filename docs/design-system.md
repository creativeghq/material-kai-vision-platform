# Material KAI Vision Platform — Design System

> **Single source of truth for visual decisions.** Change a token here, it changes everywhere.
>
> **Live specimen: [`/design-system`](../src/pages/DesignSystemPage.tsx)** — every surface below,
> rendered with the real components and the real tokens, with a light/dark × green/blue switcher.
> When this file and that page disagree, **the page is right and this file is stale** — fix the file.

---

## 0. What changed, and why (2026-08-18)

The platform was rebuilt onto a **product-UI** language modelled on HubSpot: flat opaque surfaces,
hairline separation, dense controls, underline tabs, one accent. What it replaced was a
**marketing** language — glass panels, a brand aurora behind every page, pill buttons that lifted
on hover, a gradient header band — applied to screens whose actual job is showing tables of money.

The colour system did **not** change: dark/light modes and the green/blue accents are exactly as
they were. Neither did the top nav or the apps mega-menu.

Five changes carry most of the difference. Each is here because the old version cost something
concrete, not because it looked dated:

| Change | What it cost before |
|---|---|
| **Glass → opaque panels** | A translucent panel has no fixed contrast ratio: text legibility depended on what scrolled underneath it, so the same table was compliant in one scroll position and marginal in another. No static audit can catch that. |
| **Aurora canvas → flat `--background`** | An opaque panel can only match a flat ground, and every chart, KPI and table lost contrast against the moving gradient. `background-attachment: fixed` also repainted the full viewport on every scroll frame. |
| **Filled-pill tabs → underline tabs** | A filled accent pill is the exact silhouette of a primary button. "The section you are in" and "the button to press" were the same object on every record page. |
| **Pill buttons → 4px rectangles** | Buttons, status chips, filter chips and active tabs were all pills. A toolbar had no grammar — you had to read every element to find out which ones did something. |
| **Global weight override removed** | `.font-bold → 300`, `.font-semibold → 400`, `.font-medium → 400`, with `!important`. A table header, a total, a KPI and its caption all rendered at one weight. In a dense data UI, weight *is* the hierarchy. |

**Migration is by token, not by sweep.** `--glass-background`, `--glass-border`, `--glass-blur`
and `--glass-shadow` kept their names and were repointed at opaque values, so ~400 call sites of
`.dashboard-card` changed material without being edited. `.glass-panel`, `.gradient-border`,
`.tinted-card`, `.tabs-underline`, `.glow-*`, `.app-aurora` and `.app-grain` all still resolve —
as the new thing, or as an inert no-op. Nothing needs a find-and-replace to keep compiling.

---

## Table of Contents

1. [Colour](#1-colour)
2. [Surfaces & elevation](#2-surfaces--elevation)
3. [Typography](#3-typography)
4. [Spacing, radius, density](#4-spacing-radius-density)
5. [Primitives](#5-primitives)
6. [Patterns (the `hub/` library)](#6-patterns-the-hub-library)
6b. [Empty states](#6b-empty-states)
7. [The three screen archetypes](#7-the-three-screen-archetypes)
8. [Navigation](#8-navigation)
9. [Do / Don't](#9-do--dont)
10. [New page checklist](#10-new-page-checklist)
11. [Image optimization](#11-image-optimization)
12. [Reference files](#12-reference-files)

---

## 1. Colour

Two **modes** (`html.light` / `html.dark`) × two **accents** (`html[data-accent='green'|'blue']`),
both owned by `ThemeContext` and persisted per user. Four combinations; every surface must work in
all four. The specimen page has the switcher for exactly this reason.

### Core tokens

| Token | Dark (green) | Light (green) | Meaning |
|---|---|---|---|
| `--background` | `258 22% 5%` | `42 27% 93%` | The page. One flat colour, no gradient. |
| `--card` | `266 22% 8%` | `48 30% 97%` | A panel. One step up from the page. |
| `--surface-sunken` | `262 22% 10%` | `44 24% 91%` | Table headers, toolbars, footers — one step *down*. |
| `--surface-hover` | `264 20% 12%` | `44 24% 90%` | Row / list-item / interactive-panel hover. |
| `--hairline` | `260 16% 18%` | `46 18% 82%` | **Every** rule, border and separator in the app. |
| `--primary` | `335 74% 60%` | `56 24% 37%` | The accent. Fills, links, active states, focus. |
| `--foreground` | `280 15% 93%` | `46 14% 21%` | Body ink. |
| `--muted-foreground` | `258 14% 60%` | `48 16% 38%` | Labels, captions, table headers, empty values. |

The **blue** accent retints the same set (`html.light[data-accent='blue']`, `html.dark[data-accent='blue']`):
a cool slate page with white cards on light, a navy-black command centre on dark.

### Semantic colour

`--success` / `--warning` / `--error` / `--info`, each with a `-bg` tint and a `-foreground`.
Status is **tinted**, never a saturated fill (see [Badge](#badge)).

**Never colour by direction alone.** A rising number is not automatically green — see
`HubStatTile`'s `upIsGood`. And never let colour be the *only* signal: deltas carry an arrow,
status tags carry a word, validation carries text.

### Rules

- ✅ `bg-card`, `text-muted-foreground`, `border-hairline`, `bg-surface-sunken`
- ❌ `bg-gray-800`, `text-white`, `border-white/10`, `#1f2937` — a hardcoded colour is wrong in
  at least two of the four theme combinations, by construction.
- ❌ **Non-scale opacity modifiers.** `bg-white/8`, `border-white/12` and friends do not exist in
  Tailwind's default opacity scale, so they compile to **nothing**. The app is full of them and
  they have silently done nothing in dark mode for a long time. Use a token, or an arbitrary
  value (`bg-primary/[0.08]`) if you genuinely need an off-scale alpha.

---

## 2. Surfaces & elevation

Three surfaces. That is the whole ladder.

```
page      bg-background       flat, no gradient, no texture
panel     bg-card             + border-hairline + rounded-md
sunken    bg-surface-sunken   inside a panel: toolbar, table header, footer
```

**A panel is separated by a hairline, not by a shadow.** Shadow is reserved for things that
genuinely float above the page: dropdown, popover, dialog, sheet, toast. Those use
`shadow-overlay` (and `shadow-xl`/`shadow-2xl` are aliased to it, so a stray call site cannot
invent a heavier one).

**A panel does not move on hover.** The old card lifted 2px and lightened its whole surface, which
rippled every dashboard as the mouse crossed it and fought the row highlight on any panel wrapping
a table. A panel that is *itself* a click target gets `panel-interactive` (or just wrap it in an
`<a>`/`<button>`, which the CSS picks up): border goes accent, background goes to `--surface-hover`,
nothing translates.

```tsx
<Card>…</Card>                              // the primitive
<div className="dashboard-card">…</div>     // the CSS class — identical material
<div className="panel-interactive …">…</div>// a panel you click through on
```

---

## 3. Typography

**Aleo** (`font-display`) for identity. **Averta** (`font-sans`) for everything else. Both
self-hosted from `public/fonts/`.

```
h1, h2      font-display  — page titles, hero copy, marketing
h3–h6       font-sans     — card titles, section headers, panel headers
```

Chrome is sans on purpose. A serif in a dense data UI is the loudest possible "this is not a
product"; the brand still lands on every page title, which is where it belongs.

> `--font-display` is `'Aleo', 'Averta', Georgia, …` and **Averta must stay in second position.**
> Aleo's cmap has zero Greek glyphs, so Greek names in headings fell through to Georgia — a font
> not installed on Linux. Font matching is per-character, so latin headings still get Aleo.

### Scale

| Role | Size | Weight | Notes |
|---|---|---|---|
| Page title | 20px | 600 | `PageHeader` only. One per screen. |
| Section | 16px | 600 | `SectionHeader` — the lead-in for a tab or region. |
| Panel title | 14px | 600 | `CardTitle`. Do **not** override its size. |
| Body | 14px | 400 | The default. |
| Caption / label | 12px | 400–600 | Property labels, helper text, footers. |
| Table header | 11px | 600 | Muted. **Never uppercase** — uppercase destroys word shape, which is the cue you use to find a column. |

Weight utilities mean what they say. There is **no** global weight override any more; do not
reintroduce one. If something reads too heavy, change that component.

---

## 4. Spacing, radius, density

```
--radius-xs  2px   tag, checkbox
--radius-sm  4px   button, input, select, filter chip
--radius-md  6px   card, panel, table container   ← `rounded-lg` and `rounded-md` both land here
--radius-lg  8px   dropdown, popover, tooltip
--radius-xl 10px   dialog, sheet
--radius-full      avatars, dots, status pips — and nothing else
```

Tailwind's `rounded-xl` / `2xl` / `3xl` are **overridden** to 8 / 10 / 12px. They are used on
hundreds of containers, and at Tailwind's defaults (12/16/24px) a data panel was rounded harder
than an OS window.

**Control height is 36px** (`h-9`) — button, input, select, textarea row. `sm` is 32px for inside
a table row; `lg` is 40px for a page's single hero CTA. The old 44px default was a touch target
standing in for a desktop control, and it set the height of every table row that carried an action.

**Density:** page padding 24px, grid gap 16px, panel padding 20px, table cell 12px × 10px.

---

## 5. Primitives

`src/components/core/ui/*`. Radix + CVA. Read the file header before changing one — each carries
the reasoning for its shape.

### Button

| Variant | Use |
|---|---|
| `default` | The **one** primary action on a screen. Solid accent. |
| `secondary` | Its partner. Accent outline. |
| `outline` | Everything else. Neutral hairline. |
| `ghost` | Icon buttons, table-row chrome, toolbar affordances. |
| `destructive` | Delete/void. Solid, and rare. |
| `link` | Inline text action. |

Sizes: `sm` 32 · `default` 36 · `lg` 40 · `icon` 36² · `icon-sm` 32².

If a screen has two solid buttons, one of them is wrong.

### Badge

Squared (2px), 11px, **tinted not filled** for every semantic variant: pale background, deep text,
matching hairline. A saturated fill has the visual weight of a primary button, so a status column
turned a table into a table with a button in every row. `default` (solid accent) survives for the
one case that wants weight — a count badge on a nav item.

Variants: `default` `secondary` `outline` `success` `warning` `error` `info` `high` `medium` `low` `neutral`.

### Input / Select / Textarea

Identical height, radius, fill, border and focus treatment. Focus = accent border + a 3px accent
halo (`ring-[3px] ring-primary/20`). A form row mixing a 40px input with a 36px select is the most
common way a settings page looks broken.

### Checkbox

Neutral hairline when unchecked (an accent outline on an empty box reads as *selected*), accent
fill when checked, and a **dash — not a tick — when indeterminate**. Radix renders `Indicator` for
both states; without the distinct glyph, "some rows selected" and "all rows selected" look the same
right before a bulk delete.

### Tabs

**Underline, platform-wide.** The treatment lives in `index.css` keyed on `[role="tab"]`, so it
reaches Radix `<Tabs>`, `HubTabNav`, the Finance vertical rail and any hand-rolled strip that
reports itself as a tablist. A vertical list gets the indicator on its leading edge instead.

Opt out with `data-variant="pill"` on the list — there is currently no good reason to.

### Table

Sticky sunken header · hairline row separators · no zebra striping (it consumes the one channel a
table needs free: the row's own status colour) · 11px semibold headers · right-aligned
`tabular-nums` for numbers.

**Every table scrolls horizontally.** `<main>` is `overflow-x-hidden`, so a table wider than the
viewport is not pushed off-screen — it is CLIPPED: the right-hand columns are simply absent, with no
scrollbar and no swipe to recover them. On a phone the column that goes is usually the money.

- The `<Table>` primitive carries its own scroller. Use it and there is nothing to do.
- A hand-rolled `<table>` goes in `<div className="table-scroll">` (index.css).
- Never wrap either in `overflow-hidden`.
- `.table-scroll` also pins `thead th` to one line. That half is not cosmetic: without it the browser
  resolves the overflow by wrapping every header into three lines, so nothing overflows, no scrollbar
  appears, and the table "fits" while being unreadable.
- If the table already sits in a `max-h-… overflow-y-auto` box with a sticky header, put
  `table-scroll` on THAT box rather than nesting a second scroller inside it — a nested scroll
  container re-parents the sticky `<thead>` to a box with no height and silently kills it.

Guarded by [tests/unit/responsiveTableOverflow.test.ts](../tests/unit/responsiveTableOverflow.test.ts).

### Section rail

A settings/section rail is a COLUMN on `lg`+ and a horizontal strip below it. Both `HubSideNav` and a
vertical Radix `TabsList` carry **`.section-rail`**, which is the whole mobile behaviour: one
swipeable row of content-width chips, group captions hidden, the active chip scrolled into view, and
a fade on whichever edge still has sections on it (`useStripAffordance` stamps `data-overflow`).

Without it a rail on a phone is 11–19 full-width rows stacked above the page, so the section the
reader selected renders below the fold and the page reads as empty — which is exactly how it was
reported. `flex-wrap` is the same bug with fewer rows.

The collapse breakpoint is `lg`, in the CSS **and** in the utilities. A rail that goes `sm:flex-col`
spends 640–1023px with the media query forcing a row and the utilities asking for a column.

---

## 6. Patterns (the `hub/` library)

`src/components/core/hub/` holds what the primitives compose into. The split matters: a `<Table>`
cannot know that money aligns right, that a filtered-empty list must not offer a create button, or
that a record page has three columns with three different jobs. Those rules live here, once.

| Component | What it is |
|---|---|
| `HubToolbar` | The sunken band above a list: search left, filters left, actions right. |
| `HubFilterSelect` | A filter chip. **Turns accent when active** — a list showing 3 of 400 rows otherwise just looks like a list with 3 rows. |
| `HubDataTable` | Selection, sorting, skeleton rows, empty state, footer band. Generic over the row type. |
| `HubCellLink` / `HubCellEmpty` | The one accent entry point per row; and the em dash that says "no value" rather than "render failed". |
| `HubRecordLayout` | The three-column record shell. |
| `HubRecordIdentity` | Avatar + name + role + quick actions, top of the left rail. |
| `HubPanel` | A rail panel, optionally collapsible. 12px semibold header — a record page carries 8–12 of these. |
| `HubProperty` / `HubPropertyList` | Stored fields. Stacked by default: a side-by-side pair in a 300px rail truncates every email address. |
| `HubTimeline` + `Group` + `Item` | The activity feed. Grouped, because 200 undifferentiated events answer "what happened here" with "everything, equally". |
| `HubStatTile` / `HubStatGrid` | KPI tile with a meaning-coloured delta; auto-fitting grid (no orphan tile on the last row). |
| `HubSideNav` | The settings / section rail. Active row = tint + leading accent bar. Below `lg` it is a horizontal strip, not a column — see §5, Section rail. |
| `HubTabNav` | Underline tabs for routes and saved views. Route tabs are real `<a>`s — middle-click and ⌘-click are how people use a tab strip. |
| `HubEmptyState` | Two variants, because "you have none" and "your filters excluded all 4,000" need opposite offers. **Always pass `action`** — see §6b. |

---

## 6b. Empty states

**An empty surface must offer the way out of being empty.** This is the most common defect in the
platform's UI, and the most invisible one: the text is correct, the component renders, the types
are fine, and the screen only looks wrong to somebody who has no data — which is never the person
writing the code and rarely the person reviewing it.

`ContractsSection` rendered a bare `No contracts yet.` eight lines below its own `canCreate` and
`openCreate`. The button the user needed was in scope the whole time, unused. That shape repeated
**116 times across 74 files**.

There are three kinds of empty, and they need three different offers:

| Kind | Reads as | Offer |
|---|---|---|
| **Nothing yet** | "You have no contracts" | The create action. |
| **Filtered out** | "No contacts match these filters" | *Clear filters*. **Never** the create action — offering "New contact" to somebody with 4,000 contacts and a stage filter set is how duplicates get made. |
| **Not enabled** | "Finance is a paid module" | Enable / buy / ask the owner. Already handled at route level by `EntitlementGuard` — do not hand-roll it. |

```tsx
{rows.length === 0 ? (
  activeFilters > 0 ? (
    <HubEmptyState
      variant="filtered"
      icon={FileSignature}
      title="No contracts match your filters"
      description="Widen the search or clear a filter to see the rest."
      action={<Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button>}
    />
  ) : (
    <HubEmptyState
      icon={FileSignature}
      title="No contracts yet"
      description="One sentence on what a contract is FOR — not what the button does."
      action={canCreate ? <Button size="sm" onClick={openCreate}><Plus /> New contract</Button> : undefined}
    />
  )
) : ( … )}
```

Write the `description` as *what the thing is for*, not *how to make one*. "Contracts are signable
agreements — draft one, send a signing link, and the signed PDF is stored against the record" tells
a new user why they would want one; "Click New contract to add a contract" tells them nothing they
could not read off the button.

Ratcheted by [tests/unit/emptyStates.test.ts](../tests/unit/emptyStates.test.ts) against
`.github/empty-state-baseline.json`. A new actionless empty state fails the build; the recorded
count may only go down.

---

## 7. The three screen archetypes

Almost every screen here is one of three. Build the archetype, don't reinvent it.

### List screen

```
PageHeader (+ HubTabNav for saved views)
└── one bordered panel
    ├── HubToolbar   search · filters · actions
    ├── HubDataTable
    └── footer       count / bulk actions / pagination
```

The toolbar and the table are **one object**, not two stacked cards. Three cards down a list screen
gives you three white boxes with two gutters of dead space between them.

### Record screen

```
PageHeader
└── HubRecordLayout
    ├── left    WHO/WHAT is this        identity + property panels   (300px)
    ├── centre  WHAT HAPPENED           tabs + timeline              (fluid)
    └── right   WHAT IT CONNECTS TO     deals, files, companies      (300px)
```

Rails are fixed-width because they hold label/value pairs; the centre is fluid because it holds
prose. Below `lg` it stacks in that order, which is also decreasing usefulness on a phone.

### Dashboard / report screen

```
PageHeader
├── HubStatGrid    the numbers
└── panels         charts and tables, each with a CardHeader
```

---

## 8. Navigation

**The top nav and the apps mega-menu are deliberately unchanged in structure.** Only their state
treatment moved onto the system: an active nav item is a tinted item with accent text, not a solid
accent pill — same rule as tabs, for the same reason. The bar is opaque (a backdrop blur over a
flat canvas blurs nothing and still costs a compositor pass per scroll frame) and 48px tall.

Side rails (`HubSideNav`, `.sidebar-item`) mark the active row with a 3px leading accent bar.

---

## 9. Do / Don't

**Surfaces**
- ✅ `bg-card` + `border-hairline` + `rounded-md`
- ❌ `backdrop-blur`, translucent panel fills, `shadow-lg` on a resting card, hover lift on a panel that is not a link

**Colour**
- ✅ tokens, always
- ❌ `bg-gray-*`, `text-white`, hex literals, `bg-white/8`-style off-scale opacity (compiles to nothing)

**Shape**
- ✅ 4px buttons, 2px tags, 6px panels, `rounded-full` only for avatars/dots
- ❌ `rounded-full` on a button, a tab, or a status chip

**Tabs**
- ✅ underline
- ❌ a filled pill — that is what a button looks like

**Tables**
- ✅ sticky header, hairline rows, right-aligned `tabular-nums` money, an explicit empty state
- ❌ zebra stripes, `overflow-hidden` wrappers, a `<table>` with no `.table-scroll`, an empty `<td>`, a status rendered as a solid pill

**Type**
- ✅ weight for hierarchy; serif for h1/h2 only
- ❌ a global weight override; `text-*` overrides on `CardTitle`; uppercase table headers

**Empty states**
- ✅ `<HubEmptyState>` with an `action`; `variant="filtered"` when filters are what emptied it
- ❌ a bare `<p>No X yet.</p>`; the create button on a filtered-empty list

**Money & dates** — orthogonal to design but caught by CI on every page:
`formatMoney` from `@/utils/decimal`, `todayLocalISO()` from `@/utils/datetime`. Never a local
re-implementation of either, not even in a demo page.

---

## 10. New page checklist

1. `<PageHeader icon title subtitle breadcrumbs actions />` — one per page.
2. Pick an archetype from §7 and use its `hub/` components.
3. Every colour from a token. No `text-white`, no `bg-gray-*`, no hex.
4. Controls at `h-9`; one solid button.
5. Tables: sortable headers, right-aligned numbers, and an empty state that OFFERS something (§6b).
6. Check it in **all four** theme combinations at `/design-system`.
7. Check it at 375px wide — wide tables scroll, they do not clip.
8. `npm run lint && npm run typecheck && npm test`.

---

## 11. Image optimization

All Supabase Storage image URLs should be passed through [`getOptimizedImageUrl()`](../src/utils/imageOptimization.ts) before rendering. This appends Supabase imgproxy query params (`width`, `quality`, `format=origin`) so the storage layer returns a transformed image instead of the full original.

```ts
import { getOptimizedImageUrl } from '@/utils/imageOptimization';

// Thumbnail / list view
<img src={getOptimizedImageUrl(product.image_url, { width: 400, quality: 80 })} />

// Card / preview
<img src={getOptimizedImageUrl(product.image_url, { width: 800, quality: 85 })} />

// External URLs (Pinterest, Replicate, etc.) pass through unchanged
<img src={getOptimizedImageUrl('https://example.com/x.jpg', { width: 400 })} />
```

**Behaviour**:
- URL contains `/storage/v1/object/public/` → transform params appended
- Any other URL (CDN, data URI, blob) → returned untouched
- Defaults: `quality = 75`, `width` omitted (= no resize)
- Existing query strings on the URL are preserved (the function appends with `&`)

**When to use which width**:

| Context | Width | Quality |
|---------|-------|---------|
| List/table thumbnail | 200–400 | 75–80 |
| Card preview | 600–800 | 80–85 |
| Modal hero / detail | 1200–1600 | 85–90 |
| Full-screen / lightbox | omit width | 90 |

Used by: `ProductCard`, `SearchResultCard`, `MoodBoardDetailPage`, `ProgressiveImageGrid`, both `ImagesTab` admin views, `ProductStrip`.

---

---

## 12. Reference files

| File | Holds |
|---|---|
| [src/index.css](../src/index.css) | Tokens, surface classes, tab treatment, canvas |
| [tailwind.config.ts](../tailwind.config.ts) | Radius scale, shadow scale, surface/hairline colours |
| [src/components/core/ui/](../src/components/core/ui/) | Primitives |
| [src/components/core/hub/](../src/components/core/hub/) | Patterns |
| [src/components/shared/PageHeader.tsx](../src/components/shared/PageHeader.tsx) | Page identity band |
| [src/components/shared/SectionHeader.tsx](../src/components/shared/SectionHeader.tsx) | Section lead-in |
| [src/pages/DesignSystemPage.tsx](../src/pages/DesignSystemPage.tsx) | The live specimen sheet |
| [tests/unit/designSystem.test.ts](../tests/unit/designSystem.test.ts) | The guard — what would silently undo this |
| [src/utils/imageOptimization.ts](../src/utils/imageOptimization.ts) | `getOptimizedImageUrl` (§11) |
