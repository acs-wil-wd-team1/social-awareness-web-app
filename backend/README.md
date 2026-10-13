# CauseConnect backend

Node.js, Express, Sequelize and MySQL. Existing APIs cover authentication, categories, public/business campaign submission, owner/admin reads and campaign approval. The AWT-175 branch adds photos, owner edits/removal, participation, business enquiries and admin account/content management. These additions still need merge, deployment and cloud verification.

GET/PUT `/api/business/me` is still missing and remains Kim's AWT-141/AWT-173 work. Posting against an existing Business row works; a newly registered owner cannot yet complete the profile and first-post journey through the app.

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

For the disposable MySQL + real frontend/API run, use `npm run test:real-backend` from `frontend/`; see [isolated testing](../infra/real-backend-testing.md). Record the actual run results. jsdom checks are not deployed-browser acceptance, and fixture-seeded business profiles do not certify the missing profile API.

## Campaign submission

The [campaign submission contract](../docs/api/campaign-posting-contract.md) lists the endpoints, validation rules and API-to-database field mapping. Public users and business owners (with a business profile) can submit; owners read their own submissions through `GET /api/campaigns/mine`.

## Admin campaign approval

`PATCH /api/campaigns/admin/:id/status` approves or rejects a pending campaign. See the [moderation contract](../docs/api/admin-campaign-moderation-contract.md). Run `npx sequelize-cli db:migrate` after pulling: migration `20261013090000` gives `campaigns.updated_at` millisecond precision for the review version check.

Code layout:

- `src/middleware/currentAccountAuthentication.js` — shared token + session + current role/status guard
- `src/services/campaignQueries.js` — owner/admin list and detail reads
- `src/services/campaignModeration.js` — review validation and the locked, versioned status transaction
- `src/controllers/adminCampaigns.js` — admin HTTP handlers

## Additional APIs

- `src/services/ownerCampaignManagement.js` — owner edit/resubmit and soft-delete
- `src/services/adminManagement.js` — review history, unpublish/delete, account list and suspension/reactivation
- `src/services/engagement.js` — own participation and business enquiries
- `src/services/campaignImages.js` / `campaignImageStorage.js` — image upload, attachment and delivery
- `src/services/campaignManagementSupport.js` — shared account/session locks, version checks and validation

Writes lock/recheck the account and session before campaign and dependent records. Suspension expires all active sessions; reactivation requires a new login. Soft deletion retains reviews, participation and enquiries. Participation can still be withdrawn by its owner when a campaign becomes private/deleted. Legacy Lead rows with a null message or user are retained but excluded from inbox responses and their totals.

Payloads and exact status codes are in the [API integration guide](../docs/handoff/stage3-api-handoff.md).

## Image storage

Images use a private persistent directory on the existing server, not a new S3 bucket. Production requires an absolute `CAMPAIGN_UPLOAD_DIR` outside the checkout/web root, with server-only permissions and backup coverage. Defaults are 512 MiB total uploads and a 2 GiB free-disk reserve (`CAMPAIGN_UPLOAD_MAX_BYTES`, `CAMPAIGN_UPLOAD_MIN_FREE_BYTES`). No new cloud resource is required by this implementation.

Accept one JPEG, PNG or WebP up to 5,000,000 bytes and 16 million decoded pixels. Unattached references expire after 24 hours; an account may hold up to 20 active unattached uploads. Private delivery uses five-minute signed tickets and rechecks the current account/session; approved public delivery rechecks campaign visibility. Cleanup targets only expired unattached generated files and metadata. See the [image contract](../docs/api/campaign-posting-future-proposal.md) and [deployment preparation](../infra/README.md) before enabling storage in the cloud.
