# Hosted verification — 15 October 2026

## Served application

- Site: https://52.62.2.87/
- Application: `ad94ecb4348458803673c9ef3737fd0b48938d66`
- Release: `2026-10-15T00-26-47-291Z-ad94ecb43484`
- Assets: `index-BI1RZF7h.js`, `index-B4f_CvAQ.css`
- Existing Sydney instance: `i-0952a02ec4246a879`
- Single SSM command: `8abf6512-097c-46aa-b4d8-fb923b1c5c76`, Success / response code 0

The reviewed source was pushed to main under the user's approved rule bypass. No branch-protection setting was changed. The exact 113-file archive was verified locally and on the host before activation. Archive SHA256: `15012603f4a9e538b5c689234e482d057409ce0e40d79d7ea5f3b4331a4870b3`.

Deployment retained existing credentials, database, accounts and persistent photos, took the paired SQL/photo backup and retained the newest seven local snapshots. No migration was pending. Native JPEG/PNG/WebP readiness, database/categories/hashing and local API health passed. API, MySQL, Nginx, backup, image-cleanup and certificate timers were active. No new AWS resource, permission or certificate change occurred.

## Fresh hosted checks

The exact served manifest and JavaScript bundle were independently read after SSM completion. The opt-in live runner passed all **11 core HTTP groups**, including real registration, duplicate/admin-signup rejection, login validation, safe parser errors, owner-only pending submission, public privacy and server logout invalidation.

Owned QA run: `298842a1dd4beadd1721`, users 24/25, pending campaign13. Remaining sessions were revoked. No approval, publication or deletion was sent; the labelled private records remain for controlled readback. Do not approve this internal QA campaign or use it as a demonstration fixture.

Actual hosted Chrome passed:

1. Reload into the expected bundle; team logo, copyright-only footer and no sample banner.
2. Existing team-admin login, Account → Manage accounts, loaded private results and page reload.
3. Private admin readback of only the new pending campaign13, expected author24 and no review history; no decision sent.
4. Confirmed server logout and direct private-page sign-in protection.
5. Existing approved demonstration campaign4 and its public photo loaded without a warning.
6. Home/details at 390px: no horizontal overflow, logo loaded, live mode retained. The temporary viewport was reset.

No account was suspended, no retained demonstration was edited/deleted, and no review decision was made during this hosted smoke pass. The new owner-removal focus/exact-title/storage-failure logic has component/cloud-browser and real local-fixture evidence in the [source receipt](README.md), not a new hosted destructive-action test.

## Limits and remaining acceptance

The full hosted business approval/enquiry/inbox journey remains the dated [14 October PR #22 execution](../business-profile-integration/README.md). This narrower current-release smoke does not relabel it as repeated today. Backend/API code was unchanged in this frontend repair release.

Independent testers still need their own cross-role/device results, and the assigned manuals/video remain team deliverables. Future real certificate renewal, screen-reader/Safari/Edge coverage and a full/off-site restore are not certified. Passing the scoped checks is not a zero-bug guarantee.
