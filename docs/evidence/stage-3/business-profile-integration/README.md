# Business profile integration — 14 October 2026

## Source and deployment status

The `fix/kim-business-profile-integration` branch was used to integrate Kim's
[PR #22](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22).
His original commit is `7dd71049b56782e688f1f30cd0def86babd1375b`, authored by
Kim Lengen Gesite (`Kimlengel0408`). That history is preserved; the integration
repairs do not claim his original contribution as someone else's work.

The repairs resolve four merge conflicts while retaining the current owner,
admin, image and management routes and both campaign-controller aliases. They:

- Add GET/PUT `/api/business/me` using current role/status/session checks and
  transaction locks, with safe concurrent first saves.
- Match existing column limits, trim text, clear optional fields to SQL `NULL`,
  reject credential-bearing websites and return useful field errors.
- Use safe shared errors rather than logging/returning raw SQL or profile data.
- Delegate `POST /api/campaigns/business` to the existing photo-aware campaign
  transaction. The frontend keeps canonical `POST /api/campaigns`.

No new migration or table is required. The existing unique business owner key and
the previously applied campaign/image migrations are reused.

PR #22 was merged at `ab1bef2c1b2e55c401a78543d4034cd2e85d0a2c` after fixes
`7579edb` and `2edd417`. Its merge tree matched the tested head exactly:
`e8dd6eff39d77b1cde0da66683c6017818002f89`.

The same application commit is live at https://52.62.2.87/, release
`2026-10-14T10-17-18-153Z-ab1bef2c1b2e`. HTTPS `/release.json` confirmed that
exact commit and release. SSM `0be9ecab-e4fc-447e-8870-bd02a24cd2ac` returned
Success/0. The verified archive SHA-256 is
`9b53ec13a1f541d8221f0dbfe1496524555f68df69d15f6c710ebd289d05b401`.
The existing server, database credentials, admin account and photos were
preserved. A paired local backup completed; all 12 migrations were already
current. No seeder, new AWS resource or account/security setting was changed.
The [six-character release receipt](../signup-minimum-six/README.md) is historical.

## Checks completed so far

| Check | Result |
|---|---|
| Frontend regression suite | 631 passed |
| Backend unit suite | 106 passed |
| Production frontend build | Passed |
| Business acceptance CLI/response tests | 18 passed using local stubs; not AWS execution |
| All acceptance/runner CLI checks | 35 passed |
| Python host suite | 41 passed, no skips; includes isolated cached-container Nginx syntax, not live host execution |
| Postman offline checks | 15 assertions and 41 request fixtures passed; no API calls |
| Real HTTP/MySQL integration | 87 passed after all 12 migrations on an empty disposable MySQL 8 database |
| Actual React → Express → MySQL | 26 passed with native HTTP and no API mocks |

The real-backend runner removed its own temporary database and photos after
success; existing databases were not touched. The new React journey passed
real registration/login, an initial empty
profile, first save/reload/optional clearing, photo-backed business posting, admin
approval, enquiry submission, private inbox isolation and logout. It does not
manually seed the new owner's Business row or mock requests. Older seeded-business
fixtures remain separate checks, not evidence of fresh onboarding.

## Hosted API acceptance

Two separate fresh HTTP runs passed on the exact deployed release:

- Eight additional-API groups: public photo posting/privacy, approval/public
  photo, participation, owner edit/version conflict, history/unpublish, account
  suspension/reactivation and cleanup. Run `37d81533e9722dafc58b`, users 14/15,
  QA campaign 8 soft-deleted, sessions ended, no remaining dependency or uncertain write.
- Eight business groups: fresh registration and null profiles, normalized
  profile create/read, photo-backed canonical posting, pending/other-owner
  isolation, approval/public business fields, normalized enquiry/private inbox,
  second-business isolation, unpublish/soft-delete/retained history and logout.
  Run `bb2c535ee713df1cda4f`, users 16/17/18, profiles 1/2, QA campaign 9
  soft-deleted, enquiry 1 retained, all four created sessions revoked and no
  uncertain write. No real business profile was overwritten.

Synthetic account/profile/enquiry/audit rows remain for traceability; campaigns
were recoverably soft-deleted. The scripts did not perform SQL cleanup or hard deletion.

## Hosted Chrome journey

Actual Chrome passed a fresh business registration/login, missing-profile
prerequisite, first normalized profile save and refresh, and photo-backed
campaign submission. Campaign 10 showed pending in its owner's account with a
loaded 64 × 64 JPEG. Its signed-out public page was unavailable until the admin
approved it through the real review form; review history and the public business
name, website, dates and 64 × 64 photo then rendered correctly.

A separately registered public account sent an enquiry. The business owner
signed back in and saw the normalized contact/message in their own inbox, still
present after refresh. The owner then soft-deleted only campaign 10. The enquiry
remained with a safe “Campaign unavailable” summary; signed-out public access
failed, and the logged-out inbox required sign-in. All four browser-created
sessions were logged out. The owner reference was 19; two synthetic browser
accounts, their profile/enquiry and audit/history are retained. No other campaign
was approved or removed in this journey.

These developer checks do not replace Meet and Prince's independent acceptance,
the final manuals/video, full restore/offsite recovery, cross-browser/accessibility
testing or a promise of zero defects.
