/**
 * Job Notification Helpers
 * Convenience functions for sending job-related notifications
 */

import { notificationService } from './NotificationService';

export interface BackgroundJob {
  id: string;
  job_type: string;
  status: string;
  progress: number;
  metadata?: any;
  error?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

/**
 * Send notification when a job starts
 */
export async function notifyJobStarted(userId: string, job: BackgroundJob): Promise<void> {
  const jobTypeLabel = formatJobType(job.job_type);

  await notificationService.send({
    userId,
    notificationType: 'job_started',
    title: `${jobTypeLabel} Started`,
    message: `Your ${jobTypeLabel.toLowerCase()} job has started processing.`,
    data: {
      job_id: job.id,
      job_type: job.job_type,
      action_url: `${window.location.origin}/admin/async-jobs?job=${job.id}`,
    },
    channels: ['push'], // Only push for job started
  });
}

/**
 * Send notification when a job completes successfully
 */
export async function notifyJobCompleted(userId: string, job: BackgroundJob): Promise<void> {
  const jobTypeLabel = formatJobType(job.job_type);
  const duration = calculateDuration(job.started_at, job.completed_at);

  // Build summary message
  let summary = `Completed in ${duration}`;
  if (job.metadata) {
    const stats = extractJobStats(job);
    if (stats) {
      summary += `\n\n${stats}`;
    }
  }

  await notificationService.send({
    userId,
    notificationType: 'job_completed',
    title: `✅ ${jobTypeLabel} Completed`,
    message: summary,
    data: {
      job_id: job.id,
      job_type: job.job_type,
      duration,
      metadata: job.metadata,
      action_url: `${window.location.origin}/admin/async-jobs?job=${job.id}`,
    },
  });
}

/**
 * Send notification when a job fails
 */
export async function notifyJobFailed(userId: string, job: BackgroundJob): Promise<void> {
  const jobTypeLabel = formatJobType(job.job_type);

  await notificationService.send({
    userId,
    notificationType: 'job_failed',
    title: `❌ ${jobTypeLabel} Failed`,
    message: job.error || 'The job encountered an error and could not complete.',
    data: {
      job_id: job.id,
      job_type: job.job_type,
      error: job.error,
      action_url: `${window.location.origin}/admin/async-jobs?job=${job.id}`,
    },
  });
}

/**
 * Send notification when a job is interrupted
 */
export async function notifyJobInterrupted(userId: string, job: BackgroundJob): Promise<void> {
  const jobTypeLabel = formatJobType(job.job_type);

  await notificationService.send({
    userId,
    notificationType: 'job_interrupted',
    title: `⚠️ ${jobTypeLabel} Interrupted`,
    message: `Your ${jobTypeLabel.toLowerCase()} job was interrupted and may need to be restarted.`,
    data: {
      job_id: job.id,
      job_type: job.job_type,
      action_url: `${window.location.origin}/admin/async-jobs?job=${job.id}`,
    },
  });
}

/**
 * Send progress update for long-running jobs
 */
export async function notifyJobProgress(
  userId: string,
  job: BackgroundJob,
  milestone: number, // e.g., 25, 50, 75
): Promise<void> {
  const jobTypeLabel = formatJobType(job.job_type);

  await notificationService.send({
    userId,
    notificationType: 'job_progress',
    title: `${jobTypeLabel} - ${milestone}% Complete`,
    message: `Your ${jobTypeLabel.toLowerCase()} is ${milestone}% complete.`,
    data: {
      job_id: job.id,
      job_type: job.job_type,
      progress: job.progress,
      milestone,
      action_url: `${window.location.origin}/admin/async-jobs?job=${job.id}`,
    },
    channels: ['push'], // Only push for progress updates
  });
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================
function formatJobType(jobType: string): string {
  const labels: Record<string, string> = {
    'pdf_processing': 'PDF Processing',
    'web_scraping': 'Web Scraping',
    'product_discovery_upload': 'Product Discovery',
    'image_embedding_regeneration': 'Image Embedding Regeneration',
    'xml_import': 'XML Import',
  };
  return labels[jobType] || jobType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function calculateDuration(startedAt?: string, completedAt?: string): string {
  if (!startedAt || !completedAt) return 'Unknown';

  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function extractJobStats(job: BackgroundJob): string | null {
  const metadata = job.metadata;
  if (!metadata) return null;

  const stats: string[] = [];

  // PDF Processing
  if (metadata.chunks_created) stats.push(`${metadata.chunks_created} chunks`);
  if (metadata.products_created) stats.push(`${metadata.products_created} products`);
  if (metadata.images_saved) stats.push(`${metadata.images_saved} images`);

  // Image Embeddings
  if (metadata.images_processed) stats.push(`${metadata.images_processed} images`);
  if (metadata.embeddings_generated) stats.push(`${metadata.embeddings_generated} embeddings`);

  // Web Scraping
  if (metadata.pages_scraped) stats.push(`${metadata.pages_scraped} pages`);
  if (metadata.materials_processed) stats.push(`${metadata.materials_processed} materials`);

  return stats.length > 0 ? stats.join(', ') : null;
}

