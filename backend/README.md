# CauseConnect backend

Node.js, Express, Sequelize and MySQL. APIs cover authentication, categories, public/business campaign submission, owner/admin reads and campaign approval, plus profiles, photos, owner edits/removal, participation, enquiries and admin account/content management. Application commit `ab1bef2c1b2e55c401a78543d4034cd2e85d0a2c`, release `2026-10-14T10-17-18-153Z-ab1bef2c1b2e`, is deployed at [CauseConnect on AWS](https://52.62.2.87). See the [current release evidence](../docs/evidence/stage-3/business-profile-integration/README.md) for exact verification scope; earlier PR #23/#21 receipts remain historical.

[PR #22](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22) is merged and deployed after conflict resolution and integration repairs. GET/PUT `/api/business/me` uses the current owner's existing Business table, and the business posting compatibility route delegates to the shared photo-aware transaction. No new migration/table was needed. The full hosted API and actual Chrome business journeys passed; independent tester/device acceptance remains separate.

## Prerequisites

- Node.js 22.12+ and npm
- MySQL 8
- Git

## Initial setup

```bash
git pull
cd backend
npm install
```

## Environment file

If you do not already have a local `.env`, copy the example:

```bash
cp .env.example .env
```

Update the values with your local database configuration. Never commit database passwords, tokens or private keys.

## Running the database locally

The `docker-compose.yml` in this folder runs MySQL 8 for local development, not Stage 3 deployment. An existing local MySQL Server works too.

```bash
docker compose up -d
```

This reads `DB_NAME`, `DB_NAME_TEST`, `DB_USER`, `DB_PORT` and `DB_PASSWORD` from `.env`. On first initialization it creates the configured databases. Data persists in a named volume across restarts.

The mapped MySQL port binds to `127.0.0.1` only, so other computers on the network
cannot connect to this local development database. Use `DB_HOST=127.0.0.1` from the
host; `DB_PORT` may still be changed if another local database uses 3306. This
configuration change does not alter a container that is already running. Restart
the project's Compose service when ready; do not delete its volume to change ports.

Check the container is healthy before running migrations or starting the server:

```bash
docker compose ps
```

## Apply migrations and run the development server

Apply repository migrations to the configured development database before starting:

```bash
npx sequelize-cli db:migrate
```

The shared Stage 3 migrations are:

- `20261013090000-campaign-updated-at-milliseconds.js` — saved versions for owner/admin conflict checks
- `20261013220000-add-campaign-management.js` — campaign soft deletion and management audit
- `20261013221000-create-campaign-images.js` — upload ownership, expiry and attachment metadata

Do not recreate existing tables or edit older applied migrations.

```bash
npm run dev
```

## Tests

```sh
npm test
npm run test:integration
```

Unit tests do not need MySQL. The integration suite requires an already-migrated, separate local test database: set `RUN_DB_INTEGRATION=1`, `NODE_ENV=test`, a local `DB_HOST`, and `DB_NAME_TEST` ending in `_test` and different from `DB_NAME`. It also needs your local database credentials and `JWT_SECRET`. It creates and removes only its own test records; do not point it at a shared or production database.

For the disposable MySQL + real frontend/API run, use `npm run test:real-backend` from `frontend/`; see [isolated testing](../infra/real-backend-testing.md). Record actual results. The suite now includes real registration/profile setup for a new business owner; seeded historical fixtures remain separate. jsdom checks are not deployed-browser acceptance.

Current local verification passed 106 backend units, 87 HTTP/MySQL checks, 26 actual frontend/API/database checks and 631 frontend tests. Also passed: 41 local host checks, 35 CLI/stub/routing checks and 15 offline Postman assertions, not live API execution. Exact release identity, eight supporting-API groups, eight business-API journey groups and an actual hosted Chrome business journey passed separately. These layers have different scopes and do not establish exhaustive browser coverage or independent tester acceptance. The [PR #19 receipt](../docs/evidence/stage-3/additional-apis/README.md#aws-release--14-october-2026) preserves its original counts.

## Campaign submission

The [campaign submission contract](../docs/api/campaign-posting-contract.md) lists the endpoints, validation rules and API-to-database field mapping. Public users and business owners (with a business profile) can submit; owners read their own submissions through `GET /api/campaigns/mine`.

## Authentication

The current deployed release requires new signup passwords to contain at least
6 Unicode code points and no more than 72 UTF-8 bytes, without trimming. The
server and registration form share that rule. Existing accounts keep their old
login passwords; this is not a password reset or hash migration. The historical
PR #21 `e612d1b` release used 15 characters. PR #23's six-character minimum is
deployed, with hosted five-/six-character signup and login/logout checks passed.
See the
[authentication contract](../docs/api/current-authentication.md).

## Admin campaign approval

`PATCH /api/campaigns/admin/:id/status` approves or rejects a pending campaign. See the [moderation contract](../docs/api/admin-campaign-moderation-contract.md). Run `npx sequelize-cli db:migrate` after pulling: migration `20261013090000` gives `campaigns.updated_at` millisecond precision for the review version check.

Code layout:

- `src/middleware/currentAccountAuthentication.js` — shared token + session + current role/status guard
- `src/services/campaignQueries.js` — owner/admin list and detail reads
- `src/services/campaignModeration.js` — review validation and the locked, versioned status transaction
- `src/controllers/adminCampaigns.js` — admin HTTP handlers

## Additional APIs

- `src/services/businessServices.js` — current-owner profile reads and transactional first save/update
- `src/services/businessCampaignSubmissions.js` — business-only compatibility alias delegating to the canonical photo-aware transaction
- `src/services/ownerCampaignManagement.js` — owner edit/resubmit and soft-delete
- `src/services/adminManagement.js` — review history, unpublish/delete, account list and suspension/reactivation
- `src/services/engagement.js` — own participation and business enquiries
- `src/services/campaignImages.js` / `campaignImageStorage.js` — image upload, attachment and delivery
- `src/services/campaignManagementSupport.js` — shared account/session locks, version checks and validation

Writes lock/recheck the account and session before campaign and dependent records. Suspension expires all active sessions; reactivation requires a new login. Soft deletion retains reviews, participation and enquiries. Participation can still be withdrawn by its owner when a campaign becomes private/deleted. Legacy Lead rows with a null message or user are retained but excluded from inbox responses and their totals.

Payloads and exact status codes are in the [API integration guide](../docs/handoff/stage3-api-handoff.md).

## Image storage

Images use a private persistent directory on the existing server, not a new S3 bucket. Production requires an absolute `CAMPAIGN_UPLOAD_DIR` outside the checkout/web root, with server-only permissions and backup coverage. Defaults are 512 MiB total uploads and a 2 GiB free-disk reserve (`CAMPAIGN_UPLOAD_MAX_BYTES`, `CAMPAIGN_UPLOAD_MIN_FREE_BYTES`). No new cloud resource is required by this implementation.

Accept one JPEG, PNG or WebP up to 5,000,000 bytes and 16 million decoded pixels.
Larger phone photos must be resized; HEIC/HEIF must be exported in a supported
format. Unattached references expire after 24 hours. The current release uses
default **20 retained photos/50 MiB per owner**: every owner image row counts
until safe cleanup removes its file and metadata, including attached, expired,
replaced/removed and soft-deleted-campaign images. Expiry/removal does not instantly
free the quota. Configure `CAMPAIGN_UPLOAD_OWNER_MAX_PHOTOS` (1–100) and
`CAMPAIGN_UPLOAD_OWNER_MAX_BYTES` (1–268,435,456 bytes); no attached image is purged.
These server-only limits are included in the current release; changing or removing
a campaign photo does not immediately reclaim retained storage.

Private delivery uses five-minute signed tickets and rechecks the current
account/session; approved public delivery rechecks campaign visibility. Cleanup
targets only expired unattached generated files and metadata. Cloud storage,
paired backup integrity and API-restart photo persistence passed the recorded
PR #19 checks; full restoration and offsite recovery were not tested. See the
[image contract](../docs/api/campaign-posting-future-proposal.md),
[deployment preparation](../infra/ec2/host/README.md) and
[current release evidence](../docs/evidence/stage-3/business-profile-integration/README.md).

### Read-only local photo report

For an already-configured local database and upload folder, run from `backend`:

```sh
node scripts/report-campaign-images.js
```

This diagnostic requires a loopback `DB_HOST` and non-production `NODE_ENV`.
It reports totals for missing, untracked, size-mismatched and unsafe entries,
including every retained ledger reference regardless of expiry or campaign status.
It never deletes, repairs or reads photo content, and prints no filenames, private
paths or account details. The scan is bounded to 10,000 rows and directory entries
and is best-effort, not a transactional snapshot. Repeat in a quiet window before
investigating discrepancies: **untracked does not mean disposable**.

The command is intentionally excluded from the production release's script
allowlist. It helps diagnose the file-write/database-commit crash window; it does
not eliminate it or establish backup/restore proof.
