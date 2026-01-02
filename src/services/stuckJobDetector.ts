/**
 * Stuck Job Detector Service
 *
 * Detects and reports stuck jobs across all processing types:
 * - PDF Processing (background_jobs)
 * - Web Scraping (scraping_sessions)
 * - XML Import (background_jobs)
 */

import { createClient } from '@/lib/supabase/client';

export interface StuckJob {
  id: string;
  type: 'pdf_processing' | 'xml_import' | 'web_scraping';
  status: string;
  lastHeartbeat: string | null;
  stuckDuration: number; // minutes
  recoveryAttempts: number;
  canRecover: boolean;
  metadata?: any;
}

export interface StuckJobReport {
  timestamp: string;
  totalStuck: number;
  byType: {
    pdf_processing: number;
    xml_import: number;
    web_scraping: number;
  };
  jobs: StuckJob[];
}

export class StuckJobDetector {
  private supabase = createClient();

  /**
   * Detect all stuck jobs across all processing types
   */
  async detectStuckJobs(): Promise<StuckJobReport> {
    const [pdfJobs, scrapingJobs, xmlJobs] = await Promise.all([
      this.detectStuckPdfJobs(),
      this.detectStuckScrapingJobs(),
      this.detectStuckXmlJobs(),
    ]);

    const allJobs = [...pdfJobs, ...scrapingJobs, ...xmlJobs];

    return {
      timestamp: new Date().toISOString(),
      totalStuck: allJobs.length,
      byType: {
        pdf_processing: pdfJobs.length,
        xml_import: xmlJobs.length,
        web_scraping: scrapingJobs.length,
      },
      jobs: allJobs,
    };
  }

  /**
   * Detect stuck PDF processing jobs
   * Criteria: status='processing' AND last_heartbeat > 10 minutes ago
   */
  private async detectStuckPdfJobs(): Promise<StuckJob[]> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('background_jobs')
      .select('*')
      .eq('status', 'processing')
      .eq('job_type', 'product_discovery_upload')
      .lt('last_heartbeat', tenMinutesAgo);

    if (error) {
      console.error('[StuckJobDetector] Error detecting stuck PDF jobs:', error);
      return [];
    }

    return (data || []).map(job => this.mapToStuckJob(job, 'pdf_processing'));
  }

  /**
   * Detect stuck web scraping jobs
   * Criteria: status='processing' AND last_heartbeat_at > 5 minutes ago
   */
  private async detectStuckScrapingJobs(): Promise<StuckJob[]> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('scraping_sessions')
      .select('*')
      .eq('status', 'processing')
      .lt('last_heartbeat_at', fiveMinutesAgo);

    if (error) {
      console.error('[StuckJobDetector] Error detecting stuck scraping jobs:', error);
      return [];
    }

    return (data || []).map(job => ({
      id: job.id,
      type: 'web_scraping' as const,
      status: job.status,
      lastHeartbeat: job.last_heartbeat_at,
      stuckDuration: this.calculateStuckDuration(job.last_heartbeat_at),
      recoveryAttempts: job.recovery_attempts || 0,
      canRecover: (job.recovery_attempts || 0) < 3,
      metadata: {
        url: job.url,
        background_job_id: job.background_job_id,
      },
    }));
  }

  /**
   * Detect stuck XML import jobs
   * Criteria: status='processing' AND job_type='xml_import' AND created_at > 30 minutes ago
   */
  private async detectStuckXmlJobs(): Promise<StuckJob[]> {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

    const { data, error } = await this.supabase
      .from('background_jobs')
      .select('*')
      .eq('status', 'processing')
      .eq('job_type', 'xml_import')
      .lt('created_at', thirtyMinutesAgo);

    if (error) {
      console.error('[StuckJobDetector] Error detecting stuck XML jobs:', error);
      return [];
    }

    return (data || []).map(job => this.mapToStuckJob(job, 'xml_import'));
  }

  private mapToStuckJob(job: any, type: 'pdf_processing' | 'xml_import'): StuckJob {
    const lastHeartbeat = job.last_heartbeat || job.updated_at;
    return {
      id: job.id,
      type,
      status: job.status,
      lastHeartbeat,
      stuckDuration: this.calculateStuckDuration(lastHeartbeat),
      recoveryAttempts: job.recovery_attempts || 0,
      canRecover: (job.recovery_attempts || 0) < 3,
      metadata: {
        filename: job.filename,
        document_id: job.document_id,
        progress: job.progress,
      },
    };
  }

  private calculateStuckDuration(lastHeartbeat: string | null): number {
    if (!lastHeartbeat) return 0;
    const diff = Date.now() - new Date(lastHeartbeat).getTime();
    return Math.floor(diff / (60 * 1000)); // minutes
  }
}

export const stuckJobDetector = new StuckJobDetector();

