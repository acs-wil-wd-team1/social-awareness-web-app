# Review fixes — 14 October 2026

The fixes were developed on `fix/stage3-review-hardening`, based on main
`0409d335dc95355d83729d8912f13a9d3dc0ca27`. They are now merged in
[PR #21](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/21)
and deployed as `e612d1b448a31cd6639f161740c31a9e22f63ed6`. The initial local
checks below and the later hosted checks are separate evidence. Passing checks
are not a zero-defect claim. No WhatsApp message was sent.

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
| Postman offline checks | 15 check groups passed for 41 request fixtures; no live request execution is claimed from this check |
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

## Publication and AWS checks — 14 October 2026

- Application commit: `e612d1b448a31cd6639f161740c31a9e22f63ed6`.
- Release: `2026-10-14T08-35-53-193Z-e612d1b448a3`.
- Archive SHA-256: `527a84089830eba8fd1de67a236193c31fadbf85704e10a1c25a35ce520c95a2`.
- The main merge tree matched the tested source tree. Archive/directory manifest
  verification passed, then the existing host was updated and that release was
  activated. Existing database credentials, uploads and admin account were retained.
  The database already had all 12 migrations; no seeder or new migration was run.
- Public HTTPS `/release.json` returned that exact commit/release in live mode.
  App, MySQL, Nginx and both backup/cleanup timers were active. Uploads remained
  mode 0700; free storage was over 15 GiB.
- The actual backup timer showed `16:00:00 UTC`, 30-minute jitter and the next
  trigger `14 October 2026 16:03:09 UTC`. The deployment completed a paired
  SQL/photo snapshot and restarted the API. This is not full-restore proof.

`acceptance-additional.mjs` passed all eight hosted groups against this exact
commit: sessions; photo-backed pending submission/private delivery; approval and
public data/photo; participation/withdrawal; edit/version conflicts and retained
reviews; reversible unpublish; synthetic account suspension/reactivation; cleanup.
Run `5b076d6d1e2aa8d34805` used synthetic accounts #8/#9. Campaign #5 was
soft-deleted, every created session was ended and no uncertain writes remained.
Account/audit/history rows are intentionally retained.

Actual Chrome, without sample mode, then verified:

- A 14-character signup was rejected with invalid-field focus and linked feedback;
  an exact 15-character signup succeeded. Wrong login was rejected, valid login
  worked, and public/admin searches retained all 150 characters.
- A 24 MP JPEG of only 140,894 bytes received resizing guidance and left the
  campaign draft intact. A 293-byte 64×64 JPEG then saved with pending campaign #6.
  Owner reload still displayed the photo and unchanged 18/19 October calendar dates.
- Signed-out public access refused the pending campaign. The dedicated admin
  approved only that labelled QA record; its review history showed the saved
  decision in browser local time. Signed-out public view decoded the same 64×64
  photo and displayed the original dates.
- The owner removed campaign #6 through the confirmed soft-delete flow; all three
  successful browser sessions were logged out. Reopening owner management required
  login. Synthetic account #10 and audit/history rows remain; no real account or
  demonstration campaign was changed.

The API acceptance read `/api/business/me` and received the known 404. The earlier
local existing-owner inbox check remains local evidence; this hosted run did not
exercise new business onboarding or the complete enquiry-to-inbox journey.

## Remaining gates and risks

- Kim's GET/PUT `/api/business/me` is still absent. Browser business posting is
  blocked even for existing Business rows; direct posting API fixtures are not
  browser journey evidence. Complete fresh registration → profile → posting →
  approval → enquiry → inbox after integration.
- The new source is published and its hosted checks passed. Same-origin HTTPS is
  verified, but an actual future certificate renewal and independent team testing
  are not established by this deployment.
- File creation and database commit still have a crash window. The report is
  detection-only and best-effort; no untracked file is automatically safe to delete.
  Per-owner quotas do not guarantee unlimited shared storage across many accounts.
- The rollback guard covers known PR19 migration/runtime requirements, not arbitrary
  future schema compatibility. Full restore and off-site recovery are unverified.
- Optional token hashing, CSP/HSTS, broader observability/performance work and the
  inherited dependency advisory were not silently introduced into this patch.
- Independent team/cross-browser/accessibility testing, manuals and final video
  remain separate deliverables. The previous review monitor stays paused.
