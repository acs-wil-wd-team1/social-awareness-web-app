# Additional API verification — 13 October 2026

AWT-175 adds photo upload/attachment, owner editing and removal, participation,
business enquiries, review history, unpublishing/removal and account suspension.
It preserves the existing registration, login, posting and approval routes.

## Local checks

- Frontend: 591 tests passed; production build passed.
- Backend: 76 unit checks passed.
- Empty disposable MySQL 8: all 12 migrations applied; 64 HTTP/database checks passed.
- Actual frontend components/services using HTTP and MySQL: 18 checks passed.
- Host/package checks: 27 passed and one opt-in Nginx check skipped in the standard
  runner. The opt-in check, matched-backup/restart and code-rollback checks also
  passed separately in disposable Linux containers.
- Chrome with real Express/MySQL, not sample mode: signed in as an author,
  selected a JPEG, saved a pending campaign, loaded its private photo as its
  owner and as admin, approved it, and loaded the public campaign/photo with
  its dates and type. The database readback confirmed the saved approval and
  expired author session after logout.

The disposable database and uploaded files were removed after the tests. Existing
local/team databases were not used. Synthetic business rows were seeded only in
the disposable fixture; these checks do not implement or certify Kim's profile API.

The run caught and fixed a public-list default-parameter validation error, a
review-receipt timestamp mismatch, and a photo-receipt connection-pool risk.
Concurrent edits, double attachment, rollback, private history, session revocation
and storage capacity errors have focused regression coverage.

## Release gates at the local-check stage

Merge and AWS deployment are separate from this local evidence. Verify the exact
hosted revision, Linux image decoding, migrations, photo persistence, paired
backup, HTTPS and real browser actions after rollout. Record that receipt in the
implementation notes; don't infer it from a build or a sample preview.

GET/PUT `/api/business/me` and the fresh business registration → profile → posting
journey remain Kim's AWT-141/AWT-173 work. The ordinary posting route already supports
an existing owned Business row. Keep its photo and ownership handling when extending it.

Team manuals, independent tester acceptance and the final demonstration remain
separate submission deliverables. These checks are bounded evidence, not a promise
that no defect can ever occur.

## AWS release — 14 October 2026

This release update supersedes the merge/deployment gate above; the 13 October
local results remain historical evidence.

- [PR #19](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/19) is merged into `main`.
- Live frontend and API: [CauseConnect on AWS](https://52.62.2.87).
- Deployed application commit: `ffe3df679e5d8d1dc43c8bd1669b96aed757ad86`.
- Release: `2026-10-13T12-59-21-475Z-ffe3df679e5d` (UTC release timestamp).
- Passed release checks: 591 frontend tests, 76 backend unit tests, 64 real
  HTTP/MySQL checks and 18 actual frontend/API/database checks.
- Acceptance-runner safeguards: 15 local stub checks passed. These test the
  runner, not the production application.
- Production acceptance: eight groups passed using explicitly scoped synthetic
  users 5 and 6 and campaign 3. The synthetic campaign was soft-deleted and the
  report ended with `uncertainWrites: []`.

The opt-in `infra/ec2/acceptance-additional.mjs` run was
`584e36cd893fbaae2ad6`. Its redacted report was read from the terminal; no account
credentials or tokens are stored here. Passed groups:

1. Exact deployed release identity.
2. Synthetic regular accounts and a legitimate admin session.
3. Pending-photo delivery to owner/admin, with guest/other-owner access denied.
4. Approval, public response shape and public photo delivery.
5. Participation join, withdrawal and history.
6. Owner edit returning to pending, stale-version `409`, history, reapproval and unpublish.
7. Safe user listing, suspension, session rejection and reactivation with a fresh login.
8. Scoped campaign soft deletion.

GET and PUT `/api/business/me` still return `404`. Kim's AWT-141/AWT-173 profile
work and fresh business registration → profile → first campaign remain blocked;
existing-profile posting and fixture-backed checks do not replace that journey.

### Hosted browser and backup/restart closeout — 14 October 2026

These checks passed after the eight-group acceptance run above:

- In Chrome on the hosted application, synthetic author 7 registered, logged in,
  selected a JPEG and submitted campaign 4 as pending. Its owner and the admin
  loaded the restricted photo. The admin approved the campaign and loaded its
  review history, then logged out; the signed-out public campaign and photo loaded.
- The clearly labelled **Demo: Community Book Drive** campaign 4 remains as
  sample content. It is not a real community event or a new-business onboarding test.
- SSM command `ccca16b3-91a8-4021-9264-1b6d382d5c84` completed successfully
  with exit code 0. The matched SQL gzip and photo archive passed integrity checks.
  After an explicit API restart, health was OK, the backup and cleanup timers,
  Nginx and MySQL were active, and the upload directory had `0700` permissions.
  The host had 16 GiB free space; campaign 4 remained approved with its photo configured.
- A browser reload after the restart loaded the campaign photo again.

This verifies the observed hosted journey, backup integrity and restart persistence.
It is not a full backup restoration or offsite-recovery test. The full business
browser journey remains blocked on Kim's profile endpoints. Independent tester
acceptance, final manuals and the recording remain separate deliverables. This is
bounded release evidence, not an exhaustive test claim or a guarantee of zero defects.
