#!/usr/bin/env node

/**
 * Clear Interrupted Jobs Script
 * 
 * This script clears all interrupted jobs from the database to allow fresh processing.
 * Use this when jobs get stuck in 'interrupted' state after service restarts.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bgbavxtjlbvgplozizxu.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnYmF2eHRqbGJ2Z3Bsb3ppenh1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MTkwNjAzMSwiZXhwIjoyMDY3NDgyMDMxfQ.KCfP909Qttvs3jr4t1pTYMjACVz2-C-Ga4Xm_ZyecwM';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function clearInterruptedJobs() {
    console.log('🧹 Clearing interrupted jobs...\n');

    try {
        // Get all interrupted jobs
        const { data: jobs, error: fetchError } = await supabase
            .from('background_jobs')
            .select('id, document_id, filename, progress, error, interrupted_at')
            .eq('status', 'interrupted')
            .order('interrupted_at', { ascending: false });

        if (fetchError) {
            console.error('❌ Failed to fetch interrupted jobs:', fetchError);
            return;
        }

        if (!jobs || jobs.length === 0) {
            console.log('✅ No interrupted jobs found');
            return;
        }

        console.log(`📊 Found ${jobs.length} interrupted jobs:\n`);
        jobs.forEach((job, index) => {
            console.log(`${index + 1}. Job ID: ${job.id}`);
            console.log(`   Document: ${job.filename || job.document_id}`);
            console.log(`   Progress: ${job.progress}%`);
            console.log(`   Error: ${job.error || 'Unknown'}`);
            console.log(`   Interrupted: ${job.interrupted_at}`);
            console.log('');
        });

        // Delete all interrupted jobs
        const { error: deleteError } = await supabase
            .from('background_jobs')
            .delete()
            .eq('status', 'interrupted');

        if (deleteError) {
            console.error('❌ Failed to delete interrupted jobs:', deleteError);
            return;
        }

        console.log(`✅ Successfully deleted ${jobs.length} interrupted jobs`);
        console.log('✅ Database is now clean and ready for fresh processing\n');

    } catch (error) {
        console.error('❌ Error:', error);
    }
}

// Run the script
clearInterruptedJobs();

