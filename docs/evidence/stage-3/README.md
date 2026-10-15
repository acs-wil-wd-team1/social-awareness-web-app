# Stage 3 evidence

## Current release

Application `ad94ecb4348458803673c9ef3737fd0b48938d66` is deployed at [CauseConnect on AWS](https://52.62.2.87), release `2026-10-15T00-26-47-291Z-ad94ecb43484`. The [15 October repairs and reviews](final-review-2026-10-15/README.md) passed 740 frontend, 116 backend unit, 90 HTTP/MySQL and 26 frontend/API/MySQL checks plus build. The [15 October hosted receipt](final-review-2026-10-15/hosted.md) records verified identity, 11 core HTTP groups and actual Chrome admin/navigation/photo/logout and mobile smoke checks. Claude independently reran the frontend/build and mocked-API browser diagnostics; its coverage is separate from real-database and hosted checks. Profile GET/PUT and photo posting are deployed; there is no outstanding missing-Kim dependency. Independent tester/device acceptance and full/offsite recovery remain separate.

## Evidence index

- [15 October final repairs/reviews](final-review-2026-10-15/README.md) and [hosted checks](final-review-2026-10-15/hosted.md) — current source/testing, independent review limits, served release and scoped QA receipt.
- [14 October readiness repairs](final-readiness/README.md) and [hosted checks](final-readiness/hosted-2026-10-14.md) — preceding repair/regression and narrower hosted smoke scope.
- [Business profile integration — PR #22](business-profile-integration/README.md) — preceding merged/deployed integration, real database checks and the full hosted business journey.
- [Six-character signup minimum — PR #23](signup-minimum-six/README.md) — historical `fc9f959` release, local regression and its dated hosted API/browser checks.
- [14 October review fixes — PR #21](review-hardening/README.md) — historical `e612d1b` release, review fixes, local regression and its dated hosted HTTP/browser/host evidence.
- [Additional APIs](additional-apis/README.md) — local regression, real API/database checks and dated AWS release acceptance.
- [Frontend preview](frontend-preview/README.md) — historical sample-preview and early real-API checks; not evidence of the current live release.
- [UX polish](ux-polish/README.md) — dated layout and interaction checks.

These records support the Final Product Document, manuals, testing report and demonstration. They do not replace independent tester acceptance or prove every requirement is complete. Preserve each dated result and add new evidence only after the related check has run.
