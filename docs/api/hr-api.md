# HR API (edge function)

Reference for the `hr-api` Supabase edge function — the HR module (#252). Architecture context: employees are `crm_contacts` tagged with the global **Employee** category plus a companion `hr_employees` row; absences, departments, recruitment/ATS, onboarding, documents, payroll, attendance, accounting-document OCR, and Ergani (ΠΣ Εργάνη) submissions hang off it.

Source: [index.ts](../../supabase/functions/hr-api/index.ts) · [expansion.ts](../../supabase/functions/hr-api/expansion.ts) · [ergani.ts](../../supabase/functions/hr-api/ergani.ts) · [accounting.ts](../../supabase/functions/hr-api/accounting.ts) · client [hrService.ts](../../src/modules/hr/services/hrService.ts).

## Base

```http
POST /functions/v1/hr-api
Authorization: Bearer <supabase_access_token>
Content-Type: application/json

{ "action": "<action>", "workspace_id": "<uuid>", ...params }
```

Base URL: `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/hr-api`. Every request is a `POST` with a JSON body. `action` and `workspace_id` are always required (missing either → `400`). Auth is a Supabase **session JWT** (`Authorization: Bearer`) — there is no API-key path. Error shape is `{ "error": "human-readable message" }` (some AI actions add `"code": "insufficient_credits"`).

## Authentication & gating

Every call runs the same gate chain before dispatch ([index.ts](../../supabase/functions/hr-api/index.ts)). `authenticate()` yields a **service-role** client (RLS bypassed), so each gate is re-derived from the verified JWT — the body is never trusted:

1. **`authenticate(req, { requireUser: true })`** — `401` if no valid user.
2. **`userCanAccessWorkspace(supabase, userId, workspace_id)`** — binds caller ↔ workspace. On mismatch returns **`404` "not found"** (not `403`, to avoid workspace-id enumeration).
3. **Module published** — `isModuleEnabled('hr')`; `404` "HR module is not available" if the global switch is off.
4. **Entitlement** — `assertEntitled(workspace_id, 'hr')`; returns the helper's **`402`** upsell response when the workspace isn't entitled.
5. **RBAC** — resolved by `resolveHrAccess()`:
   - Global `admin` / `super_admin` → full access.
   - Workspace `owner` / `admin` → `hr.view` + `hr.manage`.
   - Plain workspace members → **neither** (`403`). HR salary/absence data is more restricted than general membership.
   - **Reads require `hr.view`; writes/approvals require `hr.manage`.** A caller with view but not manage gets `403` "You need HR manage permission for this action." on a write.
6. **Self-service exception** — actions prefixed **`self-`** are dispatched *before* the admin RBAC gate. They need only a **linked `hr_employees` row** (`user_id = caller`); a workspace member with role `employee` (and no `hr.view`) is allowed, and every `self-` handler is hard-scoped to that one employee record (`403` if the caller has no employee row).

Writes that create/attach a contact or employee use an explicit column allowlist (no mass-assignment); trust/identity fields are set server-side.

## Read pattern — most lists go direct to the DB, not through this function

The web client ([hrService.ts](../../src/modules/hr/services/hrService.ts)) reads the following **directly from the database** (RLS-gated — the `hr_*` SELECT policy is `is_workspace_admin(workspace_id) OR is_platform_operator()`, the identical owner/admin gate `resolveHrAccess` enforces on the edge), to avoid a cold-start on first navigation and per-tab round-trips:

- **Employees** (`hr_employees` + `vw_hr_employee_absence_summary`)
- **Absences** (`hr_absences`)
- **Departments** (`hr_departments`)
- **Job postings** & **Applications** (`hr_job_postings`, `hr_applications`)
- **Onboarding tasks** (`hr_onboarding_tasks`)
- **Documents** metadata (`hr_documents`)
- **Payroll runs** list (`hr_payroll_runs`)

The `hr-api` edge function is used for **writes**, **computed** reads (e.g. payroll run detail, timesheet, attendance board, analytics), **credit-metered AI** actions, **file uploads / signed URLs**, and **external** (Ergani) calls. The `list-*` actions below still exist server-side and return the same shapes — the client just prefers the direct-DB path for the plain lists above.

> Note: the read actions listed here (`list-employees`, `list-absences`, `list-departments`, `list-job-postings`, `list-applications`, `list-onboarding`, `list-documents`, `list-payroll-runs`) remain implemented in the function and are documented for completeness/back-compat; the current client reads them direct-to-DB instead.

## Actions

Legend for **Auth**: `view` = requires `hr.view` (owner/admin); `manage` = requires `hr.manage`; `self` = linked employee row only. Credit-metered actions are flagged 💳 (they debit usage-based credits and can return `402`).

### Employees

| Action | Params (required **bold**) | Auth | Description |
|---|---|---|---|
| `list-employees` | — | view | All employees with contact + manager + absence-summary rollup. |
| `create-employee` | `contact:{ name, … }` **or** `crm_contact_id`; employee fields (`employment_type`, `start_date`, `weekly_hours`, `annual_leave_allowance_days`, `manager_contact_id`, `status`, `department_id`, `monthly_salary`, `salary_currency`, `pay_basis`, `hourly_rate`, `amka`, `dependent_children`, `work_start_time`, `work_end_time`, `work_days`) | manage | Attach an existing in-workspace contact or create a new one, then create the `hr_employees` row and tag the contact **Employee**. `409` if the contact is already an employee. `201`. |
| `update-employee` | **`employee_id`**; any employee field; optional `contact:{…}` | manage | Patch the employee (and optionally its linked contact). `404` if not found. |

### Absences

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-absences` | `employee_id?`, `status?` | view | Absences (newest first), optionally filtered. |
| `record-absence` | **`employee_id`**, **`start_date`**, **`end_date`**, `absence_type?` (`vacation`/`sick`/`unpaid`/`other`, default `other`), `working_days?`, `note?` | manage | Insert a `pending` absence. `working_days` is server-computed (weekends excluded) unless overridden. `201`. |
| `approve-absence` | **`absence_id`** | manage | Set status `approved`, stamp `approved_by`. |
| `reject-absence` | **`absence_id`** | manage | Set status `rejected`. |

### Departments

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-departments` | — | view | Departments with head contact + live employee counts. |
| `create-department` | **`name`**, `description?`, `head_contact_id?` | manage | `409` on duplicate name. `201`. |
| `update-department` | **`department_id`**, `name?`, `description?`, `head_contact_id?` | manage | Patch. `404` if not found. |
| `delete-department` | **`department_id`** | manage | Delete. |

### Recruitment / ATS

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-job-postings` | — | view | Postings with department + applicant counts. |
| `create-job-posting` | **`title`**; `department_id?`, `employment_type?`, `location?`, `remote?`, `description?`, `requirements?`, `salary_min?`, `salary_max?`, `currency?`, `status?` (`draft`/`open`/`closed`) | manage | Setting `status:'open'` stamps `published_at`. `201`. |
| `update-job-posting` | **`job_posting_id`**; same fields | manage | Patch. `404` if not found. |
| `delete-job-posting` | **`job_posting_id`** | manage | Delete. |
| `generate-job-description` 💳 | **`title`**; `seniority?`, `department?`, `employment_type?`, `location?`, `keywords?`, `company?` | manage | Claude tool-use → `{ generated:{ description, requirements, suggested_salary_min?, suggested_salary_max? }, credits_used }`. Reserves up to 12 credits; `402` `insufficient_credits` if balance is short; refunds on AI failure. |
| `list-applications` | `job_posting_id?`, `stage?` | view | Applications with candidate + posting. |
| `create-application` | **`job_posting_id`**; `candidate_id` **or** `candidate:{ name, email?, phone?, headline?, source? }`; `notes?` | manage | Attach/create candidate, stage `applied`. `409` if candidate already applied. Emits `hr.applicant_stage_changed` flow event. `201`. |
| `update-application` | **`application_id`**; `stage?` (`applied`/`screening`/`interview`/`offer`/`hired`/`rejected`), `rating?`, `notes?` | manage | Patch; emits the stage-change flow event on transition. |
| `upload-application-cv` | **`candidate_id`**, **`content_base64`**, `filename?` | manage | Uploads the CV (≤10 MB) into `pdf-documents` under `hr/{workspace}/candidates/…` and stores `resume_path`. |
| `application-cv-url` | **`candidate_id`** | view | 5-minute signed URL to the candidate's CV. `404` if none on file. |
| `screen-application` 💳 | **`application_id`** | manage | Claude reads the CV PDF against the job → `{ application:{ id, ai_score, ai_summary, ai_rated_at }, credits_used }`. Reserves up to 20 credits; `402` if short; refunds on read/AI failure; requires an uploaded CV. |
| `hire-application` | **`application_id`**; `start_date?`, `department_id?` | manage | Creates a contact + `active` employee, tags **Employee**, closes the application (`hired`), seeds the default onboarding checklist → `{ employee_id, onboarding_seeded }`. `409` if already hired. `201`. |

### Onboarding

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-onboarding` | `employee_id?`, `pending_only?` | view | Onboarding tasks (by `sort_order`) with employee. |
| `add-onboarding-task` | **`employee_id`**, **`title`**; `description?`, `due_date?`, `assignee_contact_id?`, `sort_order?` | manage | `201`. |
| `toggle-onboarding-task` | **`task_id`** | manage | Flip `pending` ⇄ `done` (stamps/clears `completed_at`). |
| `delete-onboarding-task` | **`task_id`** | manage | Delete. |

### Documents

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-documents` | `employee_id?` | view | HR documents (metadata) with employee. |
| `upload-document` | **`name`**, **`content_base64`**; `doc_type?` (`contract`/`id`/`certificate`/`payslip`/`review`/`other`), `content_type?`, `employee_id?` | manage | Uploads (≤20 MB) into `pdf-documents` under `hr/{workspace}/…` and records the row. `201`. |
| `sign-document` | **`document_id`** | view | 5-minute signed URL (path forced under this workspace's `hr/` prefix). |
| `delete-document` | **`document_id`** | manage | Best-effort storage removal + row delete. |

### Payroll

Payroll runs a configurable rules engine (Greek 2026 defaults: 14 salaries/yr, EFKA employee 13.87% / employer 21.79%, progressive income tax with per-child credit taper). Setting `country_code:'none'` disables statutory auto-calc and honours a manual `deductions` override.

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-payroll-runs` | — | view | Runs (newest period first). |
| `create-payroll-run` | **`period`** (`YYYY-MM`), `currency?` | manage | Creates a `draft` run and auto-populates items from active employees (monthly salary, or hourly × hours/day × working days). `409` if the period run already exists. `201`. |
| `get-payroll-run` | **`run_id`** | view | Run + items + computed `summary` totals. |
| `update-payroll-item` | **`item_id`**, **`gross`**; `deductions?` (only with `country_code:'none'`), `note?` | manage | Recomputes the statutory breakdown from the rules on the new gross and re-totals the run. |
| `generate-payslips` | **`run_id`** | manage | Renders per-employee payslip PDFs (lazy `pdf-lib`) → `{ ok, payslips }`. |
| `get-payroll-settings` | — | view | Effective payroll settings (workspace row or Greek defaults with `is_default:true`). |
| `update-payroll-settings` | any of `country_code`, `currency`, `salaries_per_year`, `employee_contribution_rate`, `employer_contribution_rate`, `contribution_monthly_ceiling`, `income_tax_brackets`, `tax_credit_base`, `tax_credit_per_child`, `tax_credit_taper_per_1000`, `tax_credit_taper_floor` | manage | Upsert per-workspace settings. |
| `set-payroll-status` | **`run_id`**, **`status`** (`draft`/`approved`/`paid`) | manage | Stamps `approved_at` / `paid_at`. |
| `post-payroll-to-finance` | **`run_id`** | manage | Creates Finance `planned_payments`: one net-pay line per employee + income-tax (ΦΜΥ) + EFKA remittances; stores `posted_finance_ref`. `409` if already posted. |
| `invite-employee` | **`employee_id`**, **`email`** | manage | Invites (or links an existing auth user for) the employee to the portal, adds workspace role `employee` if not already a member, links `hr_employees.user_id`. `409` if the employee already has portal access. |

### Accounting documents ([accounting.ts](../../supabase/functions/hr-api/accounting.ts))

Monthly statutory documents (EFKA/tax slips, APD, bonuses…) → Claude OCR → reconcile against a payroll run and stamp payment IDs onto its Finance lines.

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-accounting-docs` | `period?` | view | Accounting docs (newest first). |
| `upload-accounting-doc` | **`period`** (`YYYY-MM`), **`name`**, **`content_base64`**; `content_type?`, `payroll_run_id?` | manage | Uploads (≤20 MB) under `hr/{workspace}/accounting/{period}/…`. `201`. |
| `sign-accounting-doc` | **`document_id`** | manage | 5-minute signed URL. |
| `delete-accounting-doc` | **`document_id`** | manage | Storage removal + row delete. |
| `analyze-accounting-doc` 💳 | **`document_id`** | manage | Claude OCR identifies the doc kind + extracts payment fields → `{ document, credits_used }`. Reserves up to 25 credits; `402` if short; refunds on read/AI failure. |
| `prepare-accounting-period` 💳 | **`period`** (`YYYY-MM`) | manage | Reconciles analyzed docs against the period's payroll obligations, flags discrepancies, best-effort stamps payment IDs onto Finance lines → `{ reconciliation, stamped_finance_lines, credits_used }`. Requires ≥1 analyzed doc; reserves up to 25 credits; `402` if short. |

### Attendance / kiosk / settings ([expansion.ts](../../supabase/functions/hr-api/expansion.ts))

| Action | Params | Auth | Description |
|---|---|---|---|
| `clock-employee` | **`employee_id`**, **`punch_type`** (`arrival`/`departure`), `comments?` | manage | Admin punch → local `hr_time_punches` row; files a Work Card to Ergani when credentials exist (`requireErgani:false`). |
| `set-employee-pin` | **`employee_id`**, `pin?` (4–8 digits; empty clears) | manage | Stores a salted PIN hash for kiosk clock-in. |
| `attendance-today` | — | view | Today's per-employee board (work-day flag, expected times, has-PIN, clocked-in state, last punch). |
| `list-notify-candidates` | — | view | Active workspace members eligible as extra late-alert recipients. |
| `get-hr-settings` | — | view | HR/kiosk/late-alert settings (or defaults with `is_default:true`). |
| `save-hr-settings` | any of `timezone`, `kiosk_enabled`, `kiosk_require_pin`, `late_alert_enabled`, `late_grace_minutes`, `notify_owner`, `notify_finance`, `notify_user_ids`, `notify_emails` | manage | Upsert settings. |
| `list-punches` | `employee_id?`, `from?`, `to?` | view | Punch history (≤1000, newest first). |
| `add-manual-punch` | **`employee_id`**, **`punch_type`**, `at?` (default now), `note?` | manage | Local correction/backfill punch — never filed to Ergani. `201`. |
| `update-punch` | **`punch_id`**; `punched_at?`, `punch_type?`, `is_late?` | manage | Local edit (does not retract any Ergani filing). |
| `delete-punch` | **`punch_id`** | manage | Delete. |
| `timesheet` | **`from`**, **`to`** (`YYYY-MM-DD`) | view | Pairs arrivals/departures into worked hours per employee/day. |

### Overview / analytics

| Action | Params | Auth | Description |
|---|---|---|---|
| `analytics` | — | view | Computed HR overview: `{ analytics:{ headcount, active, on_leave_today, total_absence_days, absence_by_type, headcount_by_department, departments, open_positions, recruitment_funnel, onboarding_pending, last_payroll } }`. |

### Ergani (ΠΣ Εργάνη) ([ergani.ts](../../supabase/functions/hr-api/ergani.ts))

All `ergani-*` actions run under the workspace's own Ergani credentials (`workspace_ergani_credentials`); if none are configured they return `400` `ergani_not_configured`. Upstream Ergani errors map to `400` (business) / `502` (upstream).

Every `ergani-submit-*` action accepts **`preview: true`**, which builds the body from Ergani's live template and returns `{ preview: true, code, document, filled, unfilled }` **without submitting** — `unfilled` lists the template keys the builder could not recognise, for the operator to complete. Passing an explicit `document` bypasses the builder entirely. Only a real submission writes an `hr_ergani_submissions` audit row.

| Action | Params | Auth | Description |
|---|---|---|---|
| `ergani-submission-types` | — | view | Live list of active submission types for this employer. |
| `ergani-document-schema` | **`code`** | view | Live JSON template for a submission code. |
| `ergani-employer-info` | — | view | Employer registry info (EX_BASE_01). |
| `ergani-submit-leave` | **`absence_id`**; `ergani_leave_code?`, `preview?`, `document?` | manage | Maps an `hr_absences` row onto Ergani's own leave template and submits; audited. |
| `ergani-submit-hire` | **`employee_id`**; `comments?`, `preview?`, `document?` | manage | **Ε3** hire announcement from the employee record. |
| `ergani-submit-schedule` | **`schedule_id`**; `kind?` (`schedule_weekly`/`schedule_daily`/`change`), `comments?`, `preview?`, `document?` | manage | **Ε4** roster → `WTOWeek`/`WTODaily`/`WKChgWK`, one detail row per working shift. Flips the schedule to `submitted` + stores the protocol. `409` if already filed. |
| `ergani-submit-separation` | **`separation_id`**; `preview?`, `document?` | manage | **Ε5**/**Ε6**/**Ε7**, code derived from `separation_type`. On success also marks the employee `terminated` + sets `end_date`. `409` if already filed. |
| `ergani-submit-overtime` | **`overtime_ids`** (or `overtime_id`, ≤100); `comments?`, `preview?`, `document?` | manage | **Ε8** carrying every selected entry in one filing. `409` if any is already filed; `404` if any is outside the workspace. |
| `ergani-submit` | **`code`**, **`document`**; `entity_type?`, `entity_id?`, `employee_id?`, `schedule_id?` | manage | Generic escape hatch for any code from a fully operator-built payload; audited. |
| `ergani-download-pdf` | **`code`**, **`protocol`**, **`submitted_date`** (`yyyymmdd`) | view | Returns the submitted document PDF as base64. |
| `ergani-retry` | **`submission_id`** | manage | Re-submits a `failed` audit row from its stored payload. |
| `ergani-submissions-log` | `employee_id?`, `submission_type?`, `limit?` (≤500, default 100) | view | Submission audit log (newest first). |

### Labour records — schedules, overtime, departures ([labour.ts](../../supabase/functions/hr-api/labour.ts))

The records behind the Ε4/Ε5/Ε6/Ε7/Ε8 filings. Usable without Ergani configured — a workspace still gets an internal register. **Once a record is filed (`status='submitted'`) it is read-only: update/delete return `409`.**

| Action | Params | Auth | Description |
|---|---|---|---|
| `list-schedules` | `employee_id?` | view | Rosters (newest `effective_from` first, ≤500) with employee. |
| `create-schedule` | **`employee_id`**, **`schedule_type`** (`weekly`/`daily`), **`effective_from`**, **`details`**; `name?`, `effective_to?` | manage | `details` is an array of shifts `{ day: 0–6 (0=Sun), off, start, end, break_start?, break_end?, date?, note? }`, rebuilt field-by-field server-side (≤62). |
| `update-schedule` | **`id`**; any of the above | manage | Patch. |
| `delete-schedule` | **`id`** | manage | Delete. |
| `list-overtime` | `employee_id?`, `from?`, `to?` | view | Overtime entries (newest `work_date` first, ≤500). |
| `create-overtime` | **`employee_id`**, **`work_date`**, **`start_time`**, **`end_time`**, **`reason`**; `note?` | manage | `hours` is a generated column — never accepted from the body. `end_time` must be after `start_time` (same work date). |
| `update-overtime` | **`id`**; any of the above | manage | Patch. |
| `delete-overtime` | **`id`** | manage | Delete. |
| `list-separations` | `employee_id?` | view | Departures (newest `effective_date` first, ≤500). |
| `create-separation` | **`employee_id`**, **`separation_type`** (`voluntary`→Ε5 / `termination`→Ε6 / `expiry`→Ε7), **`effective_date`**; `notice_date?`, `reason?`, `severance_amount?`, `note?` | manage | The employee stays `active` until the departure is filed. |
| `update-separation` | **`id`**; any of the above | manage | Patch. |
| `delete-separation` | **`id`** | manage | Delete. |

### Self-service (linked employee only)

Auth = **`self`** (a linked `hr_employees.user_id = caller` row); every handler is hard-scoped to that employee.

| Action | Params | Description |
|---|---|---|
| `self-profile` | — | The caller's own employee profile + absence summary. |
| `self-onboarding` | — | The caller's onboarding tasks. |
| `self-toggle-onboarding` | **`task_id`** | Flip one of the caller's own tasks `pending` ⇄ `done`. |
| `self-timeoff` | — | The caller's own absences. |
| `self-request-timeoff` | **`start_date`**, **`end_date`**; `absence_type?`, `note?` | Insert a `pending` absence request for the caller. `201`. |
| `self-documents` | — | The caller's own documents (metadata). |
| `self-sign-document` | **`document_id`** | 5-minute signed URL for one of the caller's own documents. |
| `self-clock` | **`punch_type`** (`arrival`/`departure`), `comments?` | Self clock-in/out → Work Card; files to Ergani when configured. |
| `self-punches` | `days?` (1–90, default 14) | The caller's recent punches + authoritative `clocked_in` state. |

## Credit-metered actions

These reserve a conservative credit ceiling **before** the Claude call (invariant #10) and refund the difference on completion (or the full reserve on failure). If the balance is below the ceiling they return `402` with `{ "code": "insufficient_credits" }`. The response carries the actual `credits_used`:

| Action | Reserve ceiling |
|---|---|
| `generate-job-description` | 12 |
| `screen-application` | 20 |
| `analyze-accounting-doc` | 25 |
| `prepare-accounting-period` | 25 |

## Examples

### Create an employee

```http
POST /functions/v1/hr-api
Authorization: Bearer <jwt>

{
  "action": "create-employee",
  "workspace_id": "b1f0…",
  "contact": { "name": "Maria Papadopoulou", "email": "maria@acme.gr", "vat_number": "123456789" },
  "employment_type": "full_time",
  "start_date": "2026-08-01",
  "monthly_salary": 1800,
  "salary_currency": "EUR",
  "pay_basis": "monthly",
  "amka": "01019012345",
  "dependent_children": 2
}
```

`201` →

```json
{
  "employee": {
    "id": "e9c2…",
    "workspace_id": "b1f0…",
    "crm_contact_id": "c77a…",
    "employment_type": "full_time",
    "status": "active",
    "monthly_salary": 1800,
    "contact": { "id": "c77a…", "name": "Maria Papadopoulou", "vat_number": "123456789" },
    "manager": null,
    "total_absence_days": 0,
    "days_by_type": {},
    "on_leave_today": false,
    "remaining_leave_days": 0
  }
}
```

### Record an absence

```http
POST /functions/v1/hr-api
Authorization: Bearer <jwt>

{
  "action": "record-absence",
  "workspace_id": "b1f0…",
  "employee_id": "e9c2…",
  "absence_type": "vacation",
  "start_date": "2026-08-10",
  "end_date": "2026-08-14",
  "note": "Summer holiday"
}
```

`201` →

```json
{
  "absence": {
    "id": "a3d1…",
    "workspace_id": "b1f0…",
    "employee_id": "e9c2…",
    "absence_type": "vacation",
    "start_date": "2026-08-10",
    "end_date": "2026-08-14",
    "working_days": 5,
    "status": "pending",
    "note": "Summer holiday"
  }
}
```

## Errors

| Code | Meaning |
|---|---|
| 400 | Missing/invalid `action`/`workspace_id`, validation error, or Ergani business error (`ergani_not_configured`). |
| 401 | Unauthorized (no valid user). |
| 402 | Workspace not entitled to the `hr` module, or insufficient credits for a metered AI action (`code: "insufficient_credits"`). |
| 403 | Caller lacks `hr.view` (any action) or `hr.manage` (a write); self-service caller has no employee record. |
| 404 | Workspace access mismatch (enumeration-safe), or target row not found. |
| 409 | Uniqueness conflict (contact already an employee, duplicate department/period, candidate already applied, run already posted, employee already invited). |
| 500 | Unexpected server error. |

```json
{ "error": "human-readable message" }
```
