# ⚡ Google Workspace Admin Hub

A reusable, spreadsheet-driven **Google Apps Script** utility for administrators of **their own Google Workspace domain**. It helps administrators create new users, schedule account suspensions, and schedule reactivations from a Google Sheet.

> **Important:** This project makes real Google Workspace directory changes. It is **not** a Google Workspace Marketplace app, a standalone web app, or a licensed security product. Use a test domain/test accounts first, check organizational approval before publishing or deploying, and restrict access to the live spreadsheet and Apps Script project.

## Features

| Module | What it does | Safeguards |
|---|---|---|
| New Joiner Provisioning | Creates up to 50 explicitly approved user accounts per run. | Validation-only preview; strong 16-character temporary passwords shown once; never persisted to sheets; no automatic retries after ambiguous creation errors. |
| Scheduled Suspension | Checks approved, due suspension rows every 5 minutes. | Checks email domain; blocks Google Workspace administrator accounts; records status before attempting an API update. |
| Scheduled Reactivation | Checks approved, due reactivation rows every 5 minutes. | Same controls and administrator protection; safe handling of accounts already active. |
| Config & authorization | Stores tenant-specific domain, allowlisted admins, and spreadsheet ID in Apps Script Script Properties. | No organization email addresses or secrets in public source. Execution requires an allowlisted Google Workspace administrator. |

## What this project does **not** do

- It does **not** assign, purchase, or verify availability of Google Workspace/Gmail licenses. Verify licensing separately in Admin Console.
- It does **not** remove users, delete accounts, transfer data, or grant admin roles.
- It does **not** create exact-time one-off triggers: a repeating trigger checks roughly every five minutes. Run times can vary.
- It does **not** store employee data or credentials in this GitHub repository. **Do not commit real spreadsheet exports, credentials, or staff lists.**

## Repository files

```text
GWS-Admin-Hub/
├── Code.gs               # Google Apps Script: menu, validation, provisioning, scheduling
├── ProvisionDialog.html  # One-time password display in a confirmation dialog
├── appsscript.json        # Apps Script manifest (Admin SDK Directory service + OAuth scopes)
├── README.md             # Installation, operations, troubleshooting
├── SECURITY.md           # Safety, authorization and incident guidance
├── .gitignore            # Excludes common secrets and data exports
└── tests/
    └── test.js           # Local mock tests; do not access live Google Workspace
```

## Prerequisites

1. An existing Google Workspace domain for which **you are authorized** to create and manage users.
2. A Google Workspace account with sufficient **administrator privileges** for the required Admin SDK Directory operations. A limited/delegated administrator may not have all required privileges; test the role in the Admin Console.
3. A **private Google Sheet** restricted to approved administrator editors.
4. Google Apps Script access and permission to enable the **Admin SDK Directory** advanced service and Google Admin SDK API.
5. Organizational approval for using automated account provisioning/suspension. Follow your retention, security and audit policies.

## Install in your Google Sheet (step by step)

1. Create a **new Google Sheet**. Give it a meaningful name, e.g. `Workspace Admin Operations`. Share it only with approved administrators. **Do not use a publicly shared sheet.**
2. Set its timezone in **File → Settings → Time zone**. All scheduled dates and times are interpreted in this timezone.
3. Open **Extensions → Apps Script** from this Sheet. The project **must be bound to the Sheet** (do not deploy it as a public web app).
4. Replace the default `Code.gs` editor content with the full contents of this repository's [`Code.gs`](Code.gs).
5. Add an HTML file named **`ProvisionDialog`** using **+ → HTML**. Paste [`ProvisionDialog.html`](ProvisionDialog.html).
6. In Apps Script, open **Project Settings → Show "appsscript.json" manifest file in editor**. Replace its content with [`appsscript.json`](appsscript.json). Check that the Admin SDK Directory service appears under **Services** (or add **Services → + → Admin SDK API** if it is not shown).
7. Ensure the **Admin SDK API** is enabled for the linked Google Cloud project, if using a standard Cloud project. If it is not enabled or your administrator blocks access, ask the Workspace/Cloud administrator to enable it.
8. **Save** the Apps Script project. If the initial authorization dialog appears, verify the requested scopes and authorize with the approved Workspace administrator account. The script requests permission to manage users and read/write spreadsheet contents, plus manage its triggers.
9. Return to the Google Sheet and **reload** the browser tab. A menu named **⚡ GWS Admin Hub** should appear.
10. Use **⚡ GWS Admin Hub → 1. Configure this Workspace**. Enter your domain (without `@`) and a comma-separated list of authorized administrator email addresses **including your own**. The script verifies that the configuring account has an administrator role. Tenant details are saved **in Script Properties**, not in public source code.
11. Use **2. Initialize sheets** to create `New Joiners`, `SuspensionList`, and `ReactivationList` tabs. If a tab already contains a different layout, the script refuses to overwrite it. Use a fresh Sheet or take a backup and migrate data manually.
12. Run **Check configuration / permissions**. Confirm domain, spreadsheet and timezone. **Test with a noncritical test user before production use.**
13. Only after testing, use **Enable checks every 5 minutes** to create the scheduled trigger. Triggers run as their installer, so use a dedicated approved administrator account and keep it active.

**Note for maintainers:** Apps Script does not automatically run code hosted on GitHub. When a release changes, manually update `Code.gs`, `ProvisionDialog.html` and (if needed) the manifest in the bound Apps Script project. Teams may also use [`clasp`](https://github.com/google/clasp) for version-controlled deployments, subject to their organization's controls.

### Configuration storage

The Setup wizard writes these values into **Apps Script → Project Settings → Script Properties**:

| Property | Example | Purpose |
|---|---|---|
| `GWS_DOMAIN` | `example.com` | Allowed account domain. |
| `GWS_ALLOWED_ADMINS` | `admin@example.com,backup-admin@example.com` | Allowlist; each executing account must also have a Google Workspace admin role. |
| `GWS_SPREADSHEET_ID` | Generated by script | The bound Sheet used by time-driven triggers. |

**These are configuration settings, not secrets.** People who can edit the Apps Script project can inspect script properties, source and spreadsheet data. Do not store passwords, API keys or OAuth refresh tokens there. Apply strict access controls.

## How to use: New Joiner Provisioning

Open the `New Joiners` tab, with columns:

| Full Name | First Name | Last Name | Email Prefix | Org Unit Path | Recovery Email | Approved | Status |
|---|---|---|---|---|---|---|---|
| Sample Person | Sample | Person | sample.person | / | (optional) | YES | READY |

The actual sheet also includes **Created Email**, **Google User ID**, **Details**, and **Processed At** (automatically filled). Use fictitious test names, not real employee information, when demonstrating the tool.

1. Add a full name or enter first/last names directly. The script suggests `firstname.lastname` prefixes for simple multi-word names; verify them **manually**.
2. Enter a valid email prefix or a full address on the configured Workspace domain. Enter an existing organizational unit path, e.g. `/` or `/Engineering`.
3. Enter `YES` in **Approved** and `READY` in **Status** **only** for users whose details were reviewed and approved. All other rows are ignored.
4. Select **New joiners → Validate approved rows (dry run)**. This only validates; it does **not** create any users.
5. Select **New joiners → Create approved users (confirm)**. Read the confirmation and check the acknowledgment before starting.
6. The browser creates random **16-character strong temporary passwords**, and the server attempts to create up to 50 accounts with **change password at next login** enabled.
7. **Copy/store temporary passwords immediately** in your approved credential handoff channel. The dialog is a one-time display; passwords are **not** stored in the Sheet or logs. If the dialog closes before saving, reset affected passwords in the Admin Console.
8. Check `CREATED` rows and the Admin Console. **Licensing is not automatic.** Check `REVIEW REQUIRED` rows individually in the Admin Console before changing their status or attempting a retry.

Rows marked `IN PROGRESS`, `CREATED` or `REVIEW REQUIRED` are **not** automatically retried. An API timeout can occur after a user was actually created, so the safest next step is to verify the Admin Console.

## How to use: Scheduled suspension

Use the `SuspensionList` tab:

| Date (DD.MM.YY) | Time (hh:mm AM/PM) | Mail ID | Approved | Status | Log / Details |
|---|---|---|---|---|---|
| `30.11.26` | `05:30 PM` | `sample.person@example.com` | `YES` | `PENDING` | *(automatic)* |

1. Enter the desired date/time (the **spreadsheet's timezone**) and an email in the configured domain.
2. Explicitly enter **Approved = `YES`** and **Status = `PENDING`**.
3. Select **Suspensions → Process due approved suspensions** for an immediate check, or enable the five-minute schedule.
4. When due, the script checks the account, blocks administrator accounts, marks a successful suspension `COMPLETED`, or records a review status.
5. To cancel a pending action, change **Approved** from `YES` to `NO`, or change **Status** to `CANCELLED` **before** its due check.

**Safety:** The script will not suspend a Google Workspace super administrator, delegated administrator, or an email on its configured admin allowlist. It only changes account suspension, not Gmail/Drive data retention or license assignment.

## How to use: Scheduled reactivation

Use the `ReactivationList` tab, **with the same six columns and status values** as `SuspensionList`. Enter the approved target account and scheduled date/time, then use **Reactivations → Process due approved reactivations** or the common five-minute trigger. The script checks the account first and skips those already active. Administrator accounts must be managed manually in Admin Console.

## Status reference

| Status | Meaning |
|---|---|
| `READY` | A new-joiner row eligible for creation only when Approved = YES. |
| `PENDING` | A suspension/reactivation row eligible for the due-date check when Approved = YES. |
| `IN PROGRESS` | An account modification was staged; do not retry without verifying actual state. |
| `CREATED` | The Directory API confirmed a new user ID. |
| `COMPLETED` | A suspension/reactivation was confirmed. |
| `ALREADY SUSPENDED` / `ALREADY ACTIVE` | Desired account state already existed. |
| `BLOCKED: ADMIN` | An administrator account was protected. |
| `REVIEW REQUIRED` | Operation failed or could not be confirmed; inspect Admin Console. |
| `CANCELLED` | Manually disabled the pending action. |

## Troubleshooting

| Issue | What to check |
|---|---|
| `AdminDirectory is undefined` | Add and enable Admin SDK Directory in Apps Script Services; ensure Admin SDK API is enabled for your Cloud project. |
| `Not configured` | Run **Configure this Workspace** while signed in as a permitted Workspace administrator. |
| `Not authorized` | Use an allowlisted account with administrator privileges on the configured domain. |
| `Headers changed` | Use the defined column order in a fresh Sheet. Back up and migrate older sheet layouts manually; setup deliberately does not overwrite them. |
| No accounts created | Check `Approved = YES`, `Status = READY`, valid email prefix, and absence of previous output in the row. Run validation first. |
| Scheduled job not running | Check Apps Script **Triggers** and **Executions**, trigger owner account, authorization status, and admin API permissions. |
| User created but script shows review | Verify actual account in **Admin Console**. Never blindly retry; a network/API error may have happened after creation. |
| Suspension happens a few minutes late | Time-driven trigger checks are periodic, not real-time; check Google Apps Script quotas and executions. |

## Development and testing

The project includes local Node mock tests that **never contact a real Workspace tenant**:

```bash
node tests/test.js
```

These tests cover input validation and critical authorization rules. **Passing local tests is not proof of production readiness.** Test Google APIs and triggers in a separate test Workspace under an authorized admin account before processing employees.

## References

- [Google Apps Script Admin SDK Directory advanced service](https://developers.google.com/apps-script/advanced/admin-sdk-directory)
- [Enabling advanced Google services](https://developers.google.com/apps-script/guides/services/advanced)
- [Apps Script installable triggers](https://developers.google.com/apps-script/guides/triggers/installable)
- [Apps Script quotas](https://developers.google.com/apps-script/guides/services/quotas)
- [Directory API user operations](https://developers.google.com/workspace/admin/directory/v1/guides/manage-users)

## Responsible use

This repository intentionally contains **no actual company domain, company email address, API token, secret, or employee record**. Please review [SECURITY.md](SECURITY.md) before sharing or deploying any fork. Public GitHub visibility **does not** make your operational spreadsheet public: keep your own spreadsheet, deployment credentials and trigger account private.

## What's new in the v1.1 development update

- **Strict provisioning approval:** only rows with both `Approved = YES` and `Status = READY` are eligible; blank statuses are ignored.
- **Staged-row revalidation:** immediately before invoking the Directory API, the script rereads the request row and checks the expected account and approval state. Do not edit or sort a sheet while it is processing; spreadsheet editing is not transactionally locked.
- **Private `AuditLog` sheet:** includes timestamp, administrator, operation, affected email, outcome and a sanitized description. Passwords are never logged. Audit logging is best effort; consult Google Admin audit logs for authoritative audit records.
- **Single-owner trigger registration:** the installing admin is recorded in Script Properties. Other configured administrators cannot install a second trigger through the menu. On a deployment upgraded from an older version, each admin should inspect and remove legacy triggers before registering a single owner, because Apps Script only lists the current user's triggers.
- **Operational `Dashboard` sheet:** displays counts from the private request tabs, last scheduled run, owner, and results. It does not edit Google Workspace users.
- **Read-only 2SV summary:** optionally retrieves aggregate 2SV enrollment counts for the configured domain from the Directory API. Does not show employee-level details, enforce policy, or modify accounts. Multi-domain organizations should review the domain filter before interpreting tenant-wide totals.
- **GitHub Actions:** runs source syntax checks and offline tests on new pushes and pull requests. These are not live integration tests and cannot verify actual Google Workspace permissions or license availability.

### After upgrading an existing installation

1. Review the code diff, make a backup of the bound spreadsheet, and test with noncritical accounts.
2. Copy the updated `Code.gs` into your bound Apps Script project. Reload the Sheet to refresh its menu.
3. Run **GWS Admin Hub → Initialize sheets** once. It adds `AuditLog` without erasing existing request data (provided the headers remain compatible).
4. Check and delete **legacy time-driven triggers** under Apps Script → Triggers for every administrator who previously installed them. Trigger ownership metadata cannot discover triggers owned by other users.
5. Have the designated automation administrator enable the new five-minute check once.
6. Run **Refresh operational dashboard**. Optionally run **Refresh read-only 2SV summary** after verifying Directory API access.
7. Keep the live sheet private; never publish employee rows, operational audits, one-time passwords, or customer-specific settings.

**License metrics:** These are not available yet. License counts require a separate, permission-reviewed License Manager API integration; the dashboard explicitly says *Not integrated* instead of inventing numbers.

**Security summary limitations:** Directory records without a reliable 2SV status should be classified as unknown, not presumed noncompliant. Reports are point-in-time counts, not policy enforcement evidence.

### Testing changes locally and in GitHub

Run `node tests/test.js` with Node.js 22 or later. The tests use API mocks and never call a real Workspace tenant. The `Code checks` GitHub Actions workflow runs the same tests on each pull request and push to `main`. Add manual sandbox-tenant tests and an explicit change approval before deploying updated account-changing code.

## v1.2 development candidate — request approvals, manual licensing and HR staging

**This candidate has not been validated in a live or sandbox Google Workspace tenant. Do not treat it as a production release.** See [implementation and release gates](docs/ISSUES_2_TO_5_IMPLEMENTATION.md). Issues [#2](https://github.com/Gobiselvan/GWS-Admin-Hub/issues/2), [#3](https://github.com/Gobiselvan/GWS-Admin-Hub/issues/3), [#4](https://github.com/Gobiselvan/GWS-Admin-Hub/issues/4), and [#5](https://github.com/Gobiselvan/GWS-Admin-Hub/issues/5) remain open for the unvalidated work.

1. Back up the private spreadsheet and existing Apps Script version. In the bound script, add `Workflow.gs` and `LicenseSnapshot.gs` alongside `Code.gs` and `ProvisionDialog.html`.
2. Run **Initialize sheets** again. This preserves supported 12/6-column data layouts while appending a **Request ID** column and creating private registry/approval/HR/license tabs.
3. Complete names and email prefixes; choose **Register requests / assign IDs**. Select a request row and use **Approve selected request**. Manually typing `Approved=YES` is insufficient without a registered ID and matching approval snapshot.
4. User creation still requires a separate confirmation. Scheduled suspension and reactivation require due, approved requests. Existing entries without registered approvals need review and renewed approval after migration.
5. For a **manual HR intake demonstration**, enter a unique non-sensitive reference, name, OU and `READY FOR REVIEW` in the `HR Intake` tab, then **Stage HR intake for review**. Staging produces only an unapproved `DRAFT` record; **no account is created**.
6. For **manual licensing**, enter only aggregate Product, SKU, Assigned, Purchased (optional), Source, and Verified At (`YYYY-MM-DD`) values in private `LicenseInput`, then **Refresh manual license snapshot**. `LicenseSummary` shows `UNKNOWN` capacity when purchased seats aren't known. This is **not** live licensing API access.

No additional licensing OAuth scope has been added. The License Manager API's licensing scope is not read-only; automatic integration requires separate authorization and testing.
