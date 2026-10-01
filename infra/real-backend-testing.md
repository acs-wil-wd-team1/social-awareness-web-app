# Real-backend regression

From `frontend`, run:

```sh
npm run test:real-backend
```

Requires the project's Node version, installed frontend/backend dependencies, a running Docker engine, and the official `mysql:8` image already downloaded. If it is missing, run `docker pull mysql:8` first. The runner does not install dependencies or download images.

Docker must use a local Unix socket or Windows local named pipe. The runner checks the effective Docker endpoint (including `DOCKER_CONTEXT` / `DOCKER_HOST`), rejects TCP/SSH/remote endpoints before starting a container, and pins every Docker operation and cleanup to that checked endpoint.

The runner creates its own randomly named MySQL container, binds it to an ephemeral **127.0.0.1-only** port, generates temporary credentials, applies the repository's migrations, and starts the actual Express application on another loopback port. Database files live in temporary memory storage. It does not read or modify the team's existing database or Docker container, rewrite `.env`, run the demo seed, or alter backend application code. It removes only its own labelled container when finished.

It then runs:

1. Existing backend unit tests.
2. Existing backend HTTP/MySQL integration tests.
3. Opt-in frontend tests with the real registration, login, logout and public campaign form components, the production API client and campaign services, actual HTTP requests, and persisted MySQL assertions.

The third group does not mock `fetch`, API responses, authentication or database methods. It checks registration/password hashing, duplicate email, incorrect and correct login, session storage, category/list/detail parsing, public campaign submission and pending-state privacy, admin read with anonymous (401) and public-user (403) rejection, rejected data, logout revocation, and reuse of a revoked token.

This is **jsdom UI + real API/database testing**, not real-browser verification. It does not prove browser navigation, browser CORS enforcement, AWS routing, or any Stage 3 API that is not implemented yet. Business posting, profile/owner management, uploads, moderation writes, participation, enquiries and user-management APIs still need their own real-backend integration checks when delivered. Existing backend tests include deliberate fault injection to check safe error handling; the frontend real-backend suite does not.

The opt-in files use `.real-backend.jsx`, not `.test.jsx`, so ordinary `npm test` does not start Docker or touch any database. Running the opt-in Vitest configuration directly is rejected unless the isolated runner supplies its safety settings. Do not point this runner at a shared, developer, staging or production database.

If interrupted with a force-kill or the Docker engine stops, automatic cleanup may not finish. Check the exact `causeconnect-regression-<run-id>` name printed by that run and its `causeconnect.regression.run` label before removing that specific test container. Do not delete Docker volumes, images or other containers in bulk.

Verified on 1 October 2026: 9 migrations, 10 backend unit checks, 7 backend HTTP/MySQL checks and 9 real frontend/API/database checks passed. The disposable container was removed. This result covers the existing implemented endpoints, not the unfinished Stage 3 backend.

## Browser checks with an isolated database

From `frontend`, run this in a terminal:

```sh
npm run test:real-backend -- --browser
```

This uses the same local-only Docker checks, empty temporary database and repository migrations. It starts the real Express application and a separate Vite server on unused loopback ports. Vite ignores project `.env` files, disables sample mode, and proxies `/api` to this run's Express server. Your usual development servers stay untouched.

The terminal prints the frontend address and fresh local-only public, business-owner and admin logins. It also creates one approved and one pending campaign. Open the printed address in a browser to check registration, login, public campaign reading, text-only campaign submission, permissions and logout. The browser mode does not run the automated suites; run the original command separately for those results.

Type `inspect` in that terminal for database evidence: user IDs/roles/statuses, whether passwords are hashed, campaign titles/owners/statuses and session states. It never prints password hashes, session tokens or database credentials. These records belong only to this run's disposable database. No arbitrary database or API arguments are accepted.

Press **Ctrl+C** when finished. The runner closes its Vite and Express servers and removes only its own labelled test container. Each cleanup step is attempted even if another fails; any failures are printed and exit unsuccessfully. A container is never removed if its ownership label cannot be verified. Browser data remains in that browser origin until cleared. Do not reuse these disposable credentials for any real account.

This is a same-origin browser check through a local proxy. It does not validate cross-origin cloud CORS configuration or AWS deployment. Missing Stage 3 endpoints are not simulated here: business/profile/image/owner/moderation/participation/enquiry/user-management calls will still need the actual implementation before their complete browser journeys can pass.
