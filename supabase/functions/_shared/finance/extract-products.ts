// Shared — AI extraction of clean, sellable product attributes from raw supplier
// expense-line descriptions (myDATA inbound docs). Cheapest model (Haiku 4.5).
// AI usage (tokens/model/cost) is auto-logged to ai_usage_logs by the ai-client under
// task='expense_product_extraction'. Credit/entitlement gating is the CALLER's job.
import { generateStructuredWithClaude, z } from '../ai-client.ts';

export interface ExpenseLineInput { index: number; description: string; quantity?: number | null }
export interface ProductSuggestion {
  index: number; name: string; sku: string | null; unit: string | null; size: string | null; attributes: string | null;
}

const Schema = z.object({
  suggestions: z.array(z.object({
    index: z.number().int(),
    name: z.string(),
    sku: z.string().nullable(),
    unit: z.string().nullable(),
    size: z.string().nullable(),
    attributes: z.string().nullable(),
  })),
});

const MODEL = 'claude-haiku-4-5';

/** Returns one suggestion per input line (best-effort; empty array on failure). */
export async function extractProductsFromLines(lines: ExpenseLineInput[]): Promise<ProductSuggestion[]> {
  const usable = lines.filter((l) => String(l.description ?? '').trim());
  if (usable.length === 0) return [];

  const lineText = usable
    .map((l) => `${l.index}. ${String(l.description).slice(0, 220)}${l.quantity != null ? ` (qty ${l.quantity})` : ''}`)
    .join('\n');
  const prompt = `These are line items from a Greek supplier invoice. For each line, extract a clean, sellable product. Be conservative — never invent values; use null when unknown.
- name: concise product name (drop tax/qty noise, keep brand/model)
- sku: product/model code if present, else null
- unit: unit of measure (pcs, m, m2, kg, lt, …) if inferable, else null
- size: dimensions/size if present (e.g. "60x60", "10mm", "1.5L"), else null
- attributes: short summary of other attributes (color, finish, material), else null
Return exactly one suggestion per input line, preserving its index.

Lines:
${lineText}`;

  try {
    const res = await generateStructuredWithClaude(prompt, Schema, {
      model: MODEL, task: 'expense_product_extraction', temperature: 0.2, maxTokens: 1500,
    });
    return res.output?.suggestions ?? [];
  } catch {
    return [];
  }
}
