# Stage 3 evidence

## Current release

PR #23 is merged and application commit `fc9f9594b9f27e70ad5dc0b2d8f1ee1d754e0949` is deployed at [CauseConnect on AWS](https://52.62.2.87), release `2026-10-14T09-34-26-691Z-fc9f9594b9f2`. The [six-character signup release evidence](signup-minimum-six/README.md) records 631 frontend tests, 89 backend units, 73 HTTP/MySQL and 20 frontend/API/MySQL checks, eight fresh hosted API groups, and actual Chrome five-/six-character signup and login/logout checks. The PR #21 host/tooling checks remain historical evidence for unchanged host files, not a fresh rerun. GET/PUT `/api/business/me` still returns `404` on main/live: Kim's open, conflicting PR #22 provides an implementation awaiting resolution/review. Browser business posting remains blocked for new and existing owners.

## Evidence index

- [Six-character signup minimum — PR #23](signup-minimum-six/README.md) — current exact-version AWS release, local regression and fresh hosted API/browser checks.
- [14 October review fixes — PR #21](review-hardening/README.md) — historical `e612d1b` release, review fixes, local regression and its dated hosted HTTP/browser/host evidence.
- [Additional APIs](additional-apis/README.md) — local regression, real API/database checks and dated AWS release acceptance.
- [Frontend preview](frontend-preview/README.md) — historical sample-preview and early real-API checks; not evidence of the current live release.
- [UX polish](ux-polish/README.md) — dated layout and interaction checks.

These records support the Final Product Document, manuals, testing report and demonstration. They do not replace independent tester acceptance or prove every requirement is complete. Preserve each dated result and add new evidence only after the related check has run.
