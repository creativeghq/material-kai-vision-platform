# MaterialsHub — User Documentation

A self-contained, static HTML guide to the end-user areas of the MaterialsHub platform.
No build step — open `documentation/index.html` in any browser (or serve the folder).

## Structure

- `index.html` — landing page + section grid.
- One HTML file per functional area (e.g. `dashboard.html`, `finance.html`, `quotes.html`).
- `assets/style.css` — shared styles (light docs theme with the brand gradient).
- `assets/nav.js` — single source of truth for the sidebar + prev/next pager.
  Each page only contains its `<main class="content">`; the sidebar is injected by `nav.js`,
  so navigation lives in **one** place.

## Screenshots

Screenshots are **not** committed to the repo. They live in the public Supabase Storage
bucket **`documentation`** and are referenced by their public URL:

```
https://bgbavxtjlbvgplozizxu.supabase.co/storage/v1/object/public/documentation/<area>/<file>.png
```

Folder layout in the bucket mirrors the docs (e.g. `dashboard/`, `finance/`, `tools/`).

## Adding or editing a page

1. Copy any existing page (e.g. `dashboard.html`) as a template.
2. Add an entry to the `GROUPS` array in `assets/nav.js` so it appears in the sidebar/pager.
3. Upload any new screenshots to the `documentation` bucket under a matching `<area>/` folder
   and reference them with the public URL above.

## Scope

This guide covers **end-user** pages only. Admin (`/admin/*`) screens are intentionally
out of scope.

## Keeping it current

The guide is refreshed in sweeps. Each sweep records the last commit it covered here, so the
next one starts from exactly that point:

```
git log <last-synced>..HEAD --no-merges --format="%h %s" | grep -E " (feat|fix)"
```

Read each change against the page that describes its area, correct what moved or was renamed,
add what is new, then update the marker below in the same commit as the page edits.

**Last synced through:** `c6c2a0f91` (2026-10-13)
