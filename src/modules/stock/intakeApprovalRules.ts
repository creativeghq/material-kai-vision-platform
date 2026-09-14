/**
 * Approving a queued supplier line answers TWO questions, not one (#406).
 *
 * "This product exists" is true of every line ever invoiced. "This quantity arrived" is true only
 * of a delivery being received now — and 96% of the queue is older than thirty days, nearly two
 * years of purchase invoices whose goods are long since sold, installed or consumed. Import-free so
 * the predicates can be tested without a client.
 */

export type StockMode = 'auto' | 'catalog_only' | 'catalog_and_stock';

export type AdditionMode = 'catalog_only' | 'catalog_and_stock';

export interface IntakeAddition {
  pending_item_id: string;
  approved_at: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  unit_cost: number | null;
  added_to_stock: boolean;
  product_id: string | null;
  product_name: string | null;
  warehouse_item_id: string | null;
  qty_on_hand: number | null;
  movement_id: string | null;
  movement_qty: number | null;
  document_issue_date: string | null;
  mode: AdditionMode;
}

export const STOCK_MODE_LABEL: Record<StockMode, string> = {
  auto: 'Decide from the document date',
  catalog_only: 'Catalogue only — no stock',
  catalog_and_stock: 'Receive the stock too',
};

export const ADDITION_MODE_LABEL: Record<AdditionMode, string> = {
  catalog_only: 'Catalogue only',
  catalog_and_stock: 'Catalogue and stock',
};

/** A document older than this is an archive, not a delivery. */
export const ARCHIVE_AFTER_DAYS = 30;

/**
 * What `auto` will resolve to for one line, so the screen can say it BEFORE the operator presses
 * Add rather than after. The server derives the same thing from the same date; this exists to let
 * the confirmation name the mode, which is the whole failure the split addresses — "Add all 431
 * queued lines" reads identically whether or not it is about to invent a year of inventory.
 */
export const autoStockMode = (
  documentIssueDate: string | null | undefined,
  today: string,
): AdditionMode => {
  if (!documentIssueDate) return 'catalog_and_stock';
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - ARCHIVE_AFTER_DAYS);
  return documentIssueDate >= cutoff.toISOString().slice(0, 10)
    ? 'catalog_and_stock'
    : 'catalog_only';
};

/** `auto` sends nothing and lets the server decide; an explicit choice is sent as a boolean. */
export const stockOverrideFor = (mode: StockMode): boolean | undefined =>
  mode === 'auto' ? undefined : mode === 'catalog_and_stock';

/**
 * The confirmation must name the mode. A bulk that posts a year of stock movements and one that
 * posts none are the same sentence otherwise.
 */
export const bulkConfirmText = (count: number, where: string, mode: StockMode): string => {
  const head = `Add ${count} queued line(s) to ${where}?`;
  const body = mode === 'catalog_only'
    ? 'They will be created as products with their cost, price and supplier link, and NO stock '
      + 'movement — the shelf is opened at zero.'
    : mode === 'catalog_and_stock'
      ? 'This posts a stock movement for EVERY line. Use catalogue-only for historic invoices: '
        + 'those goods are already sold or installed.'
      : 'Each line decides from its own document date: within '
        + `${ARCHIVE_AFTER_DAYS} days it is received into stock, older than that it is catalogued only.`;
  return `${head}\n\n${body}`;
};

/** An approval can be undone, and the undo reverses the stock without deleting the product. */
export const additionCanBeUndone = (a: IntakeAddition): boolean => !!a.pending_item_id;

export const UNDO_KEEPS_THE_PRODUCT =
  'Undo reverses the stock with a compensating movement and queues the line again. The product '
  + 'stays: it may already be on a quote, an order or an image association.';

/**
 * A match verdict is stamped at queue time and AGES. After a catalogue import the row can still
 * read "will create a new product" while approval is about to link to an ingested one.
 */
export const matchVerdictIsStale = (
  scoredAt: string | null | undefined,
  now: Date = new Date(),
): boolean => {
  if (!scoredAt) return true;
  const days = (now.getTime() - new Date(scoredAt).getTime()) / 86400000;
  return days > 7;
};
