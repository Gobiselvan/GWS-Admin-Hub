# Administrator deployment and upgrade checklist

Use this checklist before each deployment. It is a guide, not a substitute for organizational change control.

- [ ] Confirm authorization to run Admin SDK user-management operations.
- [ ] Review the exact code diff and required OAuth scopes.
- [ ] Confirm the Google Sheet and bound Apps Script are private to authorized administrators.
- [ ] Back up the spreadsheet and configuration (store backups securely, never in GitHub).
- [ ] Verify the domain, approved administrators, and spreadsheet timezone.
- [ ] Reinitialize sheets to create a private AuditLog on upgraded installations.
- [ ] Remove legacy triggers from **each** installing administrator's account.
- [ ] Register exactly one designated trigger owner.
- [ ] Test read-only dashboard and 2SV summary using a sandbox/approved tenant.
- [ ] Test approved and rejected provisioning with synthetic or designated test users.
- [ ] Test suspension and reactivation only on approved noncritical test accounts.
- [ ] Verify blank provisioning Status is rejected even with approval set.
- [ ] Verify edited/sorted rows are not processed while running.
- [ ] Confirm that ambiguous API responses remain `REVIEW REQUIRED` until manual review.
- [ ] Verify no temporary passwords or employee details are committed to GitHub.
- [ ] Review `AuditLog` and the Admin Console's authoritative audit records.
- [ ] Document rollback steps and who can disable triggers during an incident.
