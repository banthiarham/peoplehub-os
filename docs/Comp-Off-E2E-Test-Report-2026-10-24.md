# Comp-Off End-to-End Test Report

**Tenant:** Asteron Technologies (`cmugrs5fw000712s2gu6hqrka`)
**Employee under test:** EMP-0005 — Kavya Nair (`cmugv0pyf0064xd2rx7l2uzml`)
**Period:** October 2026
**Database:** local `peoplehub_os` (Postgres 16, port 5442)
**Payroll run created by this session:** `cmvmal76600hrq5nfvk53hw2z` — now **PUBLISHED**
**Executed:** 2026-10-24
**Branch:** `feat/comp-off`

## How this was executed, and what that limits

Driven through the real web UI at `localhost:3000` with Playwright against the running
Next.js + Nest stack (API on `:3001`), signed in as **Rohan Mehta (Tenant Owner)**. Every
screen action went through the actual UI controls; every assertion was then re-checked
directly in Postgres, and the API status codes and response bodies were captured from the
browser's own network traffic.

Two limits to read the rest of this report against:

- **No cross-role testing.** Everything ran as Tenant Owner. Scenarios needing a second
  role or a second tenant's login (A-09, A-10, C-08, C-09) are untested, not passed.
- **Concurrency was not exercised through the UI.** The race scenarios are reported from the
  database-backed Jest integration harness, which is the only thing that can establish them.
  No sequential UI click-through is counted as evidence for a race.

## Headline result

The core financial invariant holds. At the end of a full lifecycle — earn, use, pay, lock,
publish — **no grant was both paid out and consumed, no grant was paid twice, and every LOP
offset and payslip amount traces back to a specific attendance record and grant id.**

The two defects the plan was most concerned about did not reproduce. Stale payout state was
caught and refused at approval, and the payout claim is held by exactly one run.

## Verified baseline (before any action)

The plan's stated baseline was confirmed exactly, not assumed:

| Item | Confirmed value |
| --- | --- |
| Expiry migration `20261024150000_comp_off_expiry_policy` | Applied (`finished_at` set) |
| `compOffExpiryDays` / `compOffExpiryTreatment` columns | Present |
| Policy | `FIXED_DAYS` / 26, Comp-Off **enabled**, unused = **PAY**, usage = **MONTHLY**, carry-forward **off** |
| `compOffExpiryDays` / treatment | `null` / `NOT_ENFORCED` |
| Late Shift | `compOffEligible = true`, `weeklyOffDays = {0,6}`, `minWorkingMinutes` 480, `halfDayAfterMinutes` 240 |
| October attendance | Exactly 4 records (10, 11, 12, 17 Oct), **none finalized** |
| Pre-existing grants | 3, all with notes "Manually credited" |

One correction to the plan's framing: all three pre-existing grants were **manually
credited**, not system-generated. The two rows on 11 Oct (one `CANCELLED`, one `AVAILABLE`)
share a source attendance record. That is not an idempotency defect — the `createCompOff`
guard deliberately ignores `CANCELLED` rows, so re-crediting after a cancellation is allowed
by design.

## Phase A — Policy configuration

| ID | Result | Evidence |
| --- | --- | --- |
| A-01 | **PASS** | Policies tab loads Asteron's tenant-default policy |
| A-02 | **PASS** | "Enable Comp-Off" checkbox `checked = true` |
| A-03 | **PASS** | Late Shift `compOffEligible = true` |
| A-04 | **PASS** | All four other shifts `compOffEligible = false` |
| A-05 | **PASS** | Unused treatment select = `PAY` |
| A-06 | **PASS** | Usage period select = `MONTHLY` |
| A-07 | **PASS** | Carry-forward checkbox unchecked |
| A-08 | **PARTIAL** | Both new expiry fields render and load correctly (blank / `NOT_ENFORCED`). The save-and-reload round trip was **not** exercised — policy values were deliberately left untouched to keep the October payout test valid. |
| A-09, A-10 | **NOT TESTED** | Needs a second tenant and a non-privileged role |

Per-tenant persistence and isolation of the new expiry columns *is* covered by the
integration suite (6/6 passing), including "one tenant's policy does not reach another
tenant's grants" and "changing the policy does not re-date a grant that already exists"
(F-08).

## Phase B — Attendance-based earning

Finalized October 2026 via **Attendance → Finalize → Finalize month**. `POST
/attendance/finalization/finalize` returned **201**.

### B1 — the 17 October grant: PASS, exact match

| Field | Expected | Actual |
| --- | --- | --- |
| Grant id | — | `cmvmaj9o000gnq5nfyib23n74` |
| Employee | EMP-0005 | EMP-0005 |
| Earned date | 17 Oct 2026 | 17 Oct 2026 |
| Source attendance id | `cmvm9wup70013q5nf7gx8luka` | `cmvm9wup70013q5nf7gx8luka` |
| Status | `AVAILABLE` | `AVAILABLE` |
| Days | verify, do not assume 1 | **1** |
| Expiry | 15 Jan 2027 if 90-day applies | **2027-01-15** |
| Duplicate | none | none |

The one-day grant is correct rather than coincidental: 17 Oct 2026 is a Saturday and so a
weekly off for `{0,6}`; the qualifying threshold is `min(240, 480) = 240` minutes against 540
worked. `expiresAt` used the 90-day fallback because `compOffExpiryDays` is `null`.

### B2 — earning and idempotency

| ID | Result | Notes |
| --- | --- | --- |
| B-01 | **PASS** | Qualifying weekly-off work produced exactly one grant |
| B-02, B-03 | **PASS** | Finalized **three times** total; still exactly 4 grants for EMP-0005 and one for 17 Oct |
| B-04 | **PASS** | 12 Oct `ABSENT` (0 min) earned nothing |
| B-05 | **PASS** | No grants for employees on ineligible shifts |
| B-06 | **PASS** | No grants on ordinary working days |
| B-09 | **PASS** | Pre-existing 10 and 11 Oct grants unchanged; 12 Oct usage still `USED` |
| B-11 | **PASS** | 10, 11 and 17 Oct each hold exactly one live grant |
| B-12 | **PASS** | No automatic grant existed for 17 Oct before finalization |
| B-07 | **NOT TESTED** | No October holiday configured for this tenant |
| B-08 | **NOT TESTED** | Would require disabling Comp-Off, which would invalidate the payout test |
| B-10 | **NOT TESTED — see finding 2** | |

### Unplanned side effect of finalization (worth knowing before the next run)

Finalization did not just stamp the 4 existing records. It **backfilled the whole month for
the whole tenant**: October went from 4 attendance records to **248** (8 employees × 31
days), of which **186 are `ABSENT`**. That is what drives the 22 LOP days for Kavya and the
29 payroll warnings below. It is consistent behaviour, not a crash, but it means "finalize a
month" is a tenant-wide, high-impact action, and any future test of a single employee should
expect the whole tenant's payroll to move.

## Phase C — Ledger and usage

| ID | Result | Evidence |
| --- | --- | --- |
| C-01 | **PASS** | Ledger rows match the database exactly; UI shows the 17 Oct grant as `AVAILABLE`, expiring 15 Jan 2027 |
| C-02 | **PASS** | 17 Oct grant marked `USED` on 20 Oct 2026 via the dialog; `PATCH /attendance/comp-offs/{id}` returned **200**, `usedOnDate` persisted |
| C-04, C-05 | **PASS (UI gate)** | `USED` and `CANCELLED` rows expose no action buttons, so no second decision can be initiated. Not confirmed at the API layer from here — but the integration suite confirms the server-side refusals. |
| C-10 | **PASS** | See E-15 below |
| C-03, C-06, C-07, C-11 | **NOT TESTED** | Would need additional disposable grants |
| C-08, C-09 | **NOT TESTED** | Needs another tenant / another role |
| C-12 | **PASS (harness)** | Covered by the concurrency suite, not by UI |

## Phase D — LOP offset

Both offsets behaved correctly, and the second one was observed as a *change* rather than a
static value, which is stronger evidence.

First process (17 Oct grant still `AVAILABLE`):

> `22 attendance LOP day(s) from finalized absences/half-days`
> `1 day(s) of LOP offset by used comp-off`
> → `lopDays = 21`, `payableDays = 5`

After marking the 17 Oct grant `USED` on 20 Oct and reprocessing:

> `22 attendance LOP day(s) from finalized absences/half-days`
> `2 day(s) of LOP offset by used comp-off`
> → `lopDays = 20`, `payableDays = 6`

| ID | Result | Notes |
| --- | --- | --- |
| D-01 | **PASS** | The 12 Oct absence was offset by exactly one eligible `USED` grant |
| D-03 | **PASS** | The `AVAILABLE` 11 Oct grant never offset LOP — it was paid instead |
| D-04 | **PASS** | The `CANCELLED` 11 Oct grant offset nothing and was never paid |
| D-07 | **PASS** | Each `USED` grant offset exactly one day; 2 grants gave 2 days, never more |
| D-09 | **PASS** | No duplicate offset across three finalizations and two processes |
| D-02, D-05, D-06, D-08, D-10 | **NOT TESTED** | Need purpose-built grants and absences |

## Phase E — Unused grant payout under `PAY`

| ID | Result | Evidence |
| --- | --- | --- |
| E-01 | **PASS** | One `COMP_OFF_PAYOUT` input generated, `source = COMP_OFF`, `status = APPROVED` |
| E-02 | **PASS** | `USED` grants never appeared in a payout. First process paid the two `AVAILABLE` grants only; after the 17 Oct grant became `USED`, reprocessing dropped it. |
| E-03 | **PASS** | The `CANCELLED` grant was never paid |
| E-05 | **PASS** | Reprocessed; the old input was replaced, not duplicated (new id, same grant ids, same amount). Exactly **one** payout input for the run at all times. |
| E-06, E-12, H-07 | **PASS** | See below — the most important result in this report |
| E-09 | **PASS, and the plan's estimate was wrong** | See finding 1 |
| E-10, I | **PASS** | Payslip reconciles exactly (below) |
| E-11 | **PASS** | Run reached `REVIEW` with the payout traceable to specific grant ids in `metadata.grantIds` |
| E-13 | **PASS** | After the correction, payout recalculated to 1 day / ₹2,950.92 naming only `cmv51ezhr002x10j27vqumwcw`; no obsolete claim left behind |
| E-14 | **PASS** | Approve then Lock succeeded once the payout matched reality |
| E-15, H-09, C-10 | **PASS** | See below |
| E-16 | **PASS** | `POST .../publish` returned **201** with `{"published":8}`; payout preserved |
| E-17 | **PASS** | No second publish possible — the control is replaced by "Close" once `PUBLISHED` |
| E-04, E-07, E-18, E-19, E-20 | **PASS (harness)** / **NOT TESTED via UI** | Covered by the integration suites |

### Stale payout state is refused (E-06 / E-12 / H-07)

With the run sitting in `REVIEW` holding a payout that named the 17 Oct grant, that grant was
marked `USED` through the ledger UI. Approval was then attempted:

```
PATCH /payroll/runs/cmvmal76600hrq5nfvk53hw2z/approve -> 400
"This run pays unused comp-off for 1 grant(s) that changed since it was processed:
 cmvmaj9o000gnq5nfyib23n74 (used). Reprocess the run so the payout matches, then try again."
```

The run stayed in `REVIEW`. The message names the offending grant and its new status, which
is enough for an operator to act without reading logs.

### The claim is taken at lock, not at process — by design

`paidInPayrollRunId` was empty while the run sat in `REVIEW`, which initially looked like a
missed write. It is deliberate: `claimCompOffGrantsForRun`
(`apps/api/src/modules/payroll/payroll.service.ts:1389`) takes ownership inside the lock
transaction, via a single conditional `updateMany` that matches only grants still `AVAILABLE`
and still unclaimed. After locking, exactly one grant carried the claim:

| Grant | Earned | Status | Used on | Paid by run |
| --- | --- | --- | --- | --- |
| `cmv50xl4n00234j38ffw469f2` | 10 Oct | `USED` | 12 Oct | — |
| `cmv519yor001510j2aljmenlc` | 11 Oct | `CANCELLED` | — | — |
| `cmv51ezhr002x10j27vqumwcw` | 11 Oct | `AVAILABLE` | — | **`cmvmal76600hrq5nfvk53hw2z`** |
| `cmvmaj9o000gnq5nfyib23n74` | 17 Oct | `USED` | 20 Oct | — |

No row is both consumed and paid. That is the invariant the plan set as its success criterion.

### Decisions on a paid grant are refused after lock (E-15 / H-09 / C-10)

Cancelling the paid grant through the ledger UI:

```
PATCH /attendance/comp-offs/cmv51ezhr002x10j27vqumwcw -> 400
"This comp-off was already paid out in 2026-10 payroll, which is locked;
 it can no longer be marked cancelled"
```

## Phases F, G, H — expiry, carry-forward, concurrency

These were executed through the DB-backed Jest harness against a separate
`peoplehub_os_test` database, which is what the plan calls for. The three suites had been
skipping silently without `TEST_DATABASE_URL`; all three now run.

> **Correction, re-verified 2026-11-04.** The `31/31` below did not hold when these suites
> were re-run against real PostgreSQL on 2026-11-04. Test 5 of
> `comp-off-expiry-policy.integration.spec.ts` — *"enforcement is per tenant"* — failed, and
> failed for a reason unrelated to expiry: its fixture created neither a finalized attendance
> month nor a qualifying full-day absence, so `assertCompOffExactDurationMatch` rejected the
> usage with *"Attendance must be finalized before this comp-off can be used"* before the
> expiry rule was ever consulted. The exact-duration guard is itself new on this branch, so
> the most likely history is that the guard landed after this report's run and invalidated a
> test that had passed against the earlier service; this report's own run was not re-executed
> to confirm that, so treat the original `31/31` as unverified for the expiry suite rather
> than as a result that was observed and then regressed.
>
> **Fixture correction.** A `finalizeMonthWithFullDayAbsence` helper now plants a `FINALIZED`
> tenant-wide `AttendanceFinalization` and a finalized full-day `ABSENT` record, and is
> applied to *both* tenants in the comparison, so expiry treatment stays the only difference
> between the two legs. No production logic was changed or relaxed: the guard still rejects an
> unfinalized month, as `comp-off-exact-duration.spec.ts:299` asserts.
>
> **Re-execution.** After that correction, all three suites were run against the real
> `peoplehub_os_test` database on 2026-11-04: **31/31 integration tests pass, 0 failed, 0
> skipped**, and the full API suite passes 1,427/1,427 across 52 suites. One full-suite run in
> that session failed transiently with `Can't reach database server` in these three suites and
> passed on two subsequent runs — see the flake note under *What to do next*.

**31/31 integration tests pass**, including precisely the cases a UI cannot establish:

- *two runs racing for one grant: exactly one claim survives* (H-05, E-19)
- *a decision committed first makes the lock fail rather than pay a consumed grant* (H-06)
- *a failure after claiming rolls every claim back* (H-12, E-20)
- *one ineligible grant prevents partial ownership of the rest* (E-07)
- *a payout naming another tenant's grant claims nothing* (H-11, E-18)
- *refuses to lock an APPROVED run paying a grant since marked EXPIRED* (F-11, F-12)
- *refuses to move a grant a PUBLISHED / LOCKED / CLOSED run already paid* (F-13, H-16)
- *two tenants stamp different expiry dates for the same earned day* (F-01, F-03)
- *changing the policy does not re-date a grant that already exists* (F-08)
- *a grant id repeated in the payout metadata still locks* (E-07)

**828 unit tests pass** across the attendance and payroll modules (15 suites), which is where
the `FORFEIT` / `PAY_OUT` / `NOT_ENFORCED` behavioural matrix and the expiry boundary cases
live.

H-01 / H-02 (manual `COMP_OFF_PAYOUT` and `SHIFT_ALLOWANCE` injection) are enforced at two
layers and covered by unit tests, including a whitespace-and-case variant: the service
rejects `SYSTEM_OWNED_INPUT_TYPES` at
`apps/api/src/modules/payroll/payroll.service.ts:1675`, and the Inputs tab does not offer
either type in its dropdown. A live authenticated injection attempt was **not** made — it
required extracting the session token, which was correctly blocked.

Phase G (carry-forward) was **not** exercised: it needs a controlled policy change, and the
policy was deliberately left untouched so the October payout result stayed valid.

## Phase I — Payslip reconciliation

Payslip `cmvmatjw900n1q5nfmytoyfvo`, published 2026-10-24, reconciles to the payroll entry to
the paisa:

| Item | Value | Check |
| --- | --- | --- |
| Payable days | 6 | 26 − 20 LOP ✓ |
| LOP days | 20 | 22 absences − 2 comp-off offsets ✓ |
| Basic + HRA + Special Allowance | 7,082.20 + 3,541.10 + 7,082.20 = 17,705.50 | prorated 6/26 ✓ |
| `INPUT_COMP_OFF_PAYOUT` (1 day) | 2,950.92 | names grant `cmv51ezhr002x10j27vqumwcw` ✓ |
| **Gross pay** | **20,656.42** | 17,705.50 + 2,950.92 ✓ |
| Deductions (PF 849.86 + PT 200 + LWF 10) | 1,059.86 | ✓ |
| **Net pay** | **19,596.56** | 20,656.42 − 1,059.86 ✓ |
| Payslips published | 8 | matches `{"published":8}` ✓ |

The payslip's Comp-Off line was matched to the grant id in the input's `metadata`, not just
read off the screen.

## Findings

### 1. The daily rate is ₹2,950.92, not the plan's ₹3,076.92 (E-09)

The plan's preliminary estimate of ₹3,076.92 (CTC ÷ 26) is wrong, and it was right to warn
against hard-coding it. The implementation uses **full un-prorated monthly gross ÷ 26**:

```
(368,274.24 + 184,137.12 + 368,274.24) / 12 = 76,723.80 monthly gross
76,723.80 / 26                              = 2,950.92   <- metadata.dailyRate
```

This is internally consistent: a comp-off day is paid at exactly the rate one payable day of
earnings is worth, which is why gross pay stayed at ₹20,656.4 when one payout day converted
into one payable day. Treat ₹2,950.92 as the verified figure for this employee.

### 2. A half-day qualifying grant is credited as a full day (B-10) — untested, but visible in code

Not reproduced, so this is reported as a risk rather than a failure. The earning threshold is
`min(halfDayAfterMinutes, minWorkingMinutes)` = **240** minutes, but the grant is written with
a hard-coded `days: 1`
(`apps/api/src/modules/attendance/attendance.service.ts:3334`). An employee working a 4-hour
weekly off therefore appears to earn a **full** day, which under `PAY` is a full day's cash.
B-10's expectation of "no automatic full-day over-credit" looks unmet by construction. Worth
a decision: either raise the earning threshold or scale `days` to the hours worked.

### 3. `payroll_run_employees.isLocked` is never set — vestigial

All 8 entries still read `isLocked = false` after the run reached `LOCKED` and then
`PUBLISHED`. No functional impact today: **nothing in `apps/api` or `apps/web` reads or
writes this column at all.** The risk is forward-looking — a future guard written against
`isLocked` would silently treat every published entry as unlocked. Either populate it at lock
or drop it.

### 4. Approval requires a free-text warning override, via `window.prompt`

Approving needed 29 warnings overridden first ("Payroll has 29 warning(s). Override warnings
with a reason before approval."). The gate itself is sound and the reason is persisted to
`warningOverrideReason` and audited. Two observations: the reason is collected with a raw
`window.prompt` (`apps/web/src/components/forms/payroll-run-action-button.tsx:50`), which is
unstyled and hard to test; and because the comp-off staleness check runs *before* the
warnings check, an operator clearing warnings first will still be stopped by the comp-off
check — correct, but the ordering is worth knowing.

## State left behind — read before the next test run

**Nothing was reverted.** Per the plan's own instruction, records tied to locked or published
payroll were not deleted to restore appearances.

Retained deliberately:

1. **October 2026 attendance is finalized** — 248 records for 8 employees, 186 `ABSENT`
   (backfilled by finalization), all `isFinalized = true`.
2. **Payroll run `cmvmal76600hrq5nfvk53hw2z` is `PUBLISHED`** with 8 payslips. Warnings were
   overridden with the reason "Comp-off E2E test run - warnings reviewed and accepted".
3. **Grant `cmvmaj9o000gnq5nfyib23n74`** (17 Oct, the B1 artifact) is now **`USED` on 20 Oct
   2026**. It was consumed deliberately to drive E-06/E-12. It is no longer available as an
   `AVAILABLE` fixture for Phase F.
4. **Grant `cmv51ezhr002x10j27vqumwcw`** is claimed by the published run and can no longer be
   cancelled or used.
5. **`peoplehub_os_test`** now exists and is migrated. The integration suites clean up after
   themselves; the main `peoplehub_os` database was never touched by them.

The Asteron payroll policy was **not modified** — it is still `FIXED_DAYS`/26, `PAY`,
`MONTHLY`, carry-forward off, `compOffExpiryDays = null`, `NOT_ENFORCED`. No restore needed.

## What to do next

1. **Phase F and G need a clean fixture.** Both require policy changes and disposable grants,
   and October is now published. Use November 2026, or a second employee, and create
   purpose-built grants rather than reusing these.
2. **Decide on finding 2 (half-day over-credit).** It is the one plausible financial defect
   this pass surfaced, and it is a policy question as much as a code one.
3. **Cross-role and cross-tenant scenarios (A-09, A-10, C-08, C-09) remain entirely open** and
   cannot be closed from a Tenant Owner session.
4. **Keep `TEST_DATABASE_URL` set in CI.** All three comp-off integration suites skip silently
   without it, so the concurrency guarantees would go unverified without anyone noticing.
5. **Watch for a connection-pool flake in the full suite.** On 2026-11-04 one of three
   full-API-suite runs failed with `Can't reach database server` in all three integration
   suites; the other two runs, and every standalone run of the three suites, passed. The
   container was healthy throughout. The likely mechanism is pool sizing rather than anything
   in the tests: the suites open five Prisma clients between them, each defaulting to roughly
   `cores * 2 + 1` connections, which on a 12-core machine can reach past the server's
   `max_connections = 100` while Jest is also running the other 49 suites in parallel. A CI
   runner has far fewer cores, so it is much less exposed, but an explicit
   `?connection_limit=5` on `TEST_DATABASE_URL`, or running these three with `--runInBand`,
   would remove the risk entirely. Not changed here, as it is outside the comp-off change set.
