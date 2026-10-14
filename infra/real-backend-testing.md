# Real-backend regression

From `frontend`, run:

```sh
npm run test:real-backend
```

Requires the project's Node version, installed frontend/backend dependencies, a running Docker engine, and the official `mysql:8` image already downloaded. If it is missing, run `docker pull mysql:8` first. The runner does not install dependencies or download images.

Docker must use a local Unix socket or Windows local named pipe. The runner checks the effective Docker endpoint (including `DOCKER_CONTEXT` / `DOCKER_HOST`), rejects TCP/SSH/remote endpoints before starting a container, and pins every Docker operation and cleanup to that checked endpoint.

The runner creates its own randomly named MySQL container, binds it to an ephemeral **127.0.0.1-only** port, generates temporary credentials, applies migrations, and starts Express on another loopback port. Database files live in temporary memory storage; uploads use a uniquely named temporary directory. It does not modify the team's existing database/container, rewrite `.env`, run the demo seed or alter application code. Cleanup removes only its labelled container and validated upload-fixture directory.

It then runs:

1. Backend unit tests.
2. Backend HTTP/MySQL integration tests, including image storage and the additional owner/admin/engagement routes.
3. Opt-in frontend components/services using the production API client, actual HTTP requests and persisted MySQL assertions.

The third group does not mock `fetch`, API responses, authentication or database methods. It checks registration/password hashing, duplicate email, valid/invalid login, sessions, category/list/detail parsing, pending submission/privacy, admin access and logout. Additional checks cover join/withdraw/rejoin, private participation history, enquiry form → stored lead → owner-only inbox, history after soft deletion, owner version conflicts, approval history, content removal, suspension/reactivation and revoked sessions.

This is **jsdom UI + real API/database testing**, not real-browser verification. It does not prove navigation, browser CORS enforcement or AWS routing. The new-business journey uses the actual registration/login components, GET/PUT `/api/business/me`, profile save/reload and optional-field clearing, photo-backed posting, admin approval, public detail, enquiry and the owning inbox. It registers the owner without manually seeding a Business row; older seeded fixtures remain separate. Profile validation and wrong-role cases also use the real API. Backend tests include deliberate fault injection for safe error handling; frontend real-backend tests do not.

The frontend uses the real API client without network interception. Its jsdom upload bridge supplies real multipart data; it does not fake uploaded bytes or persisted rows. Hosted browser acceptance is a separate run, not an outcome of this runner.

The opt-in files use `.real-backend.jsx`, not `.test.jsx`, so ordinary `npm test` does not start Docker or touch any database. Running the opt-in Vitest configuration directly is rejected unless the isolated runner supplies its safety settings. Do not point this runner at a shared, developer, staging or production database.

If interrupted with a force-kill or the Docker engine stops, automatic cleanup may not finish. Check the exact `causeconnect-regression-<run-id>` name printed by that run and its `causeconnect.regression.run` label before removing that specific test container. Do not delete Docker volumes, images or other containers in bulk.

## Current verification

Application `af5dac741af06240e4885d098379c74c975ad893`, release
`2026-10-14T12-12-08-602Z-af5dac741af0`, was verified live on 15 October.
Its local regression passed **710 frontend tests, 116 backend units, 90
HTTP/MySQL checks and 26 real frontend/API/database checks**, plus the production
build, on 14 October and again locally on 15 October. The disposable database
and upload fixtures were removed. The dated [readiness record](../docs/evidence/stage-3/final-readiness/README.md)
also has 41 host, 39 CLI/stub/routing and 15 offline Postman checks; the latter
groups are not live API calls.

The [14 October hosted receipt](../docs/evidence/stage-3/final-readiness/hosted-2026-10-14.md)
records exact identity, 11 core HTTP groups and actual Chrome
admin/profile/photo/logout smoke checks. The [evidence index](../docs/evidence/stage-3/README.md)
keeps the preceding PR #22 full business journey separate. No new hosted writes
were run on 15 October. Meet/Prince's independent acceptance, device and
accessibility checks, manuals and the final recording remain separate work.

## Historical local verification

On **14 October 2026**, the preceding PR #22 source `ab1bef2` passed
631 frontend tests, 106 backend units, 87 HTTP/MySQL and 26 real
frontend/API/database checks plus build. Its [dated receipt](../docs/evidence/stage-3/business-profile-integration/README.md)
also records eight supporting-API groups, eight business-API groups and the actual
hosted Chrome profile → photo posting/privacy → approval/public details →
enquiry/inbox → owner removal/logout journey. Those full hosted checks were not
repeated in the later readiness smoke pass.

Before the profile integration, on **14 October 2026**, the local `fix/stage3-review-hardening` source passed
**89 backend units, 73 HTTP/MySQL checks and 19 real frontend/API/database checks**
through this disposable runner. The separate frontend suite passed **630 tests**
and the production build passed. This includes signup boundaries, concurrent
duplicate email, retained-photo quotas and a read-only file/ledger report.
Chrome also exercised real local registration/login, oversized-photo feedback,
pending photo submission/privacy, saved-photo refresh, admin approval, public
delivery and logout. At that revision, existing-owner business posting was blocked
on the missing profile lookup; the linked owner's inbox was usable independently.
See the [dated hardening evidence](../docs/evidence/stage-3/review-hardening/README.md).
That source was later merged/deployed through PR #21. Its missing-profile result
is historical, not the current PR #22 behaviour.

On **13 October 2026**, the AWT-175 branch passed **64 backend HTTP/MySQL checks and 18 real frontend/API/database checks**. The separate frontend suite passed **591 tests**. These local results are not merge, deployment or cloud/browser acceptance, and do not include a working business-profile API.

Historical result — verified on 1 October 2026: 9 migrations, 10 backend unit checks, 7 backend HTTP/MySQL checks and 9 real frontend/API/database checks passed. The disposable container was removed. This result covers the endpoints implemented at that time, not the later Stage 3 additions.

## Browser checks with an isolated database

From `frontend`, run this in a terminal:

```sh
npm run test:real-backend -- --browser
```

This uses the same local-only Docker checks, empty temporary database and repository migrations. It starts the real Express application and a separate Vite server on unused loopback ports. Vite ignores project `.env` files, disables sample mode, and proxies `/api` to this run's Express server. Your usual development servers stay untouched.

Browser mode requires an interactive terminal and refuses piped/closed input before starting Docker. Closing the terminal input also triggers fixture cleanup; force-killing the process or stopping Docker can still prevent cleanup. The automated mode does not require a terminal.

The terminal prints the frontend address and fresh local-only public, business-owner and admin logins. It creates an existing business profile plus approved/pending campaign fixtures for existing-owner checks. Open the address to check real authentication, posting, photos, owner edits, participation and admin actions. To check fresh onboarding, register another business owner through the UI, save their initially empty profile and then post. GET/PUT profile uses the real backend, not sample data. Browser mode does not run the automated suites; run the original command separately for those results.

Type `inspect` in that terminal for database evidence: user IDs/roles/statuses, whether passwords are hashed, campaign titles/owners/statuses and session states. It never prints password hashes, session tokens or database credentials. These records belong only to this run's disposable database. No arbitrary database or API arguments are accepted.

Press **Ctrl+C** when finished. The runner closes its Vite and Express servers and removes only its own labelled test container. Each cleanup step is attempted even if another fails; any failures are printed and exit unsuccessfully. A container is never removed if its ownership label cannot be verified. Browser data remains in that browser origin until cleared. Do not reuse these disposable credentials for any real account.

This is a same-origin browser check through a local proxy. It does not validate cloud CORS or AWS deployment. Implemented routes, including business-profile setup, use the real backend. Record the actual journeys exercised rather than treating a page rendering as proof that every action passed; the current hosted Chrome result above does not certify a later local manual run.
