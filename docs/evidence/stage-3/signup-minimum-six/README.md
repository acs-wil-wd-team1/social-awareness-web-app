# Six-character signup minimum — 14 October 2026

The assessment signup minimum is changed from 15 to **6 Unicode code points** at
the owner's request and explicit approval for the public assessment site. Longer
unique passwords are safer; this setting is not a security-certification claim.

Only the registration minimum and its form help/errors change. Nonempty input,
exact password preservation, 72 UTF-8-byte maximum, bcrypt hashing, existing
account logins, session checks and the host's login rate limits are unchanged.
No schema migration, seeder, account reset or new AWS resource is needed.

## Local checks

- Updated boundary tests failed on the previous 15-character source: four frontend
  cases and the backend minimum-boundary group. They passed after the change.
- 631 frontend tests across 32 files passed.
- The disposable MySQL runner applied all 12 migrations: 89 backend units,
  73 real HTTP/MySQL checks and 20 real frontend/API/MySQL checks passed.
- ASCII and emoji passwords with five code points are rejected; exactly six
  are accepted. Maximum-byte tests remain. The actual frontend/API/database test
  created an exact-six-character account and verified its bcrypt hash.
- Existing three-character-password login remained valid in isolated integration;
  this does not create a new short-password policy for registration.
- The runner removed its own container and temporary storage. Existing local
  databases and application credentials were not changed.

The [PR #21 review-fix receipt](../review-hardening/README.md) records the earlier
`e612d1b` deployment and its actual 15-character hosted signup check. That result
is historical, not evidence for this newer minimum.

## AWS release and hosted checks

[PR #23](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/23)
is merged. Application commit `fc9f9594b9f27e70ad5dc0b2d8f1ee1d754e0949` is live
as release `2026-10-14T09-34-26-691Z-fc9f9594b9f2`. The merge tree matched the
tested source. The explicit live-mode build and archive manifest verification
passed. Archive SHA-256 is
`08810219c92b89772d13af1d2e1b5d91b3973cbf731e38883e8fcda54fab18fd`.

The existing host update/deployment succeeded; public HTTPS `/release.json`
confirmed this exact version in live mode. A paired SQL/photo snapshot completed;
no pending migrations existed and no seeder or credential change ran. App,
MySQL, Nginx and the existing backup/cleanup timers were active.

All eight fresh hosted API acceptance groups passed on this exact release. Run
`993fbb3439c0fdf257fd` used synthetic accounts #11/#12 and campaign #7. That
campaign was soft-deleted, all created sessions ended and no uncertain writes
remained. The run covered sessions, pending-photo privacy, approval/public photo,
participation, owner edit/version conflicts, reviews, unpublish and synthetic
account suspension/reactivation. It read the unavailable business-profile route
without creating a business; that returned the known 404.

Actual Chrome then rejected five characters with focused/linked feedback,
accepted an exact-six-character signup, logged that account in and logged it out.
The synthetic browser account is retained; its password is not recorded here.
The earlier PR #21 photo browser checks remain earlier evidence, not a claim that
all browser journeys were repeated after this password-only change.

Kim has submitted those profile endpoints in PR #22. It is not yet merged or
deployed; branch conflicts and integration corrections remain under review.
GET/PUT `/api/business/me` is still absent from this live release. Browser business
posting for new and existing owners, and the complete business journey, await
the reviewed integration.
Independent team testing, manuals/video and full restore/offsite recovery remain
separate deliverables. Passing checks do not establish a bug-free application.
