# Changelog

All notable changes are documented here. Versions follow a simple `MAJOR.MINOR.PATCH` convention; publishing a GitHub Release is a separate deliberate step.

## [Unreleased] — v1.1 candidate

### Added
- GitHub Actions checks for Apps Script syntax, manifest and offline tests.
- Operational Google Sheets dashboard showing request counts and scheduler status.
- Read-only, aggregate 2-Step Verification reporting.
- Private `AuditLog` sheet for administrative activity metadata.
- Explicit owner registration for the five-minute scheduler.
- Request-row revalidation before directory mutations.

### Changed
- Provisioning now strictly requires `Approved = YES` and `Status = READY`.
- Documentation includes upgrades, scheduler migration and operational limitations.

### Limitations
- No live Google Workspace integration tests have been performed for this update.
- No License Manager API integration; license counts are not available.
- Trigger ownership cannot discover pre-existing triggers installed by other users.
- AuditLog is best-effort and not immutable.

## [1.0.0] — initial public release

- Tenant-neutral Apps Script for account creation, suspension and reactivation.
- Private spreadsheet configuration and explicit approvals.
- One-time password presentation and basic offline mock tests.
