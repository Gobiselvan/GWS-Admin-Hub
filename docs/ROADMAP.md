# Implementation roadmap

## Now: v1.1 safety and observability

- [x] Provisioning requires explicit `READY` status.
- [x] Add offline GitHub Actions checks.
- [x] Add single-owner trigger metadata and upgrade instructions.
- [x] Add request-row revalidation and best-effort private audit entries.
- [x] Add read-only operational dashboard and 2SV aggregate report.
- [ ] Deploy to a sandbox Workspace and run real API integration tests.
- [ ] Enable `main` branch rules requiring pull requests and passing checks (repository Settings).
- [ ] Cut a first tested GitHub Release.

## Next: v1.2 governance and reporting

- [ ] Introduce immutable request IDs and an approval audit trail independent of row position.
- [ ] Add narrowly scoped, opt-in error notifications without sharing user data.
- [ ] Add user/account lifecycle report exports with explicit privacy and retention policy.
- [ ] Introduce safe, read-only license utilization through a separately authorized Google Workspace License Manager API integration.
- [ ] Support multi-domain tenant reporting when explicitly enabled.
- [ ] Expand tests to cover pagination errors, concurrent edits, repeated triggers and read-only compliance fields.

## Future: v2.0 integration

- [ ] Add approved HR lifecycle ingestion using a test connector and a documented mapping layer.
- [ ] Add configurable approval gates and role separation.
- [ ] Add CI-based Apps Script deployment tooling only after release and permission controls are reviewed.

Never commit private workspace configuration, real employee records, credentials or screenshots of production audits.
