# Contributing

Thanks for helping improve Google Workspace Admin Hub. This project can change real user accounts, so changes need extra care.

1. Open an issue describing the bug or proposed improvement. **Do not include real employee emails, tenant IDs, password screenshots, tokens or logs.**
2. Work in a dedicated branch and open a pull request targeting `main`.
3. Add or update offline mock tests for any changed behavior. Run `node tests/test.js` locally.
4. Ensure the **Code checks** GitHub Actions workflow passes. Describe manual testing and any privilege/scope changes in the pull request.
5. Do not deploy account-changing changes to a live tenant without separate administrator approval and tests using noncritical accounts.

Please use synthetic `example.com` data in tests and documentation.
