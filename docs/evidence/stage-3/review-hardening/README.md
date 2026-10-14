# Review fixes — 14 October 2026

Local branch: `fix/stage3-review-hardening`, based on main
`0409d335dc95355d83729d8912f13a9d3dc0ca27`. The deployed application remains
`ffe3df679e5d8d1dc43c8bd1669b96aed757ad86`; no push, merge, AWS change or team
message was performed for this patch. Passing checks are not a zero-defect claim.

## Corrections and verification

The independent Claude report was source-only, not a fresh test run. Codex verified
the relevant source, implemented the fixes and ran the checks below. Signup minimum
and duplicate-insert regression tests failed before the fixes; both new admin-search
boundary tests also failed before its limit was corrected.

| Area | Change |
|---|---|
| ERD and contracts | All 10 tables, new image/audit/deletion/version fields and authenticated enquiry rules; sender contact fields remain explicit validated input. |
| Search | Public/admin inputs cap search at the API's 150 characters; valid input is not silently clipped. |
| Date display | Actual timestamps use the viewer's zone; calendar-only start/end dates stay unchanged. Sydney/Los Angeles regressions check both. |
| Rate limits | Non-JSON HTTP 429 gets wait guidance; structured photo-quota messages remain intact. |
| Registration | New signups require 15 Unicode code points and at most 72 UTF-8 bytes; existing short-password logins still work. Concurrent duplicate email returns 409, not an unexpected 500. |
| Auth usability | Field-linked errors, live announcements, invalid-field focus and an in-flight registration guard. |
| Photos | Default per-owner 20 retained photos/50 MiB; all ledger rows count until actual safe cleanup, including expired/replaced/removed and soft-deleted attached photos. Serialized quota checks do not delete attached files. |
| Photo feedback | Still JPEG/PNG/WebP ≤5,000,000 bytes/16 megapixels, specific decode/type/animation/dimension errors and phone-photo resize instructions. The decoder limit was not raised. |
| Business dependency | Missing profile routes show unavailable states without futile retry/forms. Existing linked-owner inboxes still work independently. |
| Host safeguards | Local Compose loopback binding; known pre-PR19 schema/privacy rollback refusal; daily backup source moves to 16:00 UTC plus jitter and explains whole-API downtime. |
| Local diagnostics | Bounded report-only photo/ledger comparison; no content reads, repairs, deletion, private filenames or secret output. Production targets are refused. |

The new-signup length rule follows
[NIST's single-factor password guidance](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/),
not every NIST requirement or an authentication-provider migration.

## Executed checks

| Command/check | Result |
|---|---|
| `npm --prefix frontend test` | 32 files, 630 tests passed |
| `VITE_DEMO_MODE=false VITE_API_BASE_URL=/api npm --prefix frontend run build` | Explicit live-mode production build passed, 57 modules |
| `npm --prefix frontend run test:real-backend` | 12 migrations; 89 backend units, 73 HTTP/MySQL and 19 frontend/API/MySQL checks passed; all disposable fixtures removed |
| Acceptance-runner/routing Node tests | 19 passed using stubs/local routing, not live AWS |
| Runner input/argument guards | 2 passed; noninteractive browser mode fails before container creation |
| Python host suite with `CAUSECONNECT_NGINX_CONTAINER_TEST=1` | 41 passed, no skips; actual Nginx syntax checked in an isolated no-network container |
| Linux activation/rollback shell harness | Passed in disposable `python:3.12-slim` container with mocked service/health calls |
| Paired-backup/failure-restart shell harness | Passed in disposable Ubuntu container with SQL/service fixtures; no live backup or restoration |
| `git diff --check` | Passed |

### Actual Chrome journey, real local Express/MySQL

Sample mode was disabled. A fresh account was registered with a stored bcrypt hash;
short signup and wrong login were rejected. The 24 MP JPEG was only 140,894 bytes,
so the dimension rejection was independent of the byte limit; the form retained
the draft and gave a resize instruction without a campaign save.

A valid 64×64 JPEG saved in pending campaign #3; owner refresh loaded the persisted
photo and dates. The public route refused the pending record. The disposable admin
approved it; history showed the saved decision in local time. Signed-out public
view loaded the same 64×64 photo and unchanged start/end dates. Logout removed
private access, and database readback showed all three test login sessions expired.

The existing seeded business owner saw the missing-profile message without a setup
form or retry loop. Their inbox loaded an empty page independently. This does not
prove newly registered business onboarding or an enquiry reaching that inbox.

All browser/server/database/photo fixtures were temporary and cleaned up. A
noninteractive browser-runner lifecycle issue observed during setup was also
hardened: browser mode now requires an interactive terminal, and input closure
requests cleanup. A force-kill or Docker outage can still prevent cleanup.

## Remaining gates and risks

- Kim's GET/PUT `/api/business/me` is still absent. Browser business posting is
  blocked even for existing Business rows; direct posting API fixtures are not
  browser journey evidence. Complete fresh registration → profile → posting →
  approval → enquiry → inbox after integration.
- These source/host changes still need publication, exact-commit packaging,
  deployment and fresh hosted acceptance. Local proxy tests do not prove AWS CORS,
  certificate renewal or the changed live backup schedule.
- File creation and database commit still have a crash window. The report is
  detection-only and best-effort; no untracked file is automatically safe to delete.
  Per-owner quotas do not guarantee unlimited shared storage across many accounts.
- The rollback guard covers known PR19 migration/runtime requirements, not arbitrary
  future schema compatibility. Full restore and off-site recovery are unverified.
- Optional token hashing, CSP/HSTS, broader observability/performance work and the
  inherited dependency advisory were not silently introduced into this patch.
- Independent team/cross-browser/accessibility testing, manuals and final video
  remain separate deliverables. The previous review monitor stays paused.
