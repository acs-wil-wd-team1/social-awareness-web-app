# Business profile integration — 14 October 2026

## Source and deployment status

The `fix/kim-business-profile-integration` branch integrates Kim's
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

These are source changes, not a deployed business journey. AWS application
`fc9f9594b9f27e70ad5dc0b2d8f1ee1d754e0949`, release
`2026-10-14T09-34-26-691Z-fc9f9594b9f2`, remains the live version and still returns
`404` for profile GET/PUT. See its [dated receipt](../signup-minimum-six/README.md).

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
success; existing databases were not touched. The new React journey passed real registration/login, an initial empty
profile, first save/reload/optional clearing, photo-backed business posting, admin
approval, enquiry submission, private inbox isolation and logout. It does not
manually seed the new owner's Business row or mock requests. Older seeded-business
fixtures remain separate checks, not evidence of fresh onboarding.

## Before recording or final acceptance

Publish and deploy the tested source. Verify the served commit before running hosted
registration → profile → photo campaign → approval → enquiry → inbox, including
second-owner privacy and logout/session rejection. Record actual fixture cleanup
and results; add the release receipt only after those checks finish.

Local/unit/stub results do not establish hosted success, independent team testing,
full recovery, cross-browser/accessibility acceptance or zero defects. The
current manuals and live-site status must not claim this business flow is ready
before that release is verified.
