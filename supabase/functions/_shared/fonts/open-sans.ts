// Shared Open Sans embedder for pdf-lib documents (#207 follow-up — single
// platform typeface across server-generated PDFs too).
//
// Open Sans is the platform-wide UI/document font. pdf-lib only ships the
// standard-14 fonts (Helvetica et al.), so to render PDFs in Open Sans we embed
// the TTF via fontkit. The static instances cover Latin + Greek + Cyrillic +
// Euro (verified), so Greek invoices render correctly.
//
// Bytes are fetched once per worker and cached in memory. If the fetch fails we
// fall back to Helvetica so PDF generation (incl. legal invoices) NEVER breaks
// on a font hiccup — worst case a PDF looks like it did before this change.
//
// Requires the importing function's deno.json to map `pdf-lib` and
// `@pdf-lib/fontkit`.
import { PDFDocument, StandardFonts, type PDFFont } from 'pdf-lib';
// @pdf-lib/fontkit's published types declare no default export, so `import fontkit from`
// failed to typecheck (TS1192) even though esm.sh's interop makes it work at runtime.
// Resolve the namespace and prefer its default if present — correct either way, and it
// does not change which object reaches registerFontkit.
import * as fontkitNs from '@pdf-lib/fontkit';
const fontkit = (fontkitNs as unknown as { default?: unknown }).default ?? fontkitNs;

const OPEN_SANS_URLS = {
  // The app loads weights 300/400/500/600; 600 (SemiBold) is its heaviest, so
  // SemiBold is the document "bold" — matches the light-weight design system.
  regular: 'https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-Regular.ttf',
  bold: 'https://cdn.jsdelivr.net/gh/googlefonts/opensans@main/fonts/ttf/OpenSans-SemiBold.ttf',
};

let cachedBytes: { regular: Uint8Array; bold: Uint8Array } | null = null;

async function loadOpenSansBytes(): Promise<{ regular: Uint8Array; bold: Uint8Array } | null> {
  if (cachedBytes) return cachedBytes;
  try {
    const [r, b] = await Promise.all([fetch(OPEN_SANS_URLS.regular), fetch(OPEN_SANS_URLS.bold)]);
    if (!r.ok || !b.ok) return null;
    const [rb, bb] = await Promise.all([r.arrayBuffer(), b.arrayBuffer()]);
    cachedBytes = { regular: new Uint8Array(rb), bold: new Uint8Array(bb) };
    return cachedBytes;
  } catch {
    return null;
  }
}

export interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
  /** true when Open Sans embedded; false when it fell back to Helvetica. */
  isOpenSans: boolean;
}

/**
 * Embed Open Sans (regular + semibold) into `pdf`. Pass `{ subset: false }` to
 * embed the full font (e.g. when the text is generated after embedding and the
 * subsetter can't see all glyphs up front). Defaults to subsetting.
 */
export async function embedOpenSans(pdf: PDFDocument, opts?: { subset?: boolean }): Promise<EmbeddedFonts> {
  const bytes = await loadOpenSansBytes();
  if (!bytes) {
    return {
      regular: await pdf.embedFont(StandardFonts.Helvetica),
      bold: await pdf.embedFont(StandardFonts.HelveticaBold),
      isOpenSans: false,
    };
  }
  pdf.registerFontkit(fontkit);
  const subset = opts?.subset !== false;
  return {
    regular: await pdf.embedFont(bytes.regular, { subset }),
    bold: await pdf.embedFont(bytes.bold, { subset }),
    isOpenSans: true,
  };
}
