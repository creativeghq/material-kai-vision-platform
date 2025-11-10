/**
 * Scheduled Import Runner Edge Function
 * 
 * Runs on cron schedule to execute scheduled XML imports
 * Fetches XML from source_url and creates new import jobs
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ScheduledJob {
  id: string;
  workspace_id: string;
  category: string;
  source_name: string;
  source_url: string;
  cron_schedule: string;
  next_run_at: string;
  field_mappings: Record<string, string>;
  mapping_template_id: string | null;
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get all scheduled jobs that are due to run
    const now = new Date().toISOString();
    const { data: scheduledJobs, error: fetchError } = await supabaseClient
      .from('data_import_jobs')
      .select('*')
      .eq('is_scheduled', true)
      .lte('next_run_at', now)
      .eq('status', 'completed'); // Only re-run completed jobs

    if (fetchError) {
      throw new Error(`Failed to fetch scheduled jobs: ${fetchError.message}`);
    }

    if (!scheduledJobs || scheduledJobs.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'No scheduled jobs due to run',
          jobs_processed: 0,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    const results = [];

    for (const job of scheduledJobs as ScheduledJob[]) {
      try {
        // Fetch XML from source URL
        const xmlResponse = await fetch(job.source_url);
        if (!xmlResponse.ok) {
          throw new Error(`Failed to fetch XML: ${xmlResponse.statusText}`);
        }

        const xmlContent = await xmlResponse.text();
        const xmlBase64 = btoa(xmlContent);

        // Call xml-import-orchestrator to create new import job
        const { data: importResult, error: importError } = await supabaseClient.functions.invoke(
          'xml-import-orchestrator',
          {
            body: {
              workspace_id: job.workspace_id,
              category: job.category,
              xml_content: xmlBase64,
              source_name: `${job.source_name} (Scheduled)`,
              field_mappings: job.field_mappings,
              mapping_template_id: job.mapping_template_id,
              parent_job_id: job.id, // Link to original scheduled job
            },
          }
        );

        if (importError) {
          throw new Error(`Import failed: ${importError.message}`);
        }

        // Calculate next run time based on cron schedule
        const nextRunAt = calculateNextRun(job.cron_schedule);

        // Update scheduled job with last_run_at and next_run_at
        await supabaseClient
          .from('data_import_jobs')
          .update({
            last_run_at: now,
            next_run_at: nextRunAt,
          })
          .eq('id', job.id);

        results.push({
          job_id: job.id,
          source_name: job.source_name,
          status: 'success',
          new_job_id: importResult.job_id,
          next_run_at: nextRunAt,
        });
      } catch (error: any) {
        console.error(`Error processing scheduled job ${job.id}:`, error);
        results.push({
          job_id: job.id,
          source_name: job.source_name,
          status: 'error',
          error: error.message,
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobs_processed: scheduledJobs.length,
        results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Scheduled import runner error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

/**
 * Calculate next run time based on cron schedule
 * Simplified implementation - supports common patterns
 */
function calculateNextRun(cronSchedule: string): string {
  const now = new Date();
  
  // Parse cron: minute hour day month dayOfWeek
  const parts = cronSchedule.split(' ');
  
  // Common patterns
  if (cronSchedule === '0 * * * *') {
    // Every hour
    now.setHours(now.getHours() + 1, 0, 0, 0);
  } else if (cronSchedule === '0 */6 * * *') {
    // Every 6 hours
    now.setHours(now.getHours() + 6, 0, 0, 0);
  } else if (cronSchedule === '0 */12 * * *') {
    // Every 12 hours
    now.setHours(now.getHours() + 12, 0, 0, 0);
  } else if (cronSchedule === '0 0 * * *') {
    // Daily at midnight
    now.setDate(now.getDate() + 1);
    now.setHours(0, 0, 0, 0);
  } else if (cronSchedule === '0 0 * * 0') {
    // Weekly on Sunday
    const daysUntilSunday = (7 - now.getDay()) % 7 || 7;
    now.setDate(now.getDate() + daysUntilSunday);
    now.setHours(0, 0, 0, 0);
  } else if (cronSchedule === '0 0 1 * *') {
    // Monthly on 1st
    now.setMonth(now.getMonth() + 1, 1);
    now.setHours(0, 0, 0, 0);
  } else {
    // Default: 1 hour from now
    now.setHours(now.getHours() + 1);
  }
  
  return now.toISOString();
}

