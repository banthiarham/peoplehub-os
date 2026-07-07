# PeopleHub OS Product Journey Plan

## Summary

PeopleHub OS already has broad module coverage across HR, payroll, attendance, leave, hiring, performance, helpdesk, assets, workflows, documents, notifications, analytics, and developer APIs. The gap versus Keka, greytHR, Darwinbox, Zoho People, factoHR, Pocket HRMS, Zimyo, and HROne is not missing pages; it is enterprise-operational depth.

Primary target: India SMB-midmarket.

First outcome: production-ready core.

This journey makes PeopleHub OS sellable as a serious India-first HRMS/payroll platform by prioritizing:

- Payroll and compliance operations, not only payroll calculation.
- Mobile-first employee and manager self-service.
- Attendance, leave, payroll, and reporting workflows that run end to end.
- Implementation and migration tooling so companies can onboard without engineering help.
- Trust, audit, security, and exports that serious companies expect.
- Later expansion into PSA, LMS, compensation, AI, marketplace, and enterprise HCM.

Competitor references for product direction:

- Keka: https://www.keka.com/
- Keka PSA: https://www.keka.com/psa-software
- greytHR: https://www.greythr.com/
- Darwinbox: https://darwinbox.com/
- Zoho People: https://www.zoho.com/people/
- factoHR: https://factohr.com/
- Pocket HRMS: https://www.pockethrms.com/

## Product North Star

PeopleHub OS should become:

> The India-first people operations system that lets a 100-2,000 employee company run HR, payroll, attendance, compliance, employee service, approvals, and reporting without spreadsheets.

Every module must be judged by this question:

> Can an HR, payroll, or admin team use this in a real monthly operating cycle without manual workarounds?

## Maturity Model

| Status | Definition |
| --- | --- |
| Prototype | Concept, seed data, or partial UI/API exists, but not enough for a real workflow. |
| Working Demo | Demo data and primary screens exist; useful for product walkthroughs. |
| Operational | Database-backed workflow works for common cases with role/tenant boundaries. |
| Production-Ready | Admin/user workflows, validations, exports, audit logs, tests, and error states are complete enough for customers. |
| Competitive Differentiator | Better than baseline competitors for a target segment or workflow. |

Score scale used below: 1 = absent, 2 = partial, 3 = working demo, 4 = operational, 5 = production-ready.

## Module Maturity Scorecard

| Module | Current maturity | Next target | Data | API | UI | Sec | Audit | Import/export | Tests | Demo | Mobile |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Organization and tenant management | Operational | Production-Ready | 4 | 4 | 4 | 4 | 3 | 2 | 3 | 4 | 2 |
| Core HR and employee master | Operational | Production-Ready | 4 | 4 | 4 | 4 | 3 | 3 | 3 | 4 | 3 |
| Roles, permissions, and access control | Operational | Production-Ready | 4 | 4 | 3 | 4 | 3 | 2 | 3 | 4 | 2 |
| Employee self-service portal | Working Demo | Operational | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 4 | 3 |
| Time, attendance, leave, and shifts | Operational | Production-Ready | 4 | 4 | 4 | 3 | 3 | 3 | 3 | 4 | 3 |
| Payroll and compliance engine | Operational | Production-Ready | 4 | 4 | 4 | 4 | 3 | 3 | 3 | 4 | 2 |
| Expense, claims, loans, and advances | Working Demo | Operational | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 2 |
| Recruitment and ATS | Operational | Production-Ready | 4 | 4 | 4 | 3 | 2 | 2 | 3 | 4 | 2 |
| Onboarding and offboarding | Operational | Production-Ready | 4 | 4 | 4 | 3 | 3 | 2 | 3 | 4 | 2 |
| Performance, goals, OKRs, and reviews | Operational | Production-Ready | 4 | 4 | 4 | 3 | 2 | 2 | 3 | 4 | 2 |
| Engagement, culture, surveys, and recognition | Operational | Production-Ready | 4 | 4 | 4 | 3 | 2 | 2 | 2 | 4 | 2 |
| HR helpdesk and knowledge base | Operational | Production-Ready | 4 | 4 | 4 | 3 | 2 | 2 | 3 | 4 | 3 |
| Assets and inventory | Working Demo | Operational | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 1 |
| Timesheets, projects, and PSA | Working Demo | Operational | 3 | 3 | 3 | 3 | 2 | 2 | 2 | 3 | 1 |
| Analytics and workforce intelligence | Working Demo | Operational | 3 | 3 | 4 | 3 | 2 | 2 | 2 | 4 | 2 |
| AI copilot | Prototype | Working Demo | 2 | 3 | 3 | 2 | 2 | 1 | 2 | 3 | 2 |
| Developer ecosystem, APIs, and integrations | Operational | Production-Ready | 4 | 4 | 4 | 4 | 3 | 2 | 3 | 4 | 1 |
| Workflow and approval engine | Operational | Production-Ready | 4 | 4 | 4 | 3 | 3 | 1 | 3 | 4 | 2 |
| Forms, documents, and letter builder | Operational | Production-Ready | 4 | 4 | 4 | 3 | 3 | 2 | 3 | 4 | 2 |
| Notifications and communication | Operational | Production-Ready | 4 | 4 | 4 | 3 | 2 | 1 | 2 | 4 | 3 |
| Security, privacy, and audit | Working Demo | Production-Ready | 3 | 3 | 3 | 4 | 4 | 2 | 3 | 3 | 1 |

## Enterprise Runnable Checklist

A module is enterprise-runnable only when all answers are yes:

- Can an admin configure it without engineering help?
- Can an employee, manager, HR admin, payroll admin, or finance admin use the relevant workflow?
- Can the workflow be approved, rejected, escalated, or overridden where required?
- Can the module export operational data with permission checks?
- Is every sensitive action audit logged?
- Does the module update or block downstream modules correctly?
- Are historical records stable after policy, rule, or configuration changes?
- Are empty, loading, error, and permission-denied states usable?
- Are seeded/demo records realistic enough for browser QA and sales demos?
- Does the mobile layout work without horizontal overflow?

## Competitive Gap Map

### P0 Gaps: Must Fix Before Serious Sales

1. Company setup and implementation
   - Guided tenant setup wizard.
   - Employee import validation journey.
   - Payroll readiness checklist.
   - Policy configuration checklist.
   - Dry-run payroll process before first live run.

2. Payroll compliance operations
   - PF, ESI, PT, LWF, TDS, Form 16, Form 24Q-style data, challan/export workflows.
   - Bank file generation and payout reconciliation.
   - Payroll accounting journal export.
   - Compliance calendar and due-date dashboard.

3. Mobile-first ESS
   - Mobile-optimized attendance, leave, payslips, tax declarations, tickets, documents, approvals, and expenses.
   - PWA install experience.
   - Offline-tolerant attendance draft.
   - Push-ready notifications.

4. Reports and exports
   - Report catalog by HR, payroll, attendance, leave, compliance, expense, hiring, performance, and assets.
   - CSV/XLSX export for every operational module with permission checks.
   - Scheduled report delivery after the base catalog is stable.

5. Trust and security packaging
   - Trust Center.
   - SSO-ready configuration screens.
   - MFA-ready account policy.
   - Data retention, export logs, API logs, and admin action audit.
   - Consistent field-level sensitive-data visibility checks across UI and API.

### P1 Gaps: Needed To Beat Keka For Strong Segments

1. Advanced PSA for IT/services companies
   - Resource planning, bench, utilization, allocation, project margin, billing, and invoicing handoff.
   - Client/project profitability dashboards.

2. Compensation and salary revision
   - Salary revision cycles, compensation bands, increment letters, promotion linkage, approval workflows, and payroll-effective-date handling.

3. Learning Management System
   - Courses, learning paths, assignments, completion, certifications, and skill matrix.

4. Real integration marketplace
   - Configured connectors for biometric devices, Tally/accounting, Slack, Teams, Google Workspace, Microsoft 365, WhatsApp, e-sign, BGV, and job boards.

5. Admin-configurable workflow maturity
   - Sensitive actions route through workflow: payroll lock, salary change, employee data change, offer approval, expense approval, and exit clearance.

### P2 Gaps: Differentiation

1. Useful HR AI
   - Payroll anomaly explanation.
   - HR ticket answers with cited approved KB articles.
   - Employee policy assistant with citations.
   - Candidate resume summary.
   - Review summary and manager prep.
   - Report generation assistant.

2. Industry packs
   - IT services.
   - Manufacturing and shift-heavy workforce.
   - Retail and field workforce.
   - BFSI compliance-heavy.

3. Developer ecosystem moat
   - PeopleHub as the identity, employee, workflow, payroll-status, and notification backbone for other products.
   - Stable scoped APIs, webhooks, sandbox, event replay, and SDK examples.

## Journey Roadmap

### Phase 0: Product Baseline And Documentation

Goal: Create a source-of-truth product journey document and module maturity scorecard.

Deliverables:

- This document at `docs/peoplehub-product-journey-plan.md`.
- Module maturity scorecard across data model depth, API completeness, UI workflow completeness, permissions/security, audit logging, import/export, tests, demo data quality, and mobile usability.
- Enterprise runnable checklist.
- P0/P1/P2 priority map.

Acceptance:

- The repo has a committed journey plan document.
- Every module has a maturity score and next target state.
- P0/P1/P2 priorities are visible and unambiguous.

### Phase 1: Implementation And Migration Center

Goal: Let a new company configure PeopleHub OS without engineering support.

Key changes:

- Guided setup dashboard covering company profile, legal entities, locations, departments, roles, employee import, salary import, leave policy setup, attendance setup, payroll statutory setup, and bank/payout setup.
- Import templates for employees, salary structures, bank details, tax declarations, opening leave balances, and attendance devices.
- Validation engine for missing PAN, missing UAN, missing bank account, duplicate employee code/email, invalid manager mapping, missing salary structure, and missing payroll entity.
- Readiness dashboard for HR, payroll, attendance, leave, and compliance.

APIs:

- `GET /api/v1/setup/readiness`
- `POST /api/v1/setup/import/employees/preview`
- `POST /api/v1/setup/import/employees/commit`
- `POST /api/v1/setup/import/salary/preview`
- `POST /api/v1/setup/import/salary/commit`
- `GET /api/v1/setup/templates/{type}`

Acceptance:

- Admin can set up a demo tenant from empty state to payroll-ready.
- Import previews show row-level errors before commit.
- Invalid employee/salary imports cannot silently corrupt data.
- Readiness dashboard blocks payroll until critical errors are fixed.

### Phase 2: Payroll And Compliance Operations

Goal: Make payroll operationally usable for Indian companies, not just calculable.

Key changes:

- Payroll run lifecycle: open, sync inputs, validate, calculate, review exceptions, approve, lock, generate payslips, generate bank file, generate statutory reports, publish, close.
- Statutory operations: PF statement/export, ESI statement/export, professional tax state-wise report, LWF report, TDS summary, Form 16 data pack, Form 24Q-style quarterly extract, gratuity liability report, and bonus eligibility report.
- Payout operations: bank file format configuration, bank file generation, payout status, UTR/reference tracking, and payroll accounting journal export.
- Payroll variance engine: month-over-month gross/net variance, new joinee/exited impact, bonus/arrears/reimbursement impact, sudden salary spike, and negative net pay.
- Immutable payroll evidence: calculation snapshot, rule versions, inputs, approval history, export history, and publish history.

APIs:

- `POST /api/v1/payroll/runs/{id}/validate`
- `POST /api/v1/payroll/runs/{id}/approve`
- `POST /api/v1/payroll/runs/{id}/lock`
- `POST /api/v1/payroll/runs/{id}/generate-bank-file`
- `POST /api/v1/payroll/runs/{id}/publish`
- `GET /api/v1/payroll/runs/{id}/variance`
- `GET /api/v1/payroll/runs/{id}/statutory/{type}`
- `GET /api/v1/payroll/runs/{id}/audit-trail`

Acceptance:

- Payroll cannot lock with critical errors.
- Warnings can be overridden only with reason and audit log.
- Payslips are visible only after publish.
- Historical payroll does not change after rule/config updates.
- Payroll admin can download bank file, statutory reports, and accounting journal.

### Phase 3: Mobile-First ESS And Manager Self-Service

Goal: Make employee and manager daily use excellent on mobile.

Key changes:

- Revamp `/me` as a mobile-first command center: punch/check-in, leave balance and request, payslip download, tax declaration, ticket creation, document acknowledgement, expense submission, and pending approvals.
- Manager mobile workflows: approve leave, attendance regularization, and expenses; view team attendance and leave calendar; review scoped payroll exceptions.
- PWA polish: install prompt, app icons, offline fallback, last-known profile/attendance state, and push-ready notification model.
- Capture-specific mobile attendance: GPS, geofence, selfie/face-ready placeholder, QR scan-ready flow, and device registration.

APIs:

- `GET /api/v1/me/dashboard`
- `POST /api/v1/me/attendance/punch`
- `GET /api/v1/me/approvals`
- `POST /api/v1/me/approvals/{id}/approve`
- `POST /api/v1/me/approvals/{id}/reject`
- `GET /api/v1/mobile/config`

Acceptance:

- Employee can apply leave on mobile in under 30 seconds.
- Employee can download payslip in under 3 taps.
- Manager can approve/reject common requests from mobile.
- Attendance mode settings control visible employee options.
- Mobile layouts have no horizontal overflow on common phone widths.

### Phase 4: Attendance, Leave And Payroll Integration Hardening

Goal: Make attendance and leave reliably feed payroll.

Key changes:

- Attendance capture policies by location, role, and employee group.
- Shift tolerance and grace rules.
- Late, early exit, half-day, absent, overtime, and exception calculations.
- Manual upload and biometric import reconciliation.
- Leave accrual, carry forward, encashment, expiry, sandwich rule, probation/notice restrictions, attachment-required rules, and gender/location eligibility.
- Payroll handoff for payable days, LOP, overtime, shift allowances, leave encashment, and blocking attendance exceptions.

APIs:

- `POST /api/v1/attendance/finalize/{month}`
- `GET /api/v1/attendance/payroll-inputs/{month}`
- `POST /api/v1/leave/accrual/run`
- `GET /api/v1/leave/payroll-impact/{month}`
- `GET /api/v1/payroll/runs/{id}/attendance-readiness`

Acceptance:

- Payroll run receives finalized attendance/leave inputs.
- Unfinalized attendance creates a payroll blocker.
- Pending leave approvals create blocker or warning based on policy.
- Overtime and LOP calculations are visible before payroll lock.

### Phase 5: Reports, Analytics And Export Catalog

Goal: Match competitor report depth.

Key changes:

- Report catalog: employee master, joining/exits, headcount, attendance daily/monthly, leave balance, leave liability, payroll register, statutory register, TDS, reimbursement, expense, asset assignment, ticket SLA, hiring funnel, and performance distribution.
- Filter framework: date range, department, location, legal entity, manager, employment type, pay group.
- Export framework: CSV, XLSX, PDF where appropriate, and export audit log.
- Scheduled reports after base exports are stable.

APIs:

- `GET /api/v1/reports/catalog`
- `POST /api/v1/reports/{id}/run`
- `POST /api/v1/reports/{id}/export`
- `GET /api/v1/reports/exports`
- `POST /api/v1/reports/schedules`

Acceptance:

- Every major module has at least one useful export.
- Exports respect tenant and permission scope.
- Sensitive exports are audit logged.
- Reports load from real seeded/demo data.

### Phase 6: Trust Center, Security And Enterprise Controls

Goal: Make PeopleHub credible for serious companies.

Key changes:

- Trust Center with security posture, data retention settings, audit log search, export logs, API access logs, webhook delivery logs, SSO/MFA readiness, and DPA/SLA placeholders.
- Security controls: MFA-ready user preference model, SAML/OIDC configuration placeholder with validation, IP allowlist-ready model, session management, password policy settings, and SCIM-ready provisioning later.
- Field security for salary, bank details, PAN/Aadhaar/UAN/ESIC, documents, and tax declarations.
- Audit hardening: actor, action, object, old/new values, reason, IP/user agent, and timestamp.

APIs:

- `GET /api/v1/security/trust-center`
- `GET /api/v1/security/audit-logs`
- `GET /api/v1/security/export-logs`
- `PATCH /api/v1/security/policies`
- `GET /api/v1/security/sessions`
- `DELETE /api/v1/security/sessions/{id}`

Acceptance:

- Admin can search audit logs.
- Sensitive field access is permission controlled.
- API/export access is logged.
- Trust Center shows real system state, not static marketing text.

### Phase 7: Advanced PSA For IT Services

Goal: Compete with Keka PSA for service companies.

Key changes:

- Resource management: skills, capacity, allocation, bench, utilization, and availability.
- Project financials: billable/non-billable tracking, billing rates, cost rates, margin, revenue proxy, and invoicing handoff.
- Client operations: client records, contracts, statements of work, and opportunity-to-project conversion.
- Dashboards: resource utilization, bench risk, project profitability, billing leakage, and overtime cost.

APIs:

- `GET /api/v1/psa/resources`
- `POST /api/v1/psa/allocations`
- `GET /api/v1/psa/capacity`
- `GET /api/v1/psa/project-profitability`
- `POST /api/v1/psa/invoice-preview`

Acceptance:

- Finance can export billable hours.
- Manager can approve/reject weekly timesheets.
- Project profitability is visible by client/project.
- Payroll can consume overtime/hourly worker inputs.

### Phase 8: LMS, Skills And Career Development

Goal: Add a missing competitor module and connect it to performance.

Key changes:

- LMS: courses, modules, assignments, completion, quizzes placeholder, and certificates.
- Skills: skill catalog, employee skill profile, proficiency, manager validation, and skill gaps.
- Performance links: goals recommend learning, PIPs assign courses, review cycles include skill evidence.
- Compliance training: mandatory courses, acknowledgement, renewal dates, and completion reports.

APIs:

- `GET /api/v1/learning/courses`
- `POST /api/v1/learning/courses`
- `POST /api/v1/learning/assignments`
- `PATCH /api/v1/learning/assignments/{id}/complete`
- `GET /api/v1/skills/employees/{id}`

Acceptance:

- HR can create and assign a course.
- Employee can complete assigned learning.
- Manager/HR can see skill matrix and gaps.
- Compliance course completion is reportable.

### Phase 9: Compensation And Salary Revision

Goal: Add compensation lifecycle beyond monthly payroll.

Key changes:

- Salary revision cycles: budget, eligibility, manager recommendation, HR calibration, approval, and effective date.
- Compensation bands by department/designation/grade, compa-ratio, and out-of-band warnings.
- Increment, promotion, and compensation change letters.
- Payroll integration: approved revision creates effective-dated salary record; payroll uses correct salary for the period.

APIs:

- `POST /api/v1/compensation/cycles`
- `GET /api/v1/compensation/cycles/{id}/eligible-employees`
- `POST /api/v1/compensation/recommendations`
- `POST /api/v1/compensation/revisions/{id}/approve`
- `POST /api/v1/compensation/revisions/{id}/publish`

Acceptance:

- HR can run a salary revision cycle.
- Managers can submit recommendations.
- Approved revision updates payroll-effective salary.
- Letter is generated and stored in employee documents.

### Phase 10: Integration Marketplace And Developer Platform

Goal: Make PeopleHub OS the people-data backbone.

Key changes:

- Productionize the developer foundation: API key scopes, OAuth client credentials, rate limits, request logs, webhook retries, event replay, and sandbox tenant.
- Connector framework: connector catalog, connection status, credentials placeholder, sync logs, and failure alerts.
- Initial connectors: biometric import, Tally/accounting export, Slack, Microsoft Teams, Google Workspace, Microsoft 365, WhatsApp notification provider, e-sign provider, and BGV provider.

APIs:

- `GET /api/v1/integrations/catalog`
- `POST /api/v1/integrations/{provider}/connect`
- `GET /api/v1/integrations/{id}/sync-logs`
- `POST /api/v1/developer/webhooks/{id}/replay`
- `GET /api/v1/developer/event-catalog`

Acceptance:

- Admin can create API key with scoped access.
- Developer can subscribe to webhook events.
- Failed webhooks retry and are visible.
- Connector status and sync logs are visible.

### Phase 11: AI Copilot With Real Utility

Goal: Move from AI placeholder to useful assistant.

Key changes:

- HR AI: policy answers with citations, employee summary, missing-data finder, and report drafting.
- Payroll AI: variance explanation, anomaly detection, payroll readiness summary, and payslip explanation.
- Employee AI: leave balance, payslip explanation, policy Q&A, and ticket status.
- Manager AI: one-on-one prep, team attendance summary, and review summary.
- Recruiter AI: candidate summary, interview questions, and offer letter draft.

Rules:

- AI cannot approve, reject, fire, promote, change pay, or lock payroll.
- AI outputs must be labeled.
- Policy answers must cite approved KB/document sources.
- Every AI request and answer must be logged.

APIs:

- `POST /api/v1/ai/ask`
- `POST /api/v1/ai/payroll/analyze-run/{id}`
- `POST /api/v1/ai/helpdesk/answer`
- `POST /api/v1/ai/recruitment/candidate-summary/{id}`
- `GET /api/v1/ai/logs`

Acceptance:

- AI answers cite source documents where required.
- AI actions are logged.
- AI cannot mutate sensitive business state.
- Payroll AI explains anomalies using actual payroll data.

## Design System Direction

Use the current command-center visual direction as the baseline:

- Compact side navigation, expandable on hover or pin.
- Dense KPI strips at the top of operational pages.
- Primary work table, pipeline, or list gets most screen width.
- Side panels only when they help action.
- No decorative status pill rows unless they communicate actionable state.
- No oversized cards that leave empty space.
- Mobile layouts keep actions reachable without horizontal scroll.

Every module revamp must include:

- One primary command header.
- One KPI strip.
- One main work surface.
- One clear primary action.
- Empty, loading, and error states.
- No dead navigation.

## Test Plan

Automated tests to add or harden:

- Tenant setup and import validation.
- Employee import preview and commit.
- Payroll validation, lock, publish, and historical snapshot immutability.
- Statutory report generation.
- Attendance finalization into payroll.
- Leave accrual and payroll impact.
- Mobile ESS endpoints.
- Report export permission checks.
- Audit log creation for sensitive actions.
- Workflow approval and escalation.
- API key scope enforcement.
- Webhook retry and replay.
- AI logging and non-mutation guardrails.

Browser QA scenarios:

- Admin completes setup from seeded or empty tenant.
- HR creates/updates employee and views audit trail.
- Employee completes mobile ESS flows.
- Payroll admin runs full payroll lifecycle.
- Manager approves leave, attendance, and expense requests.
- Finance exports payroll and billing reports.
- Developer creates API key, webhook, and test event.
- Security admin inspects audit, export, and API logs.

## Production-Ready Acceptance Gates

A module is not production-ready until:

- It has real database-backed CRUD where needed.
- It has permissions and tenant isolation.
- It has audit logs for sensitive changes.
- It has seeded demo data.
- It has API tests for critical paths.
- It has usable empty, loading, error, and permission states.
- It has export/reporting where operationally expected.
- It has no console/runtime errors in browser QA.
- It has documented admin and user workflows.

## Assumptions And Defaults

- Target market is India SMB-midmarket first.
- Priority is production-ready core before investor-demo polish.
- Current broad module coverage remains; we improve depth rather than deleting modules.
- Existing stack remains: Next.js, NestJS, Prisma, PostgreSQL, Tailwind.
- Compliance exports start as structured CSV/XLSX/PDF-ready data packs before government portal automation.
- AI is assistive and logged, never autonomous for employment or payroll decisions.
