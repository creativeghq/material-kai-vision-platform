/**
 * Auto-Recovery Service
 * 
 * Automatically recovers stuck jobs with exponential backoff:
 * - Attempt 1: Immediate recovery
 * - Attempt 2: After 5 minutes
 * - Attempt 3: After 15 minutes
 * - After 3 failures: Mark as failed and alert admin
 */

import { createClient } from '@/lib/supabase/client';
import { stuckJobDetector, StuckJob } from './stuckJobDetector';
import * as Sentry from '@sentry/nextjs';

export interface RecoveryResult {
  jobId: string;
  type: string;
  success: boolean;
  attempt: number;
  error?: string;
  action: 'recovered' | 'failed' | 'skipped';
}

export interface RecoveryReport {
  timestamp: string;
  totalAttempted: number;
  successful: number;
  failed: number;
  skipped: number;
  results: RecoveryResult[];
}

export class AutoRecoveryService {
  private supabase = createClient();

  /**
   * Run auto-recovery for all stuck jobs
   */
  async runAutoRecovery(): Promise<RecoveryReport> {
    console.log('[AutoRecovery] Starting auto-recovery scan...');

    // Detect stuck jobs
    const report = await stuckJobDetector.detectStuckJobs();
    console.log(`[AutoRecovery] Found ${report.totalStuck} stuck jobs`);

    if (report.totalStuck === 0) {
      return {
        timestamp: new Date().toISOString(),
        totalAttempted: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    // Attempt recovery for each stuck job
    const results = await Promise.all(
      report.jobs.map(job => this.recoverJob(job))
    );

    const summary = {
      timestamp: new Date().toISOString(),
      totalAttempted: results.length,
      successful: results.filter(r => r.action === 'recovered').length,
      failed: results.filter(r => r.action === 'failed').length,
      skipped: results.filter(r => r.action === 'skipped').length,
      results,
    };

    console.log('[AutoRecovery] Recovery complete:', summary);
    return summary;
  }

  /**
   * Attempt to recover a single stuck job
   */
  private async recoverJob(job: StuckJob): Promise<RecoveryResult> {
    console.log(`[AutoRecovery] Attempting recovery for ${job.type} job ${job.id}`);

    // Check if job can be recovered
    if (!job.canRecover) {
      console.log(`[AutoRecovery] Job ${job.id} exceeded max recovery attempts (3)`);
      await this.markAsFailed(job);
      return {
        jobId: job.id,
        type: job.type,
        success: false,
        attempt: job.recoveryAttempts,
        action: 'failed',
        error: 'Max recovery attempts exceeded',
      };
    }

    // Check exponential backoff
    if (!this.shouldAttemptRecovery(job)) {
      console.log(`[AutoRecovery] Skipping job ${job.id} - backoff period not elapsed`);
      return {
        jobId: job.id,
        type: job.type,
        success: false,
        attempt: job.recoveryAttempts,
        action: 'skipped',
        error: 'Backoff period not elapsed',
      };
    }

    try {
      // Attempt recovery based on job type
      let success = false;
      switch (job.type) {
        case 'pdf_processing':
          success = await this.recoverPdfJob(job);
          break;
        case 'web_scraping':
          success = await this.recoverScrapingJob(job);
          break;
        case 'xml_import':
          success = await this.recoverXmlJob(job);
          break;
      }

      if (success) {
        console.log(`[AutoRecovery] ✅ Successfully recovered ${job.type} job ${job.id}`);
        await this.incrementRecoveryAttempts(job, true);
        return {
          jobId: job.id,
          type: job.type,
          success: true,
          attempt: job.recoveryAttempts + 1,
          action: 'recovered',
        };
      } else {
        throw new Error('Recovery failed');
      }
    } catch (error: any) {
      console.error(`[AutoRecovery] ❌ Failed to recover ${job.type} job ${job.id}:`, error);
      await this.incrementRecoveryAttempts(job, false);

      // Send to Sentry
      Sentry.captureException(error, {
        tags: {
          job_id: job.id,
          job_type: job.type,
          recovery_attempt: job.recoveryAttempts + 1,
        },
      });

      return {
        jobId: job.id,
        type: job.type,
        success: false,
        attempt: job.recoveryAttempts + 1,
        action: 'failed',
        error: error.message,
      };
    }
  }

  /**
   * Check if recovery should be attempted based on exponential backoff
   */
  private shouldAttemptRecovery(job: StuckJob): boolean {
    if (job.recoveryAttempts === 0) return true; // First attempt - immediate

    if (!job.metadata?.last_recovery_at) return true;

    const lastRecovery = new Date(job.metadata.last_recovery_at).getTime();
    const now = Date.now();
    const minutesSinceLastRecovery = (now - lastRecovery) / (60 * 1000);

    // Exponential backoff: 5min, 15min, 30min
    const backoffMinutes = [5, 15, 30][job.recoveryAttempts - 1] || 30;

    return minutesSinceLastRecovery >= backoffMinutes;
  }

  /**
   * Recover stuck PDF processing job
   */
  private async recoverPdfJob(job: StuckJob): Promise<boolean> {
    // Call the PDF processor resume endpoint
    const response = await fetch(`/api/rag/documents/job/${job.id}/resume`, {
      method: 'POST',
    });

    return response.ok;
  }

  /**
   * Recover stuck web scraping job
   */
  private async recoverScrapingJob(job: StuckJob): Promise<boolean> {
    // Call the scrape-session-manager Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/scrape-session-manager`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          action: 'resume',
          sessionId: job.id,
        }),
      }
    );

    return response.ok;
  }

  /**
   * Recover stuck XML import job
   */
  private async recoverXmlJob(job: StuckJob): Promise<boolean> {
    // XML imports are usually fast - if stuck, restart from beginning
    const { error } = await this.supabase
      .from('background_jobs')
      .update({
        status: 'pending',
        progress: 0,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', job.id);

    return !error;
  }

  /**
   * Increment recovery attempts counter
   */
  private async incrementRecoveryAttempts(job: StuckJob, success: boolean): Promise<void> {
    const table = job.type === 'web_scraping' ? 'scraping_sessions' : 'background_jobs';

    await this.supabase
      .from(table)
      .update({
        recovery_attempts: job.recoveryAttempts + 1,
        last_recovery_at: new Date().toISOString(),
      })
      .eq('id', job.id);
  }

  /**
   * Mark job as permanently failed after max recovery attempts
   */
  private async markAsFailed(job: StuckJob): Promise<void> {
    const table = job.type === 'web_scraping' ? 'scraping_sessions' : 'background_jobs';

    await this.supabase
      .from(table)
      .update({
        status: 'failed',
        error: `Job stuck for ${job.stuckDuration} minutes. Max recovery attempts (3) exceeded.`,
      })
      .eq('id', job.id);

    // Send alert to Sentry
    Sentry.captureMessage(`Job ${job.id} permanently failed after 3 recovery attempts`, {
      level: 'error',
      tags: {
        job_id: job.id,
        job_type: job.type,
        stuck_duration: job.stuckDuration,
      },
    });
  }
}

export const autoRecoveryService = new AutoRecoveryService();
