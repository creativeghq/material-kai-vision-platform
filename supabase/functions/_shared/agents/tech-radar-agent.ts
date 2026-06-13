/**
 * Background Agent: Tech Radar
 *
 * The "background brain" behind Pepper. One background_agents row per watched
 * subject (config.subject_id), fired on a cron cadence by agent-scheduler-cron.
 * On each tick it re-researches the subject's tech landscape and surfaces only
 * the NEW improvement ideas (cross-run dedupe lives in persistFindings).
 *
 * Sibling to model-health-check: that one answers "is our model still UP?";
 * this one answers "is there something BETTER we should move to?". When a new
 * finding is in the `models` category, the chain trigger can fan out to
 * model-health-check to confirm the candidate is actually live before we trust
 * an 'adopt'.
 *
 * Config (background_agents.config):
 *   subject_id   string   The tech_radar_subjects row this monitor watches (required)
 *   force        boolean  Ignore next_review_at and review now (default false)
 */

import type { AgentRunner, AgentRunContext, AgentRunResult } from './types.ts';
import { svcClient, runRadarForSubject } from '../tools/tech-radar-tools.ts';

export class TechRadarAgent implements AgentRunner {
  readonly agentType    = 'tech-radar';
  readonly name         = 'Tech Radar';
  readonly description  = 'Watches the tech landscape for a tracked solution and surfaces new, ring-scored improvement ideas (adopt/trial/assess/hold).';
  readonly defaultTools = ['web_search'];
  readonly defaultModel = 'claude-sonnet-4-6';

  async run(ctx: AgentRunContext): Promise<AgentRunResult> {
    const { agentConfig, run, input, log, heartbeat } = ctx;
    const cfg = { ...agentConfig.config, ...input } as Record<string, unknown>;

    const subjectId = String(cfg.subject_id ?? '');
    const force = Boolean(cfg.force ?? false);

    if (!subjectId) {
      await log('error', 'tech-radar agent has no subject_id in config');
      return { success: false, output: { error: 'no subject_id configured' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    const sb = svcClient();
    const { data: subject, error } = await sb.from('tech_radar_subjects').select('*').eq('id', subjectId).maybeSingle();
    if (error || !subject) {
      await log('error', 'subject not found', { subject_id: subjectId, error: error?.message });
      return { success: false, output: { error: 'subject not found' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    if (!subject.is_active) {
      await log('info', 'subject inactive — skipping', { subject_id: subjectId });
      return { success: true, output: { skipped: 'inactive' }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    // Respect the per-subject cadence unless forced. The cron tick is coarse
    // (daily/weekly) and next_review_at is the fine-grained gate.
    if (!force && subject.next_review_at && new Date(subject.next_review_at).getTime() > Date.now()) {
      await log('info', 'not due yet — skipping', { subject_id: subjectId, next_review_at: subject.next_review_at });
      return { success: true, output: { skipped: 'not_due', next_review_at: subject.next_review_at }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }

    await log('info', `Tech-radar review starting for "${subject.title}"`, { subject_id: subjectId });
    await heartbeat();

    try {
      const result = await runRadarForSubject(sb, subject, { runId: run.id });
      await heartbeat();

      await log('info', `Tech-radar review complete: ${result.newCount} new of ${result.total} findings`, {
        subject_id: subjectId,
        new_count: result.newCount,
        total: result.total,
        cost_usd: result.rawCostUsd,
      });

      // Chain only when there's a fresh model-category 'adopt'/'trial' worth a
      // liveness check. The chained agent (e.g. model-health-check) receives
      // this output as its input.
      const hasModelCandidate = result.rows.some(
        (r: any) => r.is_new && r.category === 'models' && (r.ring === 'adopt' || r.ring === 'trial'),
      );

      return {
        success: true,
        output: {
          subject_id: subjectId,
          title: subject.title,
          summary: result.summary,
          new_count: result.newCount,
          total: result.total,
          new_findings: result.rows.filter((r: any) => r.is_new).map((r: any) => ({ title: r.title, ring: r.ring, category: r.category })),
        },
        inputTokens: 0,   // token accounting handled inside the research core's ai_usage_logs write
        outputTokens: 0,
        creditsDebited: 0,
        triggerChain: hasModelCandidate,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await log('error', 'tech-radar review failed', { subject_id: subjectId, error: msg });
      return { success: false, output: { error: msg }, inputTokens: 0, outputTokens: 0, creditsDebited: 0 };
    }
  }
}
