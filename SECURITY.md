# Security and operational safety

**Never deploy this publicly as a web app.** It is designed as a **spreadsheet-bound** Apps Script installed and operated only by approved Google Workspace administrators.

## Protect your tenant

- The public source is deliberately **tenant-neutral**. Enter your actual domain, admin allowlist and spreadsheet ID **only during installation**, not in source control.
- Restrict Google Sheet **and** Apps Script editor access to authorized people. Anyone allowed to edit the script may change its logic and can read Script Properties; Script Properties are **not a secrets vault**.
- Use a dedicated authorized admin/automation account with only the privileges necessary for your use case. Google Workspace API permissions and domain policies still apply.
- The configuration wizard ensures the executor belongs to the domain and reports administrator role; every directory-mutating run also checks the admin allowlist and role.
- The script intentionally **blocks changes to super admins, delegated admins and configured allowlisted admins**. Perform exceptional admin account changes directly in Google Admin Console under your organization's change process.
- Every provisioning and scheduling row needs an explicit **Approved = YES**. Provisioning additionally requires **Status = READY** and a confirmation dialog; scheduled actions require **Status = PENDING**.
- Never add real staff data, private spreadsheets, temporary passwords, OAuth tokens, Apps Script secrets, service-account files, account exports or execution logs to GitHub, issues or pull requests.
- Temporary passwords are generated using browser cryptographic randomness and appear **once** in the dialog for successfully created accounts, not in the sheet. Keep them in an approved secure handoff process; reset in Admin Console if lost.
- Account creation/suspension calls can succeed even if their response is interrupted. `IN PROGRESS` and `REVIEW REQUIRED` intentionally **do not retry automatically**. Inspect the Admin Console before taking further action.
- Script authorization grants broad **Google Workspace user management** access. Read all OAuth consent prompts. Disable triggers if your admin account is compromised or deprovisioned.
- **Do not share the live Google Sheet publicly** even if the source repository is public.
- Test with a sandbox Workspace or clearly identified noncritical accounts; use an approved change window and separate review before production operations.

## Scope and limitations

- This project **does not** implement independent two-person approval, audit log tamper-proofing, vault-backed credential delivery, or license assignment. It should not be treated as a complete IAM platform.
- Editors can change approved fields; use sheet permissions and your organization's access-management processes to manage trust.
- Five-minute triggers are best-effort checks, not exact minute scheduling; execution and API quotas apply.
- Actual permissions are governed by the Google Workspace admin account and Admin SDK Directory API. Scripts cannot bypass Google Workspace RBAC.

## Security reports

Avoid posting sensitive details in a public issue. Contact the repository maintainer privately through an approved channel. Do not include credentials, employee names, tenant IDs or live logs in a public report.

## Emergency stop

1. Use **⚡ GWS Admin Hub → Disable scheduled checks** from the sheet, or delete the `hub_runScheduledActions` trigger in Apps Script **Triggers**.
2. Remove `YES` approval from pending rows; then use the Google Admin Console to verify current user states.
3. Revoke the script's authorization or remove its access, if required by your incident-response procedure.
4. Investigate Apps Script **Executions** and Workspace Admin audit logs according to your organization's retention policy.