# Frontend UX checks — 1 October 2026

Local changes based on merged PR #12 (`48aa32a`, merged as `4e24bae`). Not yet pushed or deployed.

## Changes

- Account links are grouped under a keyboard-accessible disclosure. Primary browsing and posting/review actions remain visible.
- The homepage explains the service, offers role-appropriate next actions and uses equal-width campaign cards.
- Login and registration preserve a validated internal return destination.
- Campaign details show a safe HTTP(S) business website when provided.
- Participation history supports withdrawal after a campaign becomes unavailable, without exposing private campaign content. The proposed contract and Postman examples specify the matching server-side rules.
- API integration documentation uses neutral wording and distinguishes implemented routes from pending endpoints.

## Verification

- Frontend: 30 test files, 573 tests passed.
- Production builds: live and sample modes passed.
- Existing backend regression: 10 backend unit, 7 HTTP/MySQL and 9 frontend-to-Express/MySQL integration tests passed. The runner applied all 9 migrations to a disposable MySQL database and removed its test container afterward. Existing project databases were not used.
- CloudFront routing: 4 tests passed.
- Postman collection: 15 offline checks passed across 41 request contracts. This validates the collection, not the availability of proposed APIs.
- Documentation: 75 local Markdown links resolved; `git diff --check` passed.
- Independent source review found no actionable blockers in the navigation, safe auth links or business website changes.

## Browser checks

Chrome sample-mode checks covered:

- Desktop layout, business navigation at 960px and mobile navigation at 320px. The Account panel remained within the mobile viewport and the page had no horizontal overflow.
- Campaign detail → login → registration → login, retaining the campaign destination in both form and header links.
- Join a campaign → owner edits it back to pending → open participation history → withdraw. Private campaign details stayed hidden, withdrawal completed, and no rejoin action appeared for the unavailable campaign.

Screenshots: [desktop homepage](homepage-desktop.jpg) and [withdrawal after a campaign returns to pending](withdrawal-after-pending.jpg).

## Limits

The screenshots and browser lifecycle use labelled sample data. The new Stage 3 participation endpoints still need backend implementation and live integration testing; passing frontend tests does not certify those APIs. The real database suite covers currently implemented routes, with frontend integration exercised in jsdom rather than a cloud browser.

No commit, push, merge, AWS deployment or team database change is part of this pass. The local preview is available at http://127.0.0.1:5180/ while its development server is running.

## Footer follow-up — 1 October 2026

Added Home (`/`) and Campaigns (`/#campaigns`) links and “© 2026 CauseConnect”, retaining the existing name and tagline. The footer stacks on small screens; links have 44px hit areas and visible keyboard focus. No logo, placeholder legal links or social links were added.

Fresh verification: 576 frontend tests passed across 30 files; live and sample builds passed. In-app browser checks confirmed the Campaigns anchor and Home navigation from a campaign detail page, keyboard focus and no horizontal overflow at 320px and 1100px. The temporary viewport override was reset afterward.

Screenshots: [desktop](footer-desktop.jpg), [mobile](footer-mobile.jpg) and [footer detail](footer-detail.jpg). This follow-up remains local only and does not change backend readiness.
