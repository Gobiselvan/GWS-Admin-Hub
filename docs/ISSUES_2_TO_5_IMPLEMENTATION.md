# Issues #2–#5 — sandbox validation and feature gates

**Status: v1.2 development candidate, not a production release.** Changes have offline tests only. No real staff records, admin credentials, tenant settings or tokens belong in GitHub.

## Issue #2 — Sandbox and release readiness (still requires a test tenant)

- [ ] Back up the private spreadsheet and the deployed Apps Script code in a restricted location.
- [ ] Have an authorized administrator review scopes and approvals. Configure a private test Google Sheet and synthetic/noncritical Workspace users.
- [ ] Initialize tabs and confirm the new Request ID columns are appended without shifting existing data.
- [ ] Verify an old YES/PENDING or YES/READY row *without* a registered approval cannot mutate the Directory.
- [ ] Verify a registered and approved sandbox joiner can be created with a one-time password, and licensing is checked separately.
- [ ] Test suspended, active, admin, and delegated-admin targets, due and future schedules, as well as interrupted API requests.
- [ ] Confirm changing an approved email, name, OU or schedule invalidates its approval.
- [ ] Inspect the private RequestRegistry, ApprovalEvents, AuditLog, Apps Script Executions and Admin Console's authoritative audit events.
- [ ] Have every prior trigger owner remove legacy triggers from their account; choose one registered owner for new scheduled checks.
- [ ] Compare 2SV aggregate counts against the test Admin Console.
- [ ] Confirm rollback and emergency trigger shutdown, then record explicit change approval before deployment or release.

No GitHub CI run can substitute for these steps. Do **not** publish a production-ready release based solely on mock tests.

## Issue #3 — Request IDs and audit integrity (partially implemented)

- The script appends Request ID to three request tabs and writes a UUID to a private RequestRegistry.
- Administrator approval requires an explicit menu action, creating a recorded actor/time/target/request ID plus input snapshot.
- Provisioning and scheduled mutation checks require a matching registry record and the latest logged approval event.
- A later change to request inputs invalidates that approval. Legacy manually approved rows require fresh registration and authorization.
- This is **not independent two-person approval**; authorized sheet editors and Apps Script editors can still tamper with records. Google Admin Console audit history is authoritative.
- Still open: tamper-resistant external storage, edit protections, privacy-preserving error notification design, comprehensive concurrency testing and approval revocation UX.

## Issue #4 — Manual read-only license summary (partial)

- Licensed admins can manually enter product/SKU aggregate counts into private LicenseInput: Product, SKU, Assigned, Purchased (optional), Source, Verified At (YYYY-MM-DD).
- Refresh manual license snapshot validates counts, flags over-assignment and reports Available=UNKNOWN if purchased capacity is unknown.
- LicenseSummary never includes individual user emails; there are **no license mutations**.
- **No License Manager API was enabled.** Google's [Enterprise License Manager API](https://developers.google.com/workspace/admin/licensing/v1/how-tos/authorizing) currently documents `https://www.googleapis.com/auth/apps.licensing` as a **read/write** scope, not a dedicated read-only scope.
- Automated SKU/customer discovery, authoritative assigned/purchased counts and sandbox API permission reviews remain open. Any integration should be isolated and separately approved.

## Issue #5 — Review-first HR intake (partial)

- A private HR Intake tab accepts Reference, Full Name, Org Unit Path, Recovery Email and Status.
- A unique non-sensitive reference marked READY FOR REVIEW may be staged to New Joiners as **Approved=NO**, **Status=DRAFT** with a registered request ID.
- A separate authorized admin must select the staged request and use Approve selected request. Creation still requires the existing confirmation dialog.
- No HR API, credential, webhook, event listener or production sync is enabled.
- Real provider integration needs a privacy impact review, field mapping, authentication, deduplication, independent roles, retry/idempotency policy and tests.

## Validation

Run `node tests/test.js` and verify GitHub Actions checks on the pull request. Offline tests cover core approval matching, snapshot tampering, manual SKU validation and synthetic HR row mapping. They **do not** validate actual Google Workspace licensing, a real HR system, or all concurrent human edits.
