# HR System

Human Resources — the platform's first **paid add-on module** (#252), built on the #251 module framework. Manages employees (as CRM contacts tagged "Employee" plus a companion HR record), time off, attendance, recruitment/ATS, onboarding, documents, payroll, accounting-document OCR, and Greek Ergani (ΠΣ Εργάνη) compliance filings.

---

## Overview

HR is a self-contained tenant module. It is:

- **A paid add-on.** `manifest.json` declares `slug: "hr"`, `category: "operations"`, `priceTier: "pro"`. The nav entry (`SIDEBAR_NAV_ITEMS`, `moduleSlug: 'hr'`, `requireCapability: 'hr.view'`) only appears when the active workspace is entitled. The `/hr` route carries no `requireAdmin`, so `buildModuleRoutes()` wraps it in an `EntitlementGuard` that shows an upsell card when the workspace doesn't own the module.
- **Modelled on CRM contacts.** An "employee" is a `crm_contacts` row tagged with the global **"Employee"** category (`crm_categories.slug='employee'`, applied idempotently by `tagEmployee()` in [hr-util.ts](../supabase/functions/hr-api/hr-util.ts)), plus a companion `hr_employees` row (1:1, `crm_contact_id` FK, unique per workspace) that holds the HR-only data: employment type, salary/pay basis, leave allowance, manager, working-time window, AMKA, dependent children, portal `user_id`, and clock PIN hash.

**Module folder:** [`src/modules/hr/`](../src/modules/hr) — manifest, module definition, pages, section components, services.

**Edge function:** [`supabase/functions/hr-api/`](../supabase/functions/hr-api) — a single router split across `index.ts` (employees + absences + gate chain), `expansion.ts` (org, recruitment, onboarding, documents, payroll, attendance, analytics, portal invite, self-service), `ergani.ts` (Ergani filings), `accounting.ts` (credit-metered OCR + reconciliation), `ai-meter.ts` (AI credit metering), `hr-util.ts` (shared helpers).

**Routes**

| Route | Page | Access |
|---|---|---|
| `/hr` | [HRPage.tsx](../src/modules/hr/pages/HRPage.tsx) | Entitlement-guarded; page-gated on `hr.view` |
| `/my-hr` | [EmployeeSelfServicePage.tsx](../src/modules/hr/pages/EmployeeSelfServicePage.tsx) | Nav capability `hr.self` |
| `/:slug/clockin` | [ClockInKioskPage.tsx](../src/modules/hr/pages/ClockInKioskPage.tsx) | **Public** (no login) |

---

## Architecture — split read/write path

The frontend deliberately splits its data access between a **direct DB read path** and an **edge-function write path**. See the design note at the top of [hrService.ts](../src/modules/hr/services/hrService.ts).

- **Reads go DIRECT to the DB** (via the PostgREST client, `sb.from('hr_*')…`), exactly like the Finance module. The `hr_*` SELECT RLS policy is `is_workspace_admin(workspace_id) OR is_platform_operator()` — the **identical** owner/admin-only gate that `resolveHrAccess()` enforces on the edge — so a direct client read is equally safe **and** runs at always-warm PostgREST speed (~100 ms) instead of paying an edge-function cold-start on the first navigation and a per-tab-switch round-trip. This is what eliminates the "blank div while it loads" symptom. `listEmployees`, `listAbsences`, `listDepartments`, `listJobPostings`, `listApplications`, `listOnboarding`, `listDocuments`, and `listPayrollRuns` all read directly and enrich with the `vw_hr_employee_absence_summary` rollup client-side. (The `hr_*` tables post-date the last generated `Database` type, so `sb` is a thin untyped `supabase as any` handle for these reads.)
- **Writes and computed/credit-metered/external endpoints go through `hr-api`** via the `call<T>()` helper (`supabase.functions.invoke('hr-api', …)`). These are the operations that must run under the RLS-bypassing service role: mutations that need server-side validation/allowlisting, credit-metered AI ops, storage uploads, Finance posting, and every Ergani call.

> Note on Overview analytics: the Overview tab loads through the edge `analytics` action ([expansion.ts](../supabase/functions/hr-api/expansion.ts)), which aggregates headcount, absences, departments, recruitment funnel, onboarding, and last payroll across several tables in one call — it is not a separate DB view/RPC.

---

## Security model

`hr-api` follows the pen-test #250 baseline plus the sharper edges of HR PII. The gate chain in [index.ts](../supabase/functions/hr-api/index.ts) runs on every request:

1. **`authenticate(req, { requireUser: true })`** yields a **service-role** client (RLS bypassed). Because RLS is bypassed, every subsequent tenancy check is mandatory and manual.
2. **`userCanAccessWorkspace(supabase, userId, workspaceId)`** binds the caller to the workspace derived from the request — `workspace_id` from the body is never trusted for access. Mismatch returns **404** (not 403) to avoid workspace-id enumeration.
3. **`isModuleEnabled(supabase, 'hr')`** — the global publish switch (404 if unavailable).
4. **`assertEntitled(supabase, workspaceId, 'hr')`** — the per-workspace entitlement gate; returns **402** (upsell) when the workspace hasn't purchased the add-on.
5. **RBAC** via `resolveHrAccess()` — HR data is **more restricted than plain workspace membership**. Only workspace `owner`/`admin` (or global `admin`/`super_admin`) hold `hr.view` + `hr.manage`; plain members get **neither** (403). Reads require `hr.view`; writes/approvals/Ergani submissions require `hr.manage` (enforced by `requireManage()` in each handler).

Additional invariants honoured:

- **Mass-assignment (BOPLA) guards.** Contact and employee writes go through explicit allowlists — `CONTACT_WRITABLE` and `EMPLOYEE_WRITABLE` in `index.ts`; identity/trust fields are never accepted from the body. `pick()` builds the payload column-by-column.
- **Storage-path BOLA guard.** `pdf-documents` is one shared private bucket accessed under the service role, so `assertHrObjectPath()` forces every signed/deleted object to live under this workspace's own `hr/{workspaceId}/` prefix (and rejects `..`). Uploads always compute the path server-side.
- **LLM safety.** Accounting reconciliation fences the model-extracted (attacker-uploadable) document JSON between `<extracted_documents>` tags marked as DATA, not instructions. All AI extractions use Anthropic forced `tools=[…]` + `tool_choice`, never free-form JSON parsing.
- **Credit reserve-before-spend** (invariant #10) — see [Credit metering](#credit-metering).

### Employee self-service scope

Actions prefixed **`self-`** are handled *before* the admin RBAC gate (an invited employee holds the workspace role `employee` and has neither `hr.view` nor `hr.manage`). Access is granted purely by having a linked `hr_employees` row (`user_id = caller`), and every self-handler in `handleSelfService()` is **hard-scoped to that one `employeeId`** — an employee can only ever read/act on their own profile, onboarding, time off, documents, and punches, never anyone else's.

---

## Feature areas (tabs)

The admin console ([HRPage.tsx](../src/modules/hr/pages/HRPage.tsx)) is a vertical-tab layout gated on `hr.view`; each tab is a `*Section.tsx` component under [`src/modules/hr/components/`](../src/modules/hr/components).

### Employees
`list-employees` / `create-employee` / `update-employee`. An employee is created by either attaching an existing in-workspace `crm_contact_id` or creating a new contact inline (allowlisted fields). The contact is auto-tagged "Employee"; a unique `(workspace_id, crm_contact_id)` returns 409 if the contact is already an employee. Manager references must resolve within the workspace. Each row is enriched with the absence rollup (`total_absence_days`, `days_by_type`, `on_leave_today`, `remaining_leave_days`) from `vw_hr_employee_absence_summary`.

### Departments
`list-departments` / `create-department` / `update-department` / `delete-department`. Simple org units with an optional `head_contact_id`; list responses include a live `employee_count`.

### Time Off (absences + approval workflow)
`list-absences` / `record-absence` / `approve-absence` / `reject-absence`. Absence types: `vacation`, `sick`, `unpaid`, `other`. `working_days` is server-computed as business days (Mon–Fri, inclusive) via `businessDaysInclusive()` unless an explicit non-negative override is passed. New absences start `status='pending'`; approve/reject stamps `status` + `approved_by`. Employees file their own requests via `self-request-timeoff` (also pending, awaiting HR approval).

### Attendance (punches / kiosk / PIN / lateness)
Backed by `hr_time_punches`. Admin actions: `attendance-today` (today's board, timezone-aware via `hr_settings.timezone`, default `Europe/Athens`), `clock-employee`, `set-employee-pin` (4–8 digits, stored as a `sha256(workspaceId:pin)` hash in `clock_pin_hash`), `list-punches`, `add-manual-punch` (local correction/backfill, never filed to Ergani), `update-punch`, `delete-punch`, and `timesheet` (pairs arrivals/departures into worked hours per employee/day). Kiosk/notification settings live in `hr_settings` (`get-hr-settings` / `save-hr-settings`): `kiosk_enabled`, `kiosk_require_pin`, `late_alert_enabled`, `late_grace_minutes`, `notify_owner`/`notify_finance`/`notify_user_ids`/`notify_emails` (`list-notify-candidates` surfaces workspace members as recipient options). Punches are filed to the Ergani Digital Work Card when configured (`requireErgani: false` → records locally even when Ergani isn't set up).

**Public kiosk** — `/:slug/clockin` ([ClockInKioskPage.tsx](../src/modules/hr/pages/ClockInKioskPage.tsx)): a login-free, mobile/tablet page where an employee identifies by VAT number (or by scanning their Ergani work-card QR) and optional PIN, then taps Clock in / Clock out. Served by [kioskService.ts](../src/modules/hr/services/kioskService.ts) (`resolve` / `lookup` / `clock`); shows a disabled notice unless `kiosk_enabled`. Backing tables `hr_kiosk_attempts` and `hr_checkin_alerts`.

### Recruitment / ATS
Job postings (`list/create/update/delete-job-posting`; statuses `draft`/`open`/`closed`, stamps `published_at` on open), candidates + applications (`list/create/update-application`; stages `applied → screening → interview → offer → hired → rejected`). Stage changes emit the `hr.applicant_stage_changed` Flows event (best-effort). CVs are uploaded through the function as base64 (`upload-application-cv`, ≤10 MB) and read via a 300 s signed URL (`application-cv-url`). `hire-application` creates a contact + `hr_employees` row, tags the contact, closes the application, and seeds a default onboarding checklist.

Two AI operations here are **credit-metered**:
- **`generate-job-description`** — Claude forced-tool call producing a Markdown description + requirements + suggested salary band (pre-check ceiling 12 credits).
- **`screen-application`** — Claude reads the candidate CV (PDF) against the posting and returns a 0–100 fit score + summary, persisted on the application (`ai_score`, `ai_summary`, `ai_rated_at`; pre-check ceiling 20 credits).

### Onboarding
`list-onboarding` / `add-onboarding-task` / `toggle-onboarding-task` / `delete-onboarding-task`, plus the six-item default checklist seeded on hire. Employees see and tick their own via `self-onboarding` / `self-toggle-onboarding`.

### Documents
`list-documents` / `upload-document` / `sign-document` / `delete-document`. Files are uploaded through the function (service role) as base64 (≤20 MB), stored in `pdf-documents` under `hr/{workspaceId}/{employeeId|general}/…`, recorded in `hr_documents` (`storage_bucket` + `storage_object_path`, never a persisted URL). Reads mint a fresh 300 s signed URL. Doc types: `contract`, `id`, `certificate`, `payslip`, `review`, `other`. Employees read their own via `self-documents` / `self-sign-document`.

### Payroll
Runs → items → Finance. `create-payroll-run` (`period` = `YYYY-MM`, unique per workspace) auto-populates one `hr_payroll_items` row per active employee: gross is the fixed `monthly_salary` for monthly pay basis, or `hourly_rate × hours/day × business-days-in-month` for hourly. A configurable **rules engine** (`computePayroll`) derives the statutory breakdown — employee/employer contributions, progressive income tax with a child-scaled tax credit and taper, net, and total employer cost. Defaults are Greek 2026 (`GREEK_PAYROLL_DEFAULTS`: 14 salaries/yr, EFKA 13.87 %/21.79 %, progressive brackets, tax-credit base 777 + per-child add-ons); `get/update-payroll-settings` overrides them per workspace (`country_code='none'` disables auto-rules and honours a manual `deductions` override). `get-payroll-run` returns items + totals; `update-payroll-item` recomputes from the rules on a new gross; `set-payroll-status` (`draft`/`approved`/`paid`); `generate-payslips` (lazy-imports `payslip.ts` → pdf-lib).

**`post-payroll-to-finance`** writes `planned_payments` rows: one **net-wage payment per employee** (counterparty = the employee's contact, scheduled `{period}-28`), one **income-tax (ΦΜΥ)** payment, and one **EFKA** remittance (both scheduled to the statutory next-month-end), then records a `posted_finance_ref` on the run to make re-posting idempotent (409 if already posted).

### Accounting (credit-metered OCR + reconciliation)
[accounting.ts](../supabase/functions/hr-api/accounting.ts) — the accounting team uploads the monthly statutory documents (EFKA/tax slips, APD, payslips, bonuses) that carry the real Payment IDs for a period. `list/upload/sign/delete-accounting-doc` manage them in `hr_accounting_documents`. **`analyze-accounting-doc`** runs Claude OCR (PDF or image) with a forced tool to identify the document (`kind_group` routing enum + a free-text `doc_kind`, so it recognises seasonal docs like Δώρο Χριστουγέννων/Πάσχα, Επίδομα Αδείας, επικουρικό/ΤΕΚΑ) and extract payment fields, amounts, and multi-obligation `entries[]`. **`prepare-accounting-period`** reconciles the analyzed docs against the payroll run's obligations, flags discrepancies, and best-effort stamps matched payment IDs onto the period's Finance `planned_payments`. Both are credit-metered (pre-check ceilings 25).

### Ergani (Compliance)
See [Ergani integration](#ergani-integration).

### Overview / Analytics
The `analytics` action returns headcount, active, on-leave-today, absence totals and by-type, headcount-by-department, department count, open positions, recruitment funnel, pending onboarding, and the last payroll snapshot — rendered by [OverviewSection.tsx](../src/modules/hr/components/OverviewSection.tsx). (There is no standalone HR analytics dashboard table/RPC; the section is computed on demand.)

### Employee portal invite
`invite-employee` (admin) invites an email via `auth.admin.inviteUserByEmail` (redirect → `/my-hr`) or links an already-registered user, adds them as a workspace `employee` member **only if not already a member** (never demoting an existing owner/admin/sales member), and links `hr_employees.user_id` + the contact's `user_id`.

---

## Credit metering

All HR AI operations flow through [ai-meter.ts](../supabase/functions/hr-api/ai-meter.ts) so they are both **logged** to `ai_usage_logs` (`module_slug='hr'`, real model + token counts + raw/billed cost) and **charged usage-based credits** — not a fixed price. The model defaults to `claude-sonnet-4-6` (`HR_JOB_AI_MODEL` override); credits are `provider cost × markup ÷ $0.01/credit`.

Per security invariant #10, the flow is **reserve-before-spend**: each op pre-checks the balance against a conservative ceiling (job description 12, CV screening 20, accounting analyze/prepare 25), `reserveHrCredits()` debits that ceiling *before* the Claude call (serialising concurrent requests), and `meterHrAi()` afterwards refunds `reserved − actual` (or debits a small remainder if actual exceeded the ceiling). On AI/read failure the reservation is fully refunded via `refundHrCredits()`. `credits_used` is returned on each response.

---

## Ergani integration

Greek Ministry of Labour (ΠΣ Εργάνη / Ergani II) filings. Handled by [ergani.ts](../supabase/functions/hr-api/ergani.ts) using the shared client in `_shared/ergani/`. Every submission requires `hr.manage` and runs under the **workspace's own** credentials.

- **Per-workspace credentials** live in `workspace_ergani_credentials` (`username`, `password`, `employer_afm`, `branch_aa` default `'0'`, `usertype` default `'02'`, `environment` ∈ `trial`/`production`, `enabled`). Configured at **Profile → Keys** via [ErganiCredentialsCard.tsx](../src/modules/hr/components/ErganiCredentialsCard.tsx); saved by `hrService.saveErganiCredentials` (direct upsert). Config status comes from the masked `get_ergani_creds_status` RPC — the password is never returned to the browser (`has_password` boolean only). Callers that need to submit get a clear `ergani_not_configured` error when absent.
- **Per-employee identity** — `hr_employees.amka` (AMKA social-security number) and the contact `vat_number` (AFM) are required for filings.
- **Trial vs production** — `environment` selects the Ergani endpoint; the value is stamped onto every audit row.
- **Actions:** `ergani-submission-types` (live active types for the employer), `ergani-document-schema` (Ergani's own live JSON template for a code), `ergani-employer-info` (EX_BASE_01 registry), `ergani-submit-leave` (maps an `hr_absences` row onto the leave document — fetches Ergani's template and fills only fields whose key names match documented Ergani conventions, never fabricating structure; a fully-built `document` may be passed to override), `ergani-submit` (generic submit for E3 / WTOWeek / WTODaily / WKChgWK from an operator-reviewed payload), `ergani-download-pdf` (Base64 of the submitted document), `ergani-submissions-log` (audit), and `ergani-retry` (re-POST a failed submission's stored payload). The Digital **Work Card** (WRKCardSE) is filed from attendance punches via `_shared/ergani/workcard.ts`.
- **Audit** — every submission (success or failure) writes an `hr_ergani_submissions` row (type, entity, employee, environment, status, protocol, `ergani_id`, request/response, error). Auditing never masks the real result (never throws).
- **Leave-type catalog** — the global `ergani_leave_types` table backs the leave-code picker (`listErganiLeaveTypes`).

UI: [ErganiSection.tsx](../src/modules/hr/components/ErganiSection.tsx).

---

## Data model

All tables are workspace-scoped with RLS `is_workspace_admin(workspace_id) OR is_platform_operator()` (the same owner/admin-only gate the edge enforces), except where noted.

| Table | Purpose |
|---|---|
| `hr_employees` | HR record 1:1 with a `crm_contacts` row: employment type, pay basis + salary/hourly rate, leave allowance, manager, department, AMKA, dependent children, working-time window, portal `user_id`, `clock_pin_hash`. |
| `hr_absences` | Time-off requests with the pending/approved/rejected workflow, `working_days`, and `ergani_leave_code`. |
| `hr_departments` | Org units with an optional head contact. |
| `hr_job_postings` | Recruitment postings (status, employment type, salary band, `published_at`). |
| `hr_candidates` | Applicant people, incl. `resume_bucket`/`resume_path` for the uploaded CV. |
| `hr_applications` | Candidate ↔ posting with ATS stage, rating, notes, `hired_employee_id`, and AI screening fields (`ai_score`/`ai_summary`/`ai_rated_at`). |
| `hr_onboarding_tasks` | Per-employee onboarding checklist (sort order, done/pending). |
| `hr_documents` | Employee/general documents stored in `pdf-documents` (`storage_bucket` + `storage_object_path`, doc type, size). |
| `hr_payroll_runs` | One run per `YYYY-MM` period (status, currency, totals, `posted_finance_ref`). |
| `hr_payroll_items` | Per-employee line for a run: gross, statutory breakdown, net, employer cost, basis, days/hours/rate. |
| `hr_payroll_settings` | Per-workspace payroll rules (contribution rates, tax brackets, tax credits); Greek 2026 defaults when absent. |
| `hr_settings` | Attendance/kiosk config: timezone, kiosk toggles, late-alert thresholds, notification recipients. |
| `hr_time_punches` | Clock arrival/departure punches (source, `is_late`, status, `ergani_protocol`, `reference_date`). |
| `hr_work_schedules` | Working-time schedules for Ergani WTOWeek/WTODaily submissions. |
| `hr_accounting_documents` | Uploaded statutory docs + Claude-OCR extraction (`kind_group`, `doc_kind`, `extracted`, confidence, `credits_spent`). |
| `hr_ergani_submissions` | Ergani submission audit log (request/response, protocol, status, environment). |
| `hr_kiosk_attempts` | Public kiosk lookup/clock attempts. |
| `hr_checkin_alerts` | Late-arrival / attendance alerts. |
| `workspace_ergani_credentials` | Per-workspace Ergani credentials (RLS: workspace admin; password never returned to the client). |
| `ergani_leave_types` | Global (non-tenant) catalog of Ergani leave codes. |
| `vw_hr_employee_absence_summary` | Rollup view: per-employee `total_absence_days`, `days_by_type`, `on_leave_today`, `remaining_leave_days`. |

---

## Frontend

- **Service:** [hrService.ts](../src/modules/hr/services/hrService.ts) — the single client. Direct-read list methods + `call()`-based write/AI/Ergani methods, plus all TypeScript interfaces and label maps. Kiosk uses the separate [kioskService.ts](../src/modules/hr/services/kioskService.ts).
- **Admin console:** [HRPage.tsx](../src/modules/hr/pages/HRPage.tsx) — vertical tabs (Overview, Employees, Departments, Time Off, Attendance · Recruiting: Jobs & Applicants, Onboarding · Records: Documents, Payroll, Accounting · Compliance: Ergani), each an independent `*Section.tsx`. Gated on `hr.view`; write affordances gated on `hr.manage` via `usePermissions().can('hr.manage')`.
- **Employee self-service:** [EmployeeSelfServicePage.tsx](../src/modules/hr/pages/EmployeeSelfServicePage.tsx) at `/my-hr` — tabs for Clock (in/out + recent punches, filed to Ergani when configured), Profile, Onboarding, Time Off (request dialog), and Documents. Every call is scoped to the caller's own record.
- **Public kiosk:** [ClockInKioskPage.tsx](../src/modules/hr/pages/ClockInKioskPage.tsx) at `/:slug/clockin` — login-free VAT/PIN or QR-scan clock-in for a shared device.

**Capabilities:** `hr.view` (read the console), `hr.manage` (write/approve/submit), `hr.self` (employee self-service nav).
