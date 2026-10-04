# Stage 3 frontend checks — 30 September–1 October 2026

Checked the `feature/stage3-campaign-submission` working tree, based on `0ff49d2`. The original preview builds included uncommitted changes. This records frontend, local hosting, AWS sample-preview checks and the later real-backend regression below. It does not certify the unfinished Stage 3 APIs or final cloud application.

## Automated checks

- 483 tests passed across 28 frontend test files after the expanded feature pass.
- Four separate CloudFront preview-routing tests passed.
- Demo and live production builds passed.
- Both generated ZIP archives passed integrity checks.
- Both exact packaged sites passed local Nginx checks: 15 direct SPA routes, JavaScript/CSS assets, the supplied logo as a valid PNG, and the deliberate JSON `503` while the API is unavailable. Both packaged logos match the supplied file byte-for-byte.
- Nginx configuration checks passed for the unavailable-API and proxy variants. Missing assets return `404`; hidden files return `403` rather than SPA HTML.
- The live bundle contains no demo API/banner chunks or sample-session fixture strings.
- Production dependency audit reported zero known vulnerabilities.
- `git diff --check` passed. Temporary hosting-check containers were removed.

Tests cover authentication response validation, session expiry, role navigation, safe return paths, timeouts/cancellation, field errors, posting and image handling, business profiles, owner editing/removal, participation, enquiries, account management, review history and live refresh. Version-conflict tests prevent approval of content edited after the administrator loaded it. Uncertain submission outcomes cannot be retried without acknowledgement. Mocked API tests are not proof of server-side permission enforcement.

## Browser checks

Used the explicitly labelled sample preview in Chrome at `http://127.0.0.1:5180`.

1. Browsed approved campaigns as a guest and opened their details.
2. Submitted a community campaign with a photo; saw pending status in My campaigns.
3. Approved it as an admin; verified it appeared publicly with its photo and submitted details.
4. Confirmed business posting requires a profile; saved a sample profile and submitted a business campaign.
5. Confirmed rejection requires a reason; rejected the business campaign and read the reason from its owner's account.
6. Confirmed a business user cannot enter the admin queue and a pending campaign's public detail returns not found.
7. Checked owner, business-posting and admin layouts at 390 px: no horizontal overflow. Restored the normal viewport afterwards.
8. Reset only the disposable preview data after the walkthrough and left the admin review preview available.
9. Added the user-supplied original 1692 × 930 transparent PNG unchanged. Confirmed it loads in the header and fits on desktop and mobile, with no horizontal overflow.
10. Joined, withdrew from and rejoined a cause. My participation showed the resulting joined record.
11. Checked required enquiry fields, submitted a sample business enquiry and read it from the private business inbox after creating the required business profile. A community account was denied inbox access.
12. Edited an approved business campaign. It returned to pending and its public detail became unavailable. Reapproved it, verified the new history entry, then unpublished it without losing its enquiry/history records.
13. Resubmitted a rejected owner campaign and removed it using the title-confirmation step.
14. Suspended and reactivated a sample community account. The dedicated administrator remained protected.
15. After the final version-check repair, approved the current business campaign version and soft-deleted it with a reason; both succeeded. These were disposable sample records, not database writes.
16. Checked account-management and business-inbox layouts at 390 px with no horizontal overflow. Restored the normal viewport and reset disposable sample data after the walkthrough.

Screenshots:

- [Admin review, desktop](admin-review-desktop.jpg)
- [Owner status and feedback, mobile](owner-mobile.jpg)
- [Admin queue, mobile](admin-mobile.jpg)
- [Admin review with final logo, mobile](admin-review-mobile.jpg)
- [Account management, desktop](admin-accounts-desktop.jpg)
- [Account management, mobile](admin-accounts-mobile.jpg)
- [Private business inbox, mobile](business-enquiries-mobile.jpg)

The owner screenshot predates the logo addition; the desktop/admin screenshots show the supplied logo.

The only observed console error came from an unrelated browser extension, not application code. No app error overlay was observed during the journeys.

## AWS sample preview — 1 October 2026

[Preview URL](https://d10e86f5qx46up.cloudfront.net). AWS reported the distribution **Deployed** and enabled after the upload. The console shows the CloudFront Free plan. Storage is a separate private S3 bucket with public access blocked and distribution-scoped origin access; no repository files, credentials or real user data were uploaded.

Public verification at 12:30 am Sydney passed 57 checks with no failures:

- All 15 application routes return the SPA, including direct links.
- All 15 deployed files match the approved demo package byte-for-byte, including photos, the original logo and lazy-loaded preview code.
- Hashed assets use immutable caching; other release files revalidate.
- HTTP redirects to HTTPS. Security headers include HSTS, nosniff, frame protection and referrer policy.
- Missing assets remain `403` XML errors, not SPA HTML. Direct S3 access is denied.
- `/api` returns explicit no-store JSON `503 API_NOT_READY`.

Chrome checks on the hosted URL also passed: home/photos/logo, community sample submission, admin approval/history, public detail after refresh, business-profile prerequisite and save, business posting form, and denial of admin account management to a business user. Business posting at 390 px had no horizontal overflow. The viewport was restored and disposable sample changes were reset afterwards. No application console error was observed; the captured errors were from the unrelated browser extension noted above.

Hosted screenshots: [home](aws-preview-home.jpg), [business form, mobile](aws-business-mobile.jpg).

The deployment used the exact demo archive hash below. The 483 frontend tests and four routing tests were rerun and passed on 1 October. Sample role switching is deliberately available; it is not a real admin sign-in or evidence of backend security.

## Remaining checks

- Implement the missing APIs and database/image-storage work in the [Kim/Rajita handoff](../../../handoff/stage3-api-handoff.md), then run these journeys with sample mode disabled and real accounts.
- Verify actual server permissions, owner isolation, upload privacy, concurrent decisions, persistence and session invalidation against the database. No new backend code was changed in this pass.
- Frontend preview hosting is complete. The planned backend/database/image-storage deployment, live-mode rebuild and real end-to-end cloud checks remain open. CloudFront's Free plan does not guarantee every AWS service is free.
- Rebuild and repeat the relevant checks if the logo or runtime code changes.

The supplied meeting notes confirm frontend/deployment ownership for Unice, user-posting API for Rajita, business-posting API for Kim and admin-approval API jointly for Kim/Rajita. The frontend has no account-promotion feature; the backend must provide the dedicated admin account and enforce its role.

The original preview pass did not commit, push, merge or update PR #12. Its packaged build predates the integration-hardening changes below.

The original preview release folders are `infra/dist/causeconnect-demo-LOOdZj` and `infra/dist/causeconnect-live-TyGbJg`. Both contain `site/`, release metadata and `causeconnect-frontend.zip`; generated packages stay outside Git. They are retained as evidence of that build, not the subsequent fixes.

Archive SHA-256:

- Demo: `306429cfa266269cdd325de0ce6db05388f0dd407b39bc16b97be70551630798`
- Live: `f1d6755a5bcab0407db3fead62a565d6fd59b0b7c8fbc6ffa9ef20835cb593ad`

## Integration hardening — 1 October 2026

The later local pass fixed and tested:

- A failed campaign photo remaining hidden after a refreshed image URL arrived. Three regression cases failed before the fix and passed afterwards.
- Previous-account participation or business-inbox data appearing on the first render after a same-role account switch. Both first-render regression cases failed before the fix and passed afterwards; account changes now remount page state.
- Registration names/emails exceeding the database column limits, and a registration response returning a different role from the requested account type. The form validates trimmed lengths and checks the returned role; the server must still enforce its own validation.

Fresh results after these fixes:

| Check | Result | What it establishes |
|---|---|---|
| Frontend unit/component/service suite | 494 passed in 29 files | Frontend logic, including mocked API and sample-mode cases |
| Production builds | Demo and live passed | Both bundles compile; both ZIP archives passed integrity checks |
| CloudFront routing unit tests | 4 passed | Local routing-function behaviour, not a new deployment |
| Backend unit tests | 10 passed | Existing backend validation/guard cases |
| Backend HTTP/MySQL tests | 7 passed | Existing submission/database cases; includes deliberate failure-path injection |
| Frontend → Express → MySQL | 9 passed | Actual HTTP and persistence for implemented routes, without response/auth/database mocks |

The [real-backend runner](../../../../infra/real-backend-testing.md) applied nine migrations to a fresh, loopback-only MySQL container. The nine frontend integration cases cover saved registration/password hashing, duplicate email, rejected invalid login, valid login/session persistence, categories/public reads, pending campaign submission from the actual form, public privacy/admin read, server validation and logout session revocation. The admin case also rejects anonymous and ordinary-user access. The suite uses jsdom for components, not Chrome: redirects, CORS and real-browser navigation are not certified by it. Independent reruns passed and their disposable containers were removed. Existing project databases were not used. The runner rejects remote Docker endpoints before container creation and pins cleanup to the checked local endpoint; an explicit remote-host rejection check passed.

The [Postman collection](../../../api/postman/README.md) provides 41 ready-made requests for the remaining API work and existing routes. Its offline validator passed 14 check groups covering structure, guards and response assertions. No API requests or Postman Desktop runtime checks were performed by that validator; it is not evidence the pending endpoints exist or pass.

Updated local packages: `infra/dist/causeconnect-demo-RHq6MN` and `infra/dist/causeconnect-live-ht3XN8`. Demo archive SHA-256: `b89636804f789c6ff767958d83885e11942229eff60978543f5209c7fdb6a2d1`. Live archive SHA-256: `7a86f5a0dbeea04aba16f25a907ebda303a338f0e5257753e48e8261bf1ff9e1`. These are local artifacts, not uploaded releases.

These changes do not modify backend application code or deploy a new AWS build. The hosted URL above still serves the earlier sample package. Missing Stage 3 APIs, real browser integration and the final cloud release remain open; rerun the relevant checks against the implemented endpoints before accepting each flow.

## Browser and failure-path pass — 1 October 2026

This pass used `e77a66a` plus the local fixes below. No commit, push, merge or AWS deployment was made during this pass.

### Fixes

Regression cases reproduced these problems before the fixes:

- The app shell could remount logout after a session refresh and report completion while server revocation was still pending or had failed. Logout now keeps its in-memory revocation token and retry state; session subscriptions also catch a child's initial sign-out.
- A cancelled or timed-out response body could look like invalid JSON. Cancellation now retains its actual error classification.
- A content-change event arriving during a read could be lost. The old result is discarded and one fresh read follows.
- Blocked browser storage could interrupt logout, and a partially saved login could pair a new token with old account details. Storage failures now have explicit recovery paths.
- After a rejected image upload, choosing the same file could fail to trigger a new selection. The native picker resets without losing the selected preview.
- Malformed moderation responses could pass unexpected fields or non-text review comments into the UI. The service validates comments and returns only the documented campaign status fields.

The full frontend suite passed **508 tests in 29 files**. Demo and live production builds passed, both ZIP archives passed integrity checks, four routing tests passed, and the Postman collection passed its 14 offline checks. These are separate from the browser/database evidence below.

A fresh automated real-backend run after the fixes also passed: **10 backend unit, 7 HTTP/MySQL and 9 frontend/Express/MySQL checks**. Its disposable container was removed.

### Real browser, Express and MySQL

The runner's new `--browser` mode started actual Vite and Express servers against a fresh disposable MySQL database, with nine migrations and sample mode disabled. The browser called the same-origin Vite proxy; no existing project database was used.

The Codex in-app browser verified:

- Registration required fields and password mismatch; saved registration with a hashed password; duplicate-email rejection without a second user row.
- Invalid-password rejection, successful login and authenticated navigation after refresh.
- Campaign required fields and reversed-date rejection; a text-only campaign saved through the form as pending, with its actual owner ID in MySQL.
- Approved public listing, pending campaign hidden from the public detail route, ordinary-user denial of admin access, and the real admin queue showing pending records.
- Signing into a business account in a second tab cleared the first tab's admin queue and access immediately.
- Real logout after a retry marked the database session expired. Final readback showed all three explicitly logged-out accounts expired; the admin session remained active after being replaced by another account, which was not tested as a server revocation operation.
- Missing image/profile APIs produced visible errors rather than false success. An upload timeout retained the form and allowed retry.

Two recovery checks deliberately substituted responses in the browser: a logout `503`, followed by a retry against the real backend; and an image-upload `422`, followed by selecting the identical file and clearing the error. These prove frontend recovery only, not implementation of an image API. No photo-test campaign was saved. Date values were entered through the native input setter because the automation's date fill did not populate them; physical calendar-picker interaction remains unverified.

Final database readback contained four users with hashed passwords and three campaigns: the initial approved/pending fixtures plus the browser-submitted pending campaign. Both temporary browser tabs were closed. No application warnings or errors were returned by the browser log query; expected rejected API responses were checked separately.

The test runner itself had a cleanup defect: a failed server shutdown could skip container removal. Cleanup now attempts each resource independently, retains the exact container ID/ownership-label guard and reports errors. Seven focused fault-injection checks passed, with an independent read-only recheck. The original browser fixture needed explicit removal after verifying its full ID and run label; other container IDs were unchanged. A fresh browser fixture then started and stopped successfully with Ctrl+C, including automatic removal. No regression fixture remains.

![Campaign saved through the real browser and API](real-api-campaign-submitted.jpg)

### Scope still open

Business/profile/image/owner/engagement/moderation-write/account-management endpoints still need real implementation and browser/database acceptance. Same-origin local tests do not certify cloud CORS, AWS routing, cross-browser behaviour or the final deployment. This is evidence for the checked flows, not a zero-bug guarantee.

New local packages: `infra/dist/causeconnect-demo-0J1huK` and `infra/dist/causeconnect-live-sdrugE`. SHA-256: demo `3c7c6dbe5a9e62290fbd7943cde1893ba28a6f7c11ca40dfc46bdb1624205d6e`; live `798e7647de0ad9d5db51881e3e87b71e5c7ed7f4f98893383d014749cecd62df`. Neither package was uploaded.

## Independent-review fixes — 4 October 2026

The edit form moved focus to another invalid field on every keystroke. Regression tests reproduced the problem before the fix. It now focuses an invalid field only after a failed save, including server validation, and does not steal focus when a photo selection is invalid.

Sign-in links preserve the create/edit/profile destination. Session expiry still clears private page state; the shell now explains the reset and offers sign-in back to that page. It does not carry drafts into another account or automatically retry uncertain writes. The sample API retains latest review feedback on pending resubmissions/unpublished campaigns, matching the read contract, including tabs saved by an older build. Admin version-response diagnostics are no longer hidden behind a generic load error. Photo uploads have a bounded 60-second timeout; ordinary requests retain 15 seconds.

Fresh checks passed:

- 588 frontend tests across 30 files, including the new focus, session warning, return-link, feedback and timeout cases.
- Four routing tests and 15 offline collection checks covering 41 requests; these do not call unfinished APIs.
- Real existing-API regression: 10 backend unit, seven HTTP/MySQL and nine frontend/Express/MySQL tests. The disposable database container was removed; existing databases were not used.
- Chrome sample-mode check: an empty title/description failed validation, then typing a complete title kept focus in the title. Correcting the description and resubmitting returned pending status and retained the previous review note in My campaigns. No Vite error overlay was present; the observed search-analyser console error came from a Chrome extension, not the application.

The guide records the live Jira due date of 17 October separately from the earlier 20 October meeting target. These checks do not certify the pending Stage 3 APIs, final backend deployment, all browsers or zero bugs. The AWS preview needs a separate release update; local checks do not establish that it serves these fixes.
