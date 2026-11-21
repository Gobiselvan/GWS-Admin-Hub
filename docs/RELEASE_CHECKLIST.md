# Release checklist

- [ ] Pull request reviewed and offline CI passes.
- [ ] Synthetic-data tests run; no real tenant is used by CI.
- [ ] Manual sandbox Workspace integration tests documented.
- [ ] Version number and `CHANGELOG.md` updated.
- [ ] New administrator permission requirements reviewed and documented.
- [ ] Security and rollback procedures checked.
- [ ] Publish GitHub Release with factual tested features and known limitations.
- [ ] Keep rollback copy of previous Apps Script version in a restricted system.

Do **not** advertise a release as production-ready based only on unit tests.
