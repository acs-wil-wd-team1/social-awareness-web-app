# Stage 3 evidence

## Current release

PR #22 is merged and application `ab1bef2c1b2e55c401a78543d4034cd2e85d0a2c` is deployed at [CauseConnect on AWS](https://52.62.2.87), release `2026-10-14T10-17-18-153Z-ab1bef2c1b2e`. The [business-profile receipt](business-profile-integration/README.md) records 631 frontend tests, 106 backend units, 87 HTTP/MySQL and 26 real frontend/API/MySQL checks; also 41 local host, 35 CLI/stub/routing and 15 offline Postman checks. Exact hosted identity, eight supporting-API groups, eight business-API groups and the actual hosted Chrome business journey passed. Profile GET/PUT and photo posting integration are implemented/deployed; the previous `404` blocker is removed. Independent tester acceptance and full/offsite recovery remain unverified.

## Evidence index

- [Business profile integration — PR #22](business-profile-integration/README.md) — current merged/deployed profile and photo-posting integration, real local database checks, fresh hosted API acceptance and actual Chrome business journey.
- [Six-character signup minimum — PR #23](signup-minimum-six/README.md) — historical `fc9f959` release, local regression and its dated hosted API/browser checks.
- [14 October review fixes — PR #21](review-hardening/README.md) — historical `e612d1b` release, review fixes, local regression and its dated hosted HTTP/browser/host evidence.
- [Additional APIs](additional-apis/README.md) — local regression, real API/database checks and dated AWS release acceptance.
- [Frontend preview](frontend-preview/README.md) — historical sample-preview and early real-API checks; not evidence of the current live release.
- [UX polish](ux-polish/README.md) — dated layout and interaction checks.

These records support the Final Product Document, manuals, testing report and demonstration. They do not replace independent tester acceptance or prove every requirement is complete. Preserve each dated result and add new evidence only after the related check has run.
