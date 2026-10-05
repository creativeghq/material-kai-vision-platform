// Open Sans for every pdf-lib document. pdf-lib's standard-14 fonts are WinAnsi and cannot encode
// Greek, so there is no Helvetica fallback: a font that cannot be loaded is a FAILED render.
// The TTFs are pinned to one upstream commit and verified by SHA-256, so a mirror can neither
// drift to a different font nor serve something else under the same name.
import type { PDFDocument, PDFFont } from 'pdf-lib';
// @pdf-lib/fontkit's types declare no default export; esm.sh's interop provides one at runtime.
import * as fontkitNs from '@pdf-lib/fontkit';
const fontkit = (fontkitNs as unknown as { default?: unknown }).default ?? fontkitNs;

const OPEN_SANS_COMMIT = 'bd7e37632246368c60fdcbd374dbf9bad11969b6';
const MIRRORS = [
  `https://cdn.jsdelivr.net/gh/googlefonts/opensans@${OPEN_SANS_COMMIT}/fonts/ttf/`,
  `https://raw.githubusercontent.com/googlefonts/opensans/${OPEN_SANS_COMMIT}/fonts/ttf/`,
];
// SemiBold is the document "bold" — the app's heaviest loaded weight.
const FILES = {
  regular: { name: 'OpenSans-Regular.ttf', sha256: 'c53aceea2dcf5b4098099c0c4d0a061d17e178a049317b42a422b1a9f7f8eb59' },
  bold: { name: 'OpenSans-SemiBold.ttf', sha256: '4a413711684a9dd564ef0f1c10cb62b5d9f7eb6df2cff962f5341a6ecd5f64ae' },
} as const;

export class PdfFontUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PdfFontUnavailable';
  }
}

export interface OpenSansBytes {
  regular: Uint8Array;
  bold: Uint8Array;
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchVerified(file: { name: string; sha256: string }): Promise<Uint8Array> {
  const failures: string[] = [];
  for (const base of MIRRORS) {
    try {
      const res = await fetch(base + file.name, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) {
        await res.body?.cancel();
        failures.push(`${new URL(base).host}: HTTP ${res.status}`);
        continue;
      }
      const buf = await res.arrayBuffer();
      if ((await sha256Hex(buf)) === file.sha256) return new Uint8Array(buf);
      failures.push(`${new URL(base).host}: sha256 mismatch`);
    } catch (e) {
      failures.push(`${new URL(base).host}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new PdfFontUnavailable(`PDF font ${file.name} could not be loaded (${failures.join('; ')})`);
}

let cached: Promise<OpenSansBytes> | null = null;

/** The verified TTF bytes, fetched once per isolate. Throws `PdfFontUnavailable`. */
export function loadOpenSansBytes(): Promise<OpenSansBytes> {
  cached ??= Promise.all([fetchVerified(FILES.regular), fetchVerified(FILES.bold)])
    .then(([regular, bold]) => ({ regular, bold }))
    .catch((e) => {
      cached = null;
      throw e;
    });
  return cached;
}

export interface EmbeddedFonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** Embed Open Sans (regular + semibold) into `pdf`, subset unless `{ subset: false }`. */
export async function embedOpenSans(pdf: PDFDocument, opts?: { subset?: boolean }): Promise<EmbeddedFonts> {
  const bytes = await loadOpenSansBytes();
  pdf.registerFontkit(fontkit as Parameters<PDFDocument['registerFontkit']>[0]);
  const subset = opts?.subset !== false;
  return {
    regular: await pdf.embedFont(bytes.regular, { subset }),
    bold: await pdf.embedFont(bytes.bold, { subset }),
  };
}
