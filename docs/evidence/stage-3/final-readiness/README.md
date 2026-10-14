# 14 October readiness repairs

This follow-up to PR #22 fixes edge cases found during fresh source review and isolated browser/database testing. It does not change the approved six-character signup minimum or add a new authentication provider.

## Repairs

- Ignore cancelled, unmounted and superseded login responses before saving a session.
- Lock registration fields during submission so success corresponds to the submitted identity.
- Require valid website addresses consistently in the profile API, form and public display. Only business name and website are public.
- Return 401 for invalid/expired logout tokens and 503 for an unavailable session store; require an actual 204 for confirmed logout. Preserve newer sessions and retryable failures.
- Load owner photos only when details open; retain working previews across ticket refreshes. Show failed edit previews without removing saved attachments.
- Refresh admin lists on unchanged searches and through explicit refresh controls.
- Improve route titles, focus contrast and wrapping for long campaign/business text; remove stale profile-unavailable wording.

## Executed local checks

| Check | Result |
|---|---|
| Frontend regression | 710 passed across 32 files |
| Backend units | 116 passed |
| Actual HTTP/MySQL | 90 passed |
| Actual frontend API/MySQL | 26 passed |
| Production build | Passed |
| Host checks, including opt-in isolated Nginx | 41 passed, no skips |
| Runner safety and preview routing | 6 passed |
| Hosted acceptance CLI/stub safety tests | 33 passed; no live requests |
| Offline Postman validator | 15 passed; no requests sent |

The database runner applied all 12 migrations in separate disposable MySQL containers. No shared database, real environment file or demo seeder was used.

Actual Chrome/Express/MySQL checks covered six-character business signup, disabled fields during a delayed request, login, profile setup, invalid website focus, valid encoded website/public link, photo posting and approval, stable/lazy owner previews, repeated admin search/refresh and logout. A 150-character unbroken campaign title and business name fit settled 360px and 390px campaign views without horizontal overflow. Fixtures, sessions and uploads were cleaned; temporary browser network/viewport overrides were reset.

## Review and hosting limits

Claude's review was targeted source/CSS/contract inspection, not executed testing or proof that every file was reviewed. Its reported read counts were inconsistent; it excluded some tests and tooling. A separate read-only worker inspected the repair diff and found no concrete release blocker. Executed test results above belong to Codex, not Claude.

The existing server's Certbot renewal dry run, deploy hook and Nginx syntax check passed on 14 October. The renewal timer is enabled. The current real certificate expires on 19 October; a dry run does not prove future renewal.

This local receipt was recorded before publication. The separate [hosted receipt](hosted-2026-10-14.md) records the subsequent deployment and checks. Independent team testing, actual Safari/Windows Edge and screen-reader checks, future certificate renewal and full/offsite recovery remain separate. No zero-bug claim.
