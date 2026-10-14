# Stage 3 evidence

## Current release

Application `af5dac741af06240e4885d098379c74c975ad893` is deployed at [CauseConnect on AWS](https://52.62.2.87), release `2026-10-14T12-12-08-602Z-af5dac741af0`. The [readiness repairs](final-readiness/README.md) passed 710 frontend, 116 backend unit, 90 HTTP/MySQL and 26 frontend/API/MySQL checks, build and isolated host/tooling checks. The [hosted receipt](final-readiness/hosted-2026-10-14.md) records exact release identity, 11 core HTTP groups and actual Chrome admin/business/photo/logout smoke checks. The preceding [PR #22 receipt](business-profile-integration/README.md) retains the full hosted approval/enquiry/inbox journey. Profile GET/PUT and photo posting are deployed; there is no outstanding missing-profile dependency. Independent tester/device acceptance and full/offsite recovery remain unverified.

## Evidence index

- [Readiness repairs](final-readiness/README.md) and [hosted checks](final-readiness/hosted-2026-10-14.md) — current repair, regression results, source-review limits, hosted verification and scoped QA cleanup.
- [Business profile integration — PR #22](business-profile-integration/README.md) — preceding merged/deployed integration, real database checks and the full hosted business journey.
- [Six-character signup minimum — PR #23](signup-minimum-six/README.md) — historical `fc9f959` release, local regression and its dated hosted API/browser checks.
- [14 October review fixes — PR #21](review-hardening/README.md) — historical `e612d1b` release, review fixes, local regression and its dated hosted HTTP/browser/host evidence.
- [Additional APIs](additional-apis/README.md) — local regression, real API/database checks and dated AWS release acceptance.
- [Frontend preview](frontend-preview/README.md) — historical sample-preview and early real-API checks; not evidence of the current live release.
- [UX polish](ux-polish/README.md) — dated layout and interaction checks.

These records support the Final Product Document, manuals, testing report and demonstration. They do not replace independent tester acceptance or prove every requirement is complete. Preserve each dated result and add new evidence only after the related check has run.
