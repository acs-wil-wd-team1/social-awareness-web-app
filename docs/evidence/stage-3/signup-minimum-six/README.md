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
is historical, not evidence for this newer minimum. Exact-version AWS deployment
and a fresh hosted six-character signup must be recorded below after execution.

Kim's GET/PUT `/api/business/me` remains absent. Browser business posting for new
and existing owners, and the complete business journey, still await that work.
Independent team testing, manuals/video and full restore/offsite recovery remain
separate deliverables. Passing checks do not establish a bug-free application.
