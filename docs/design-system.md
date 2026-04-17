# Design System

The full reference lives at [`.claude/design-system.md`](../.claude/design-system.md) (1060 lines — every token, component, pattern). This doc is the high-level summary plus the most recent layout/theme changes that anyone touching the UI needs to know.

---

## Theme — Dark mode

The platform shipped a dark-theme migration in April 2026. All components assume a near-black background and light foreground.

| Token | HSL | Hex (approx) | Use |
|-------|-----|--------------|-----|
| `--background` | `0 0% 7%` | `#121212` | App background |
| `--foreground` | `0 0% 92%` | `#ebebeb` | Default text |
| `--primary` | `330 50% 35%` | brightened plum | CTA buttons, active tab background, links |
| `--primary-foreground` | `0 0% 98%` | near-white | Text on primary surfaces |
| `--accent` | `22 60% 18%` | dark warm brown | Hover surfaces, secondary highlights |
| `--card` (glass) | `rgba(255,255,255,0.05)` + `backdrop-filter: blur(12px)` | — | All admin/dashboard cards |

The old beige/light theme is gone. There is no light mode toggle.

---

## Layout — Floating glass top nav (desktop) + drawer (mobile)

The previous left sidebar was replaced with a horizontal top navigation in the April 2026 redesign.

```
   m-4 ─────────────────────────────────────────────────────────────
  ┌───────────────────────────────────────────────────────────────┐
  │ [Logo] [Search …]                          [Profile menu]     │   h-20, rounded-3xl
  │  glass-panel · bg-white/5 · border-white/8 · sticky top-0     │   floating, not flush
  └───────────────────────────────────────────────────────────────┘
                              Page content
```

- **Header height**: `h-20` (80px), sticky, with `m-4 rounded-3xl` so it floats as a glass card rather than touching screen edges
- **Style**: `glass-panel bg-white/5 border border-white/8` (matches `.dashboard-card` aesthetic)
- **Logo**: left-aligned, `w-10 h-10 rounded-2xl` icon container
- **Search bar**: centered, `max-w-xl h-12`
- **Profile/account menu**: right-aligned, `h-10 w-10 rounded-full` avatar trigger
- **Admin pages**: accessed via the `/admin` landing page (a grid of feature boxes), not a separate left rail

Components: [`src/components/core/Header.tsx`](../src/components/core/Header.tsx) for desktop. [`src/components/core/Sidebar.tsx`](../src/components/core/Sidebar.tsx) is still a real component but only renders as a mobile `Sheet` drawer (triggered by a hamburger button on small screens) — desktop users never see it. Don't add new desktop sidebar UI.

---

## Typography

- **Font**: Open Sans
- **Global weight remap** (intentional — headings are light by design):
  - `font-bold` → 300
  - `font-semibold` → 400
  - `font-medium` → 400
- Don't fight the remap with inline `style={{ fontWeight: ... }}` — change the design instead.

---

## Buttons

All buttons are pill-shaped (`rounded-full`). Variants: `default` (plum), `outline`, `secondary`, `ghost`, `destructive`, `link`.

> **Common mistake**: do **not** add `rounded-full` to `TabsTrigger`. Pill shape is for buttons only — tabs use the standard rounded-md.

---

## Tabs

```tsx
<TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
  <TabsTrigger
    className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
  >
    Tab name
  </TabsTrigger>
</TabsList>
```

Active tab uses `--primary` background. No pill, no underline.

---

## Cards

Use the `.dashboard-card` utility class — it bundles the glass effect (rgba white 0.05 + blur 12px on dark background). Never recreate the styling inline.

```tsx
<div className="dashboard-card p-6">…</div>
```

---

## Tables

```tsx
<Card>
  <CardContent className="p-0">
    <Table>…</Table>
  </CardContent>
</Card>
```

Rules:
- `<CardContent className="p-0">` — no inner padding around the table
- No wrapper div around the `<Table>`
- No fixed column widths — let Radix/Tailwind size naturally

---

## Image optimization

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

## Related

- [`.claude/design-system.md`](../.claude/design-system.md) — full token reference and component recipes
- [`src/index.css`](../src/index.css) — CSS variable definitions
- [CLAUDE.md](../CLAUDE.md) — "Design System Summary" section
