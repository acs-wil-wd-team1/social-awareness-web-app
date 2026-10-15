# Final testing and document review — 15 October 2026

## Current publication

Tested application `ad94ecb4348458803673c9ef3737fd0b48938d66` is now deployed. The [separate hosted receipt](hosted.md) records its verified release, core HTTP checks and actual Chrome smoke scope. Earlier sections below preserve the preparation/testing sequence, not a claim that every intermediate candidate was deployed.

## Initial predeployment boundary

This receipt accompanies the final frontend edge-case repairs and documentation refresh. At the time of these checks, AWS still served application `af5dac741af06240e4885d098379c74c975ad893`, release `2026-10-14T12-12-08-602Z-af5dac741af0`. The new repairs are local candidate work, not yet a hosted result. Publication and the served identity need a separate receipt.

## Reproduced and repaired

- A successful login whose browser-storage write failed could clear the starting session and remount Login without its intended error. The shell now retains a non-secret, same-window notice outside the session-keyed subtree. Dismissal, retry, successful login and intentional logout have regression coverage. Stale/cancelled responses still cannot overwrite a newer account.
- Owner-removal confirmation used a single-line input, so accepted titles containing LF, CR or CRLF could not be confirmed. A multiline confirmation normalizes only line endings; case, spaces and punctuation remain exact. Ownership, saved-version checks and the server's soft-deletion rules are unchanged.
- An independent source reviewer identified a guest-only dismissal variant during repair: the local form could redisplay a dismissed shell error. A failing regression reproduced it, then explicit shell ownership removed the duplicate. Standalone Login still shows its storage error; ordinary API errors are not suppressed just because their message resembles it.

The owner-removal controls also reuse the existing 44-pixel button styling. The final delta adds explicit exact-title mismatch guidance, focuses the confirmation field when opened, restores the trigger after Cancel, and gives notice dismissal a stable Login-email/main focus target. The admin menu now uses the page's existing **Manage accounts** wording. No backend API, migration, password policy or AWS resource changed.

## First repair candidate — executed checks

| Layer | Result and scope |
|---|---|
| Frontend | 721 passed in 32 files; includes 11 additional regressions over the 710-test baseline. |
| Backend units | 116 passed; no failed, skipped or cancelled cases. |
| Actual HTTP/MySQL | 90 passed in the migrated disposable database. |
| Actual frontend/API/MySQL | 26 passed; jsdom components and native HTTP against Express/MySQL, not a full browser. |
| Build | Vite production build passed; `index-BORgFs2R.js`, `index-B4f_CvAQ.css`. |
| Independent source recheck | Storage-notice dismissal, stale-session guards and exact multiline confirmation reviewed; no further material defect identified in that bounded diff. This was not another test execution. |

The full-stack runner used owned run `3562976f85df`, all twelve migrations, a cached official MySQL 8 image, loopback binding and temporary uploads. It removed its own container/fixtures successfully; existing databases were untouched.

## Actual Chrome journey — local, not AWS

Disposable browser run `572386424cdb` used the actual React/Vite frontend, Express API and migrated MySQL, with no API mocks or sample mode. The admin and initial public/business accounts were fixture-seeded; a separate fresh business account was registered through the browser.

Executed:

1. Fresh business registration → Continue to login → real login and business navigation.
2. Posting prerequisite → first profile save → reload → persisted business identity.
3. Supported PNG upload → pending campaign #3 → owner details and loaded private photo.
4. Signed-out public link denial → fixture admin inspection → explicit approval confirmation/history.
5. Signed-out public details/photo, business name/website and calendar dates.
6. Community login through `returnTo` → harmless enquiry → receiving owner inbox and explicit refresh.
7. An isolated API probe changed #3 to a CRLF title using its current version; the saved edit returned it to pending. Chrome accepted the corresponding LF title in the new multiline confirmation and completed removal.
8. The owner inbox retained the enquiry with a safe “Campaign unavailable” summary and no public link.

Native segmented date entry was used after the browser-control fill method did not populate the date inputs. This was an automation-input correction, not an application date failure. A development hot reload during the early journey reset the unsaved page UI; saved data remained and was checked through My campaigns.

Storage write failures and LF/CR/CRLF variants were reproduced in component/session regressions. Only CRLF-to-LF removal was additionally exercised in actual Chrome; a real browser storage-policy failure was not induced.

## Documentation and review limits

The existing implementation reference was rewritten for accounts, role/state journeys, twenty independent tester checks with expected results, user-manual screenshots, developer paths/API/schema/configuration/recovery and two recording sequences. Exact routes, limits, ten application tables and twelve migrations were checked against source. Restricted team credentials are excluded from GitHub, the local reference and the Claude packet.

### Claude's completed independent pass on `efb13b7`

Claude reported no P1/P2 release-blocking findings in that snapshot. Its report supplied execution evidence for 116 backend tests and a production build in its disposable cloud workspace. The text-only review packet intentionally omitted the logo PNG: 720 of 721 frontend checks passed initially, and the 75-test App file passed after Claude added a synthetic logo to its copy. This is a packet-asset limitation, not a claim that the original full suite was rerun with the actual logo.

Claude also executed 31 Chromium checks plus a focus check against its cloud build with **all API requests stubbed**. These covered storage failures, account changes, multiline exact-title confirmation, four-page narrow/wide overflow and the skip link. It did not connect to the Mac fixture, use actual MySQL or touch the hosted site. Its workspace Node 22.22.0 was below jsdom's supported Node 22 minimum of 22.22.2; the root's runs used 22.23.2.

New low-severity findings were an unclear exact-title mismatch after an extra Enter, focus falling to the page body after dismissing/opening/cancelling controls, and inconsistent Manage users/Manage accounts labels. These are being repaired rather than relabelled as passing. Its suggested missing-placeholder finding was checked against the actual tracked tree: `frontend/public/campaign-placeholder.svg` exists at `efb13b7` and was excluded only by the packet's text extension allowlist.

The implementation-reference routes, limits, tables, migrations, timers and quota were source-checked by Claude. Its wording/prerequisite corrections are included in the reference refresh. Assigned final manuals/testing document/video still belong to their team owners.

### Follow-up auth regression

After that packet was frozen, the root requested and reproduced an additional pending-login race: queued login then logout events from another tab could leave the final token equal to the starting guest token, so an older successful response could restore the stale session. Relevant cross-tab token/clear events now invalidate and abort an in-flight request independently of the final token value. Permanent regressions cover queued login/logout, unrelated/sessionStorage events and a StrictMode retry whose older response/finally must not save or unlock the newer attempt. A separate read-only diff reviewer found no material defect in this bounded repair; that review did not execute tests.

The root reran 724 frontend checks and a production build (`index-CUJXWEup.js`, `index-B4f_CvAQ.css`), plus the actual full-stack runner under owned run `3508ce7baa09`: 116 backend units, 90 HTTP/MySQL and 26 frontend/API/MySQL checks passed. The disposable database and uploads were removed. These results precede the small usability corrections above and must not be counted as a later final candidate execution.

Independent team/device/screen-reader acceptance, future real TLS renewal and a full/off-site restore remain separate. Passing these checks does not guarantee zero bugs.

## Final delta — independent root rerun

After all auth and usability corrections, the root executed **729 frontend tests in 32 files**, **116 backend units**, **90 actual HTTP/MySQL checks** and **26 actual frontend/API/MySQL checks**, all passing. The production build passed with `index-BUsr551M.js` and `index-B4f_CvAQ.css`. Full-stack run `e44413edb9fe` migrated the empty owned database and removed its container/uploads after completion.

Five new focused tests were first observed failing before the usability repair and then passing: opening the removal field, Cancel focus restoration, exact-title mismatch guidance, Login-email notice-dismiss focus and another route's main focus. Root actual Chrome additionally opened fixture campaign #2's removal panel, verified focused textarea, entered a deliberately extra final line, observed disabled confirmation plus the associated mismatch status, and cancelled back to the focused Remove campaign button. No campaign was removed in this check, and the fixture session was logged out.

This delta follows Claude's first-candidate report above. Its final targeted review is a separate pending step; do not attribute these root-run counts or real database checks to Claude.

## Durable generation follow-up

The next independently executed regression deferred receiving storage notifications until **after** the pending network response. At `1197958`, an app-managed login/logout cycle still restored the older account and redirected: four assertions failed before repair. Event delivery alone was therefore insufficient. Storage notifications use a different task source from networking; their relative arrival cannot be assumed ([HTML storage](https://html.spec.whatwg.org/multipage/webstorage.html#the-storage-interface), [Fetch task scheduling](https://fetch.spec.whatwg.org/#queue-a-fetch-task)).

Session writes/clears now rotate a non-secret persisted UUID generation, retained after logout. Login captures/initializes it before requesting the API and compares it without initialization before committing a response. A missing, changed or unreadable marker invalidates completion. The existing storage-event/version/abort guards remain. Failed writes attempt to remove the old marker; logout stays best-effort/nonthrowing, and own preflight/commit storage failures retain their shell or standalone feedback. No token/user API shape or backend/session/password policy changes.

The final root rerun passed **740 frontend tests in 32 files**, **116 backend units**, **90 HTTP/MySQL** and **26 frontend/API/MySQL** checks, plus build (`index-BI1RZF7h.js`, `index-B4f_CvAQ.css`). Owned full-stack run `27879283b147` removed its database/uploads. A separate read-only reviewer found no additional material defect in the four-file generation delta; it did not run tests. Actual Chrome additionally passed fixture-admin login, the consistent Manage accounts navigation, private-page reload and confirmed server logout after the new guard.

This closes the reproduced completed-before-check ABA sequence. It does **not** claim an atomic cross-tab check-and-write transaction, guaranteed marker invalidation when storage blocks both replacement and removal, or zero bugs. The broader browser/device/screen-reader/team acceptance limits above remain.

## Final independent Claude report

Claude's final report reviewed exact `ad94ecb`, verified 290 packet checksums, executed 164 focused auth/session/App checks, all 740 frontend checks and the production build, and found no further material issue. Its build assets matched the root's. Backend tests were not rerun in that last pass; its preceding v2 execution passed 116.

In actual cloud Chromium with **mocked APIs**, Claude drove the app's Login/Logout pages in another tab while delaying a pending response and receiving storage notifications by three seconds. It independently reproduced stale login on v2 and blocked it on v3, with both normal and delayed notifications. A blocked marker write sent zero login requests, displayed one shell notice and allowed a successful retry. The earlier 55 cloud-browser assertions reran: 54 passed; the only miss was an optional cancellation message disappearing during a session-keyed remount. Cancellation itself succeeded, and neither the contract nor the reference promises persistence of that message. It is retained as a low-severity usability observation, not silently counted as passed.

Claude did not connect to the Mac fixture, use actual MySQL, test the public AWS site, Safari/Edge or screen readers, or induce a browser's real storage-block setting. Its cloud Node 22.22.0 remained below jsdom's stated minimum; the root's supported Node 22.23.2 run independently passed. The v3 packet cover still says V2 and its frozen reference has the older CRLF/LF wording; the source pin/checksums are correct, and the canonical/published reference uses CR, LF and CRLF. Original packets and report evidence were not rewritten.
