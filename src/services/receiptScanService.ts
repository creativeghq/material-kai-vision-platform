/**
 * Receipt scanning (#379) — a photograph becomes the fields an expense needs.
 *
 * One service for both callers: the rep's expense card in the sales portal, and Finance's
 * "Record an expense". Neither of them owns the extraction, and neither of them should hand-roll
 * the file reading, the size limits or the vocabulary of a failed scan.
 *
 * WHAT THIS DOES NOT DO, on purpose: it never writes. `scan` reads an image and returns fields;
 * the caller creates the record. A scanner that also booked the expense would be an automation
 * quietly writing money rows off a model's reading of a photograph. The design is
 * prefill-then-confirm, and `needs_review` on the row is what carries that through to the screen.
 *
 * THE DATE IS NOT DEFAULTED SERVER-SIDE. `doc_date` comes back null when the receipt's date could
 * not be read, and the caller fills it with `todayLocalISO()`. The edge function runs in UTC, and
 * a UTC "today" between local midnight and 03:00 is YESTERDAY on a record that gets numbered by
 * date (invariant 1b).
 */
import { supabase } from '@/integrations/supabase/client';

/** What the reader found. Every field is nullable because a receipt need not state it. */
export interface ReceiptFields {
  vendor: string | null;
  /** YYYY-MM-DD as printed, or null when it was ambiguous or absent. Never today's date. */
  doc_date: string | null;
  currency: string | null;
  total_gross: number | null;
  vat_amount: number | null;
  net: number | null;
  document_number: string | null;
  category_hint: string | null;
  /** 0..1, how legible the document was. NOT a permission to skip the human. */
  confidence: number;
  /**
   * Whether net + VAT actually equals the printed total. `null` when the document did not state
   * all three. Reported rather than corrected — a document that disagrees with itself is worth
   * showing the operator, and silently picking two of the three numbers is how a wrong figure
   * gets booked with nothing to notice it.
   */
  foots: boolean | null;
}

export interface ScanResult {
  /** Explicit marker, never inferred from empty fields: 'failed' is retryable, 'extracted' is not. */
  status: 'extracted' | 'failed';
  unreadable: boolean;
  fields: ReceiptFields;
}

/** Roughly what the edge function accepts; checked here so a doomed upload never costs a credit. */
const MAX_BYTES = 4 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';

/** The `accept` attribute for any file input feeding this service — one list, not four. */
export const RECEIPT_ACCEPT = ACCEPT;

export class ReceiptTooLargeError extends Error {}

/** Read a File to base64 without the data: prefix the edge function would have to strip. */
export async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  // Chunked: `String.fromCharCode(...bytes)` blows the argument limit on a multi-MB photo, which
  // is a RangeError on exactly the large files this path exists to handle.
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export const receiptScanService = {
  /**
   * Read one receipt. Throws on a refusal (no credits, too large, unsupported type) so the caller
   * can report it; returns `status: 'failed'` when the scan RAN and the paper was illegible, which
   * is a different thing and the only one of the two worth retrying with a better photo.
   */
  async scan(workspaceId: string, file: File): Promise<ScanResult> {
    if (file.size > MAX_BYTES) {
      throw new ReceiptTooLargeError('That photo is too large — retake it at a smaller size (under about 4 MB).');
    }
    const { data, error } = await supabase.functions.invoke('scan-receipt', {
      body: {
        action: 'scan',
        workspace_id: workspaceId,
        content_type: file.type || 'image/jpeg',
        data_base64: await fileToBase64(file),
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'The receipt could not be read.');
    return { status: data.status, unreadable: Boolean(data.unreadable), fields: data.fields as ReceiptFields };
  },

  /** Store the receipt image against a supplier bill (Finance's expense). */
  async attachToBill(billId: string, file: File): Promise<{ signed_url: string | null }> {
    const { data, error } = await supabase.functions.invoke('scan-receipt', {
      body: {
        action: 'attach_bill',
        bill_id: billId,
        filename: file.name,
        content_type: file.type || 'application/octet-stream',
        data_base64: await fileToBase64(file),
      },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error || 'Could not attach the receipt.');
    return { signed_url: data.signed_url ?? null };
  },

  /** A fresh signed URL for a receipt already on a bill — the bucket is private. */
  async signBillReceipt(billId: string): Promise<string | null> {
    const { data, error } = await supabase.functions.invoke('scan-receipt', {
      body: { action: 'sign_bill', bill_id: billId },
    });
    if (error) throw error;
    return data?.signed_url ?? null;
  },
};

/**
 * The net/VAT split to prefill a form with.
 *
 * The form's own fields are NET and VAT; a receipt states the GROSS. Handing the gross straight to
 * a "Subtotal (net)" field books a VAT-bearing cost with its tax folded into the net — the P&L
 * cost is overstated and the recoverable VAT is lost. That exact mistake is called out on
 * `NewExpenseDialog`'s own prefill contract, so this derives the pair once, here.
 *
 * When the document states only a gross, VAT is 0 and the whole sum is net: that is what a receipt
 * with no VAT line actually says, and inventing a rate for it would be a guess wearing the costume
 * of a reading.
 */
export function splitForForm(f: ReceiptFields): { net: number; vat: number } {
  const gross = f.total_gross ?? 0;
  if (f.net !== null && f.vat_amount !== null) return { net: f.net, vat: f.vat_amount };
  if (f.vat_amount !== null && gross > 0) return { net: Math.round((gross - f.vat_amount) * 100) / 100, vat: f.vat_amount };
  if (f.net !== null && gross > 0) return { net: f.net, vat: Math.round((gross - f.net) * 100) / 100 };
  return { net: gross, vat: 0 };
}
