import type { AgentRunContext } from './types.ts';
import { generateStructuredWithClaude, z } from '../ai-client.ts';
import { loadPrompt } from '../prompt-utils.ts';
import { wrapUntrusted } from '../untrusted.ts';
import { containsPersonalData } from './enquiry-personal-data.ts';

/** Only enquiries that arrived after the owner agreed to this (#592); older Inbox history is never read. */
export const ENQUIRY_QUESTIONS_FROM = '2026-11-19T00:00:00Z';
const BATCH = 10;

const Out = z.object({
  question: z.string().nullable().describe('The generic buyer question, or null when the enquiry is not a product or project question'),
  existing_index: z.number().int().nullable().describe('Index of an EXISTING question that already asks the same thing, else null'),
  language_code: z.string().describe('ISO 639-1 code of the question'),
});

interface Lead { id: string; name: string | null; email: string | null; phone: string | null; company_name: string | null; title: string | null; request: string | null }

export interface EnquiryPassResult {
  recorded: number; none: number; rejected: number; failed: { lead_id: string; reason: string }[];
  inputTokens: number; outputTokens: number;
}

export async function deriveEnquiryQuestions(ctx: AgentRunContext, model: string): Promise<EnquiryPassResult> {
  const { supabase, workspaceId } = ctx;
  const res: EnquiryPassResult = { recorded: 0, none: 0, rejected: 0, failed: [], inputTokens: 0, outputTokens: 0 };
  const { data: leads, error } = await supabase.from('crm_leads')
    .select('id, name, email, phone, company_name, title, request')
    .eq('workspace_id', workspaceId).not('capture_flow_id', 'is', null).is('enquiry_question_at', null)
    .gte('created_at', ENQUIRY_QUESTIONS_FROM).order('created_at', { ascending: true }).limit(BATCH);
  if (error) throw new Error(`enquiry leads unreadable: ${error.message}`);
  if (!leads?.length) return res;

  const system = await loadPrompt(supabase, 'agent', 'lead_enquiry_question');
  const { data: existingRows } = await supabase.from('workspace_enquiry_questions')
    .select('question').eq('workspace_id', workspaceId).is('dismissed_at', null)
    .order('enquiries', { ascending: false }).limit(50);
  const existing = ((existingRows ?? []) as { question: string }[]).map((r) => r.question);

  for (const lead of leads as Lead[]) {
    const text = [lead.title, lead.request].filter(Boolean).join('\n').trim();
    const record = async (question: string | null, language: string | null) => {
      const { error: rpcErr } = await supabase.rpc('record_enquiry_question', { p_lead_id: lead.id, p_question: question, p_language: language });
      if (rpcErr) throw new Error(rpcErr.message);
    };
    try {
      if (!text) { await record(null, null); res.none++; continue; }
      const prompt = [
        'EXISTING questions:', existing.length ? existing.map((q, i) => `${i}. ${q}`).join('\n') : '(none)', '',
        wrapUntrusted('enquiry', text.slice(0, 4000)),
      ].join('\n');
      const out = await generateStructuredWithClaude(prompt, Out, {
        model, systemPrompt: system, maxTokens: 400, task: 'lead_enquiry_question', workspaceId: workspaceId ?? undefined, agentRunId: ctx.run.id,
      });
      res.inputTokens += out.usage.inputTokens;
      res.outputTokens += out.usage.outputTokens;
      const v = out.output;
      const reused = v.existing_index !== null && v.existing_index >= 0 && v.existing_index < existing.length
        ? existing[v.existing_index] : null;
      const question = reused ?? (v.question?.trim() || null);
      if (!question) { await record(null, null); res.none++; continue; }
      if (!reused && containsPersonalData(question, lead)) { await record(null, null); res.rejected++; continue; }
      await record(question, v.language_code?.slice(0, 2).toLowerCase() || null);
      if (!reused) existing.push(question);
      res.recorded++;
    } catch (e) {
      res.failed.push({ lead_id: lead.id, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return res;
}
