# Stage 3 evidence

## Current release

PR #21 is merged and application commit `e612d1b448a31cd6639f161740c31a9e22f63ed6` is deployed at [CauseConnect on AWS](https://52.62.2.87), release `2026-10-14T08-35-53-193Z-e612d1b448a3`. The [review-fix release evidence](review-hardening/README.md#publication-and-aws-checks--14-october-2026) records the new local checks, eight passed hosted acceptance groups and the actual Chrome journey. GET/PUT `/api/business/me` remains unavailable; browser business posting is blocked for new and existing owners.

## Evidence index

- [14 October review fixes](review-hardening/README.md) — merged fixes, exact-version AWS deployment, local regression checks and fresh hosted HTTP/browser evidence.
- [Additional APIs](additional-apis/README.md) — local regression, real API/database checks and dated AWS release acceptance.
- [Frontend preview](frontend-preview/README.md) — historical sample-preview and early real-API checks; not evidence of the current live release.
- [UX polish](ux-polish/README.md) — dated layout and interaction checks.

These records support the Final Product Document, manuals, testing report and demonstration. They do not replace independent tester acceptance or prove every requirement is complete. Preserve each dated result and add new evidence only after the related check has run.
