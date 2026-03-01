# Monitoring and Alerting System

## Overview

The Material KAI Vision Platform now has comprehensive monitoring and alerting across all job types:
- **PDF Processing Jobs** - Full checkpoint recovery and heartbeat monitoring
- **Web Scraping Sessions** - Stuck session detection and recovery
- **XML Import Jobs** - Timeout detection and failure alerts

All failures are automatically reported to **Sentry** for real-time alerting and debugging.

---

## 🚨 Sentry Integration

### Sentry Project
- **Project**: Material KAI Vision Platform
- **DSN**: `https://3f930a475eb29d63b5e78b1ebabaef78@o4509716458045440.ingest.de.sentry.io/4510301517316176`
- **Region**: EU (Germany)

### What Gets Reported to Sentry

#### 1. PDF Processing Failures
- **Trigger**: Job fails during processing
- **Tags**: `job_id`, `document_id`, `job_type`, `error_type`, `stage`
- **Context**: Full job details, progress, stage information, error message
- **Fingerprint**: `['pdf-processing-failed', stage]`

#### 2. Stuck PDF Jobs
- **Trigger**: Job monitor detects stuck job (no heartbeat for 15min OR no update for 5min)
- **Tags**: `job_id`, `document_id`, `error_type: stuck_job`, `failure_reason`
- **Context**: Job details, progress, timestamps, stuck duration
- **Fingerprint**: `['stuck-job', reason]`

#### 3. Stuck Scraping Sessions
- **Trigger**: Job monitor detects stuck scraping session (no update for 30min)
- **Tags**: `session_id`, `job_type: web_scraping`, `error_type: stuck_scraping_session`, `source_url`
- **Context**: Session details, page counts, stuck duration
- **Fingerprint**: `['stuck-scraping-session', source_url]`

#### 4. Scraping Session Failures
- **Trigger**: Edge Function scrape-session-manager encounters error
- **Tags**: `function: scrape-session-manager`, `error_type: scraping_session_failed`, `session_id`, `source_url`
- **Context**: Session details, page counts, error message
- **Fingerprint**: `['scraping-session-failed', source_url]`

#### 5. Stuck XML Import Jobs
- **Trigger**: Job monitor detects stuck import job (no update for 20min)
- **Tags**: `import_job_id`, `job_type: xml_import`, `error_type: stuck_import_job`, `source_name`
- **Context**: Job details, product counts, stuck duration
- **Fingerprint**: `['stuck-import-job', source_name]`

#### 6. XML Import Job Failures
- **Trigger**: Edge Function xml-import-orchestrator encounters error
- **Tags**: `function: xml-import-orchestrator`, `error_type: xml_import_job_failed`, `job_id`, `source_name`
- **Context**: Job details, product counts, retry count, error message
- **Fingerprint**: `['xml-import-job-failed', source_name]`

---

## 📊 Job Monitor Service

### Location
`mivaa-pdf-extractor/app/services/job_monitor_service.py`

### Features

#### 1. Multi-Job Type Monitoring
- **PDF Processing Jobs**: Heartbeat + timeout detection
- **Web Scraping Sessions**: Timeout detection (30min)
- **XML Import Jobs**: Timeout detection (20min)

#### 2. Detection Methods

**PDF Jobs:**
- **Heartbeat Timeout**: No heartbeat for 15 minutes (crash detection)
- **Update Timeout**: No update for 5 minutes (stuck detection)

**Scraping Sessions:**
- **Update Timeout**: No update for 30 minutes
- **Status**: `processing` or `scraping`

**Import Jobs:**
- **Update Timeout**: No update for 20 minutes
- **Status**: `processing`

#### 3. Recovery Strategies

**PDF Jobs:**
1. Check for valid checkpoint
2. If checkpoint exists and is valid → Auto-restart from checkpoint
3. If no checkpoint or invalid → Mark as failed + Sentry alert

**Scraping Sessions:**
1. Mark session as failed
2. Send Sentry alert with session details
3. Update linked background_job if exists

**Import Jobs:**
1. Mark job as failed
2. Send Sentry alert with job details
3. Update linked background_job if exists

#### 4. Configuration

The `JobMonitorService` is configured with `check_interval=60` (check every 60 seconds), `stuck_timeout=5` (PDF jobs: 5min timeout), `auto_restart=True` (enable auto-restart for PDF jobs), and `max_restart_attempts=3` (max 3 restart attempts per job).

---

## 🔄 Checkpoint Recovery System

### Location
`mivaa-pdf-extractor/app/services/checkpoint_recovery_service.py`

### Features
- **Automatic Checkpointing**: Save progress after each stage
- **Crash Recovery**: Resume from last successful checkpoint
- **Data Validation**: Verify checkpoint data before resuming
- **Retry Logic**: Exponential backoff with max 3 attempts

### Checkpoint Stages
1. `pdf_loaded` - PDF file loaded and validated
2. `text_extracted` - Text extraction completed
3. `tiles_generated` - Image tiles generated
4. `embeddings_created` - Vector embeddings created
5. `materials_extracted` - Materials extracted and saved

---

## 🌐 Edge Function Monitoring

### Sentry Helper
**Location**: `supabase/functions/_shared/sentry.ts`

**Functions**:
- `captureException(error, context)` - Report errors
- `captureMessage(message, level, context)` - Report messages

The helper is used in edge functions by importing `captureException` from the shared module, then wrapping processing logic in a try/catch that calls `captureException` with tags (function name, error type), extra context (job ID, error message), and a fingerprint for Sentry grouping before re-throwing the error.

### Monitored Edge Functions
1. **scrape-session-manager** - Web scraping orchestration
2. **xml-import-orchestrator** - XML import processing

---

## 📈 Monitoring Dashboard

### Sentry Dashboard
Access at: https://sentry.io/organizations/basilis-kanonidis/issues/

**Key Metrics**:
- Error rate by job type
- Stuck job frequency
- Recovery success rate
- Average processing time
- Failure patterns by stage

### Database Tables

**background_jobs**:
- `status`: pending, processing, completed, failed
- `last_heartbeat`: Updated every 30 seconds during processing
- `progress`: 0-100 percentage
- `current_stage`: Current processing stage
- `error`: Error message if failed

**scraping_sessions**:
- `status`: pending, processing, scraping, completed, failed
- `total_pages`, `completed_pages`, `failed_pages`
- `error_message`: Error details if failed

**data_import_jobs**:
- `status`: pending, processing, completed, failed
- `total_products`, `processed_products`, `failed_products`
- `error_message`: Error details if failed

---

## 🔧 Troubleshooting

### Common Issues

**1. Stuck Jobs Not Recovering**
- Check job monitor logs: `docker logs mivaa-pdf-extractor`
- Verify checkpoint data exists in database
- Check Sentry for detailed error context

**2. Sentry Alerts Not Appearing**
- Verify SENTRY_DSN is set correctly
- Check Sentry project quota
- Review Edge Function logs for Sentry errors

**3. High Failure Rate**
- Review Sentry dashboard for patterns
- Check resource usage (CPU, memory)
- Verify external service availability (Firecrawl, Claude API)

---

## 📝 Best Practices

1. **Monitor Sentry Daily**: Check for new error patterns
2. **Review Stuck Jobs**: Investigate why jobs get stuck
3. **Optimize Timeouts**: Adjust based on actual processing times
4. **Test Recovery**: Periodically test checkpoint recovery
5. **Update Fingerprints**: Keep Sentry fingerprints unique for proper grouping
