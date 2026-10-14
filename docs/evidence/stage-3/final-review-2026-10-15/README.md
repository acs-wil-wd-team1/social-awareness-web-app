# Final testing and document review — 15 October 2026

## Candidate status

This receipt accompanies the final frontend edge-case repairs and documentation refresh. At the time of these checks, AWS still served application `af5dac741af06240e4885d098379c74c975ad893`, release `2026-10-14T12-12-08-602Z-af5dac741af0`. The new repairs are local candidate work, not yet a hosted result. Publication and the served identity need a separate receipt.

## Reproduced and repaired

- A successful login whose browser-storage write failed could clear the starting session and remount Login without its intended error. The shell now retains a non-secret, same-window notice outside the session-keyed subtree. Dismissal, retry, successful login and intentional logout have regression coverage. Stale/cancelled responses still cannot overwrite a newer account.
- Owner-removal confirmation used a single-line input, so accepted titles containing LF, CR or CRLF could not be confirmed. A multiline confirmation normalizes only line endings; case, spaces and punctuation remain exact. Ownership, saved-version checks and the server's soft-deletion rules are unchanged.
- An independent source reviewer identified a guest-only dismissal variant during repair: the local form could redisplay a dismissed shell error. A failing regression reproduced it, then explicit shell ownership removed the duplicate. Standalone Login still shows its storage error; ordinary API errors are not suppressed just because their message resembles it.

The owner-removal controls also reuse the existing 44-pixel button styling. No backend API, migration, password policy or AWS resource changed.

## Fresh executed checks

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

Claude's earlier reports were source-only. The requested new independent tester/document pass is pending and must not be credited as executed testing until it supplies evidence. Independent team/device/screen-reader acceptance, assigned final manuals/testing document/video, future real TLS renewal and a full/off-site restore remain separate. Passing these checks does not guarantee zero bugs.
