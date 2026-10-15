# Stage 3 API integration guide

The frontend covers public/business campaign posting, photos, owner editing, participation, business enquiries, admin campaign/account management and automatic campaign refresh. This guide maps those screens to backend routes, validation, database changes and integration checks. The labelled sample preview uses browser data; live mode calls the real endpoints and reports errors when they are unavailable.

The real application is hosted at [CauseConnect on AWS](https://52.62.2.87). Check its [release manifest](https://52.62.2.87/release.json) for the served commit/build; this source guide may describe newer repairs. The [15 October repair receipt](../evidence/stage-3/final-review-2026-10-15/README.md) records the latest source/local checks separately from publication and hosted verification. The [14 October readiness regression](../evidence/stage-3/final-readiness/README.md), its [hosted smoke checks](../evidence/stage-3/final-readiness/hosted-2026-10-14.md) and the preceding [PR #22 full business journey](../evidence/stage-3/business-profile-integration/README.md) retain their actual dated scopes. Independent tester acceptance remains separate.

The tables map each API group to its current code. Linked contracts define the payloads/rules, and `frontend/src/services/` contains the callers. Kim's [PR #22](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22) is merged and deployed after conflict resolution and integration repairs by Unice. GET/PUT `/api/business/me` now supports first setup and later editing; the old missing-profile blocker is removed. Both posting forms keep canonical POST `/api/campaigns`, while the business-only compatibility alias uses that same photo-aware transaction.

## Agreed responsibilities

| Work | Owner |
|---|---|
| All remaining frontend, including user/business posting and admin approval | Unice |
| Frontend and backend cloud deployment using Unice's AWS account | Unice |
| User campaign-posting API | Rajita |
| Business campaign-posting API | Kim |
| Admin campaign-approval API | Kim and Rajita |
| Additional APIs — images, owner management, engagement and admin management (AWT-175) | Unice |
| Business-profile GET/PUT and new-business journey (AWT-141/AWT-173) | Kim; original PR #22 contribution retained |

Use Jira for current dates and review/assignment status. This code reference does not mark a Jira task done or assume Nithya has reviewed the additional work. Existing posting/approval assignments are unchanged.

The older [AWS frontend preview](https://d10e86f5qx46up.cloudfront.net) has separate [dated verification evidence](../evidence/stage-3/frontend-preview/README.md). It uses browser-only data and a **Preview as** selector. Use the live AWS application above for real integration testing; do not confuse sample interactions with saved API/database results. Later local changes still require their own deployment and verification.

The application uses one dedicated admin account with role `admin`. Current source navigation includes **Review campaigns**, with **Manage accounts** under **Account**. An older hosted build may still label that link **Manage users**; both open `/admin/users`. Public registration and account screens do not create or promote administrators; the backend enforces admin access independently.

When a session expires, private page state is cleared and the frontend offers sign-in back to the same page. Unsaved drafts are not carried into another account. If a save was interrupted, check the saved records after signing in before retrying; the browser does not assume the write failed.

## What connects to what

| Frontend page | API calls | Current backend position |
|---|---|---|
| `/campaigns/new` | GET categories, optional POST image, POST campaign | Deployed public POST with optional image upload/attachment |
| `/business/profile` | GET/PUT `/api/business/me` | Merged/deployed; safe current-owner first save/update in the existing Business table |
| `/business/campaigns/new` | GET profile + categories, optional POST image, canonical POST `/api/campaigns` | New/existing owners can set up their profile and post; compatibility POST `/api/campaigns/business` shares the transaction and allows business owners only |
| `/my-campaigns` | GET `/api/campaigns/mine?page=1&pageSize=10&status=pending` | Implemented owner read; omit status for all statuses |
| `/my-campaigns/:id/edit` | GET/PATCH/DELETE `/api/campaigns/mine/:id` | Deployed detail, edit/resubmit and soft-delete |
| Approved cause detail; `/my-participation` | GET/PUT `/api/campaigns/:id/participation`; GET `/api/participations/mine` | Deployed; existing own records stay readable/withdrawable after unpublishing or deletion |
| Approved business detail; `/business/enquiries` | POST `/api/campaigns/:id/enquiries`; GET `/api/business/me/enquiries` | Deployed using existing Lead fields; requires an existing business profile |
| `/admin/campaigns` | GET `/api/campaigns/admin` with page/pageSize/status/search | Deployed expanded read with image and deletion handling |
| `/admin/campaigns/:id` | GET admin detail/reviews; PATCH status/publication; DELETE `/api/campaigns/admin/:id` | Deployed detail/decision, history, unpublish and soft-delete |
| `/admin/users` | GET `/api/admin/users`; PATCH `/api/admin/users/:id/status` | Deployed, including session revocation |
| Home, public detail and My campaigns updates | Repeat their read endpoints while visible/online | No push endpoint required; reads must return current state and respect visibility on every request |

## What remains

1. **Run independent business/browser acceptance.** Profile GET/PUT and posting integration are implemented. The full developer-hosted Chrome journey passed in the [14 October PR #22 receipt](../evidence/stage-3/business-profile-integration/README.md); the subsequent readiness smoke was narrower. Meet and Prince should independently test freshly registered and existing owners through profile setup, photo posting, approval, enquiry/inbox, owner removal and logout protection on the served release. Follow the [profile contract](../api/business-profile-contract.md), record actual browser/device results and do not seed a Business row to bypass onboarding.
2. **Match evidence to the tested build.** Read the live `/release.json`, then use the corresponding hosted receipt. The [15 October repair receipt](../evidence/stage-3/final-review-2026-10-15/README.md) records source regression/build, real-database and bounded browser/reviewer checks; those results alone do not deploy the repairs. The [14 October readiness record](../evidence/stage-3/final-readiness/README.md) and its [hosted receipt](../evidence/stage-3/final-readiness/hosted-2026-10-14.md) retain that release's narrower smoke scope, while the [PR #22 receipt](../evidence/stage-3/business-profile-integration/README.md) retains the earlier full approval/enquiry/inbox journey. Full restoration and offsite recovery remain unverified.
3. **Finish independent testing and submission material.** Use the tested release for cross-role browser checks, visible/online refresh, expired sessions and mobile behaviour. Record results and remaining defects in the testing document; then finish manuals and the video. Developer API checks do not replace Meet and Prince's independent acceptance.
4. **Keep regressions passing for later changes.** Retest authentication, posting, [reads](../api/campaign-read-contract.md), [approval](../api/admin-campaign-moderation-contract.md), images, profiles and ownership; publish/deploy later code separately and verify the served revision.

Reuse the implemented [owner-management](../api/owned-campaign-management-contract.md), [engagement](../api/engagement-contract.md) and [admin-management](../api/admin-management-contract.md) services instead of duplicating their controllers or migrations. Implementation here does not automatically change Jira review or assignment status.

## Request/response examples to use

- Categories: [current implemented contract](../api/campaign-posting-contract.md#category-choices).
- Campaign text fields: [current validation and request](../api/campaign-posting-contract.md#submit-a-public-user-campaign). Add only optional `imageId` for the extension; never require a client `businessId`, creator, type or status.
- Profile getter/upsert: [complete examples](../api/business-profile-contract.md).
- Uploaded reference: [201 upload response](../api/campaign-posting-future-proposal.md#upload-one-campaign-image).
- List/detail shape: [campaign object](../api/campaign-read-contract.md#campaign-object). `campaigns` is the list key. Direct detail object, wrapped creation response, numeric IDs, ISO UTC timestamps and `YYYY-MM-DD` dates.
- Decision body/result: [review action](../api/admin-campaign-moderation-contract.md#review-action).
- Owner editing and version conflicts: [owner management](../api/owned-campaign-management-contract.md).
- Participation and enquiry payloads: [engagement](../api/engagement-contract.md).
- Account status, review history and content removal: [admin management](../api/admin-management-contract.md).
- Errors, exact success codes and hosted origins: [shared conventions](../api/shared-conventions.md).

The examples use illustrative IDs. Fetch real categories and use IDs returned by setup/login/creation. Do not hardcode sample IDs or use category names as `categoryId`.

### Request and success-response quick reference

For protected calls, send `Authorization: Bearer <login token>`. JSON bodies use `Content-Type: application/json`; image upload uses browser-built multipart. IDs are JSON integers, not numeric strings. Every route enforces role/ownership rules on the server. GET/PUT `/api/business/me` below describes the implemented profile endpoints.

| Request | Body or query | Exact success shape |
|---|---|---|
| `GET /api/business/me` | No body | `200 {business: null}` or `200 {business: {id,businessName,abn,website,description}}` |
| `PUT /api/business/me` | `{businessName,abn,website,description}` | `200 {business: <complete saved profile>}` for both create and update |
| `POST /api/campaign-images` | One multipart `file` | `201 {imageId,contentType,sizeBytes,expiresAt}` |
| `POST /api/campaigns` | `{title,description,categoryId,startDate,endDate,targetAudience?,imageId?}` | `201 {campaign: <saved pending campaign>}` |
| `GET /api/campaigns/mine` | `page`, `pageSize`, optional `status` | `200 {campaigns,page,pageSize,total}` |
| `GET /api/campaigns/mine/:id` | No body | `200 <campaign object>` with exact `updatedAt` |
| `PATCH /api/campaigns/mine/:id` | Complete editable form, `expectedUpdatedAt`, optional `imageId` **or** `removeImage:true` | `200 {campaign: <pending campaign with advanced updatedAt>}` |
| `DELETE /api/campaigns/mine/:id` | `{expectedUpdatedAt}` | `204`, no body |
| `PATCH /api/campaigns/admin/:id/status` | `{status,comments?,expectedUpdatedAt}`; status approved/rejected | `200 {campaign:{id,status,updatedAt},review:{id,campaignId,adminId,action,comments,reviewedAt}}` |
| `GET /api/campaigns/admin/:id/reviews` | `page`, `pageSize` | `200 {reviews,page,pageSize,total}` |
| `PATCH /api/campaigns/admin/:id/publication` | `{status:"pending",reason,expectedUpdatedAt}` | `200 {campaign:{id,status:"pending",updatedAt}}` |
| `DELETE /api/campaigns/admin/:id` | `{reason,expectedUpdatedAt}` | `204`, no body |
| `GET /api/admin/users` | `page`, `pageSize`, optional `search`, `status` | `200 {users,page,pageSize,total}` |
| `PATCH /api/admin/users/:id/status` | `{status:"active"}` or `{status:"suspended"}` | `200 {user:{id,name,email,role,status,createdAt}}` |
| `GET /api/campaigns/:id/participation` | No body | `200 {participation:null}` or `200 {participation:{id,campaignId,status,participatedAt}}` |
| `PUT /api/campaigns/:id/participation` | `{status:"joined"}` or `{status:"withdrawn"}` | `200 {participation:{id,campaignId,status,participatedAt}}` |
| `GET /api/participations/mine` | `page`, `pageSize` | `200 {participations,page,pageSize,total}`; each record includes safe `campaign` summary or `null` |
| `POST /api/campaigns/:id/enquiries` | `{name,email,message,phone?}` | `201 {enquiry:{id,campaignId,businessId,name,email,phone,message,createdAt}}` |
| `GET /api/business/me/enquiries` | `page`, `pageSize` | `200 {enquiries,page,pageSize,total}`; each record includes safe `campaign` summary or `null` |

Participation reads and withdrawal check for the current account's existing record before applying campaign visibility restrictions. New joins/rejoins still require an approved, non-deleted cause campaign. An unavailable campaign must not expose its current title, description or moderation data through participation history.

Optional `?` markers in this table explain fields; they are not literal JSON property names. Use the individual contract's full examples, limits, null rules and error codes. The existing public/admin list and detail paths stay unchanged; expand their serializer rather than replacing `campaigns` with `items` or wrapping bare GET details in `campaign`.

## Existing database and code map

| Area | Current source | Implementation position |
|---|---|---|
| Campaign creation | `backend/src/services/campaignSubmission.js`; `controllers/campaigns.js`; `router/campaignRoutes.js` | Public/business posting with optional image reference; transaction for attachment |
| Campaign reads | `services/campaignQueries.js`; `utils/campaignSerializer.js`; `services/campaignServices.js` | Shared serialization, owner scope, latest review, total, visibility-safe image URL |
| Business profile | `services/businessServices.js`; `controllers/business.js`; `router/businessRoutes.js`; `database/models/business.js` | Current-owner GET/PUT implemented with account/session locks and the existing unique owner table; no duplicate migration |
| Campaign decision | `services/campaignModeration.js`; `database/models/campaignReview.js` | Transaction and version checks implemented; existing review table has no automatic timestamps |
| Campaign images | `services/campaignImages.js`; `campaignImageStorage.js`; `database/models/campaignImage.js` | Upload metadata migration, private filesystem storage, controlled delivery and bounded cleanup implemented |
| Categories | `database/models/category.js` | Existing ID/name mapping; GET returns `{categories:[{id,name}]}` |
| Owner editing | `services/ownerCampaignManagement.js` | Owner-only updates, version checks, photo replacement/removal and shared soft deletion implemented |
| Participation | `services/engagement.js`; `database/models/participation.js` | Authenticated reads/state changes, one record per user/campaign, visibility-safe history implemented |
| Business enquiries | `services/engagement.js`; `database/models/lead.js` | Validated API writes and owner-only inbox implemented; incomplete legacy rows retained but omitted from results/count |
| Admin accounts | `services/adminManagement.js`; `database/models/user.js`, `userSession.js` | Safe projection, suspension/reactivation and all-session revocation implemented |
| Content management audit | `database/models/managementAudit.js`; migration `20261013220000-add-campaign-management.js` | Shared soft-deletion metadata and audit-event table implemented; review history retained |

Paths above are relative to `backend/src/` where abbreviated. Create migrations through the repository's Sequelize workflow. Never ask testers to manually create tables or edit campaign statuses. Keep existing seeded campaign image URLs compatible.

Register literal `/categories`, `/mine`, `/mine/:id` and `/admin` routes, including admin action/history routes, before public `/:id`. Register participation/enquiry subroutes explicitly. Return JSON errors for unknown `/api` paths before any SPA fallback.

### Shared implementation to keep

1. **Current-account checks.** Reuse `currentAccountAuthentication.js` and transactional `lockActor` from `campaignManagementSupport.js`. Lock account, matching active session, campaign, then dependent image/participation rows. Never trust stale role claims or sample tokens. Follow the [shared conventions](../api/shared-conventions.md).
2. **One serializer and pagination policy.** `campaignQueries.js` applies visibility/ownership before count and limit; `campaignSerializer.js` supplies numeric IDs, type, business, dates, private feedback and exact `updatedAt`. Public responses exclude review data.
3. **One version migration.** `20261013090000-campaign-updated-at-milliseconds.js` supplies the shared millisecond version. Every owner/admin content change advances it and checks the client's loaded value in the transaction. See [version rules](../api/owned-campaign-management-contract.md#version-checks-and-transactions).
4. **One soft-delete/audit schema.** `20261013220000-add-campaign-management.js` adds `deleted_at`, `deleted_by`, nullable `deletion_reason` and management audit. Both owner/admin removal retain reviews, participation and enquiries. See [admin database work](../api/admin-management-contract.md#database-work).
5. **One upload design.** `20261013221000-create-campaign-images.js` adds shared metadata. Files use a private persistent directory on the existing EC2 server: non-animated 5 MB JPEG/PNG/WebP, 16 MP decoded limit, 24-hour unattached references, five-minute private tickets, 512 MiB total upload limit and 2 GiB free-disk reserve. Each owner may retain 20 photos/50 MiB by default; attached, expired and replacement/removal-pending rows count until safe cleanup actually removes them. Deleting a campaign retains its attached photo and does not reclaim that quota. No new bucket/resource is needed. See [image storage and replacement](../api/campaign-posting-future-proposal.md#replacing-or-removing-an-existing-photo).

Profiles, categories, participations, leads, users, sessions and reviews already exist. Apply the three shared migrations above in filename order; do not recreate the database or duplicate their columns. Legacy Lead rows with a null message or user remain stored but are excluded from inbox results and totals, so incomplete records cannot break the frontend contract.

## Small fixture set

Use an isolated test database with two active public users (A/B), two business owners (one with a profile, one without), an admin, a suspended account and at least two categories. Create pending/approved/rejected campaigns belonging to different owners. Include a rejected campaign with feedback, one valid unattached image, one expired image and an image belonging to the other user.

`frontend/src/demo/demoApi.js` is a convenient frontend response fixture. It is not reusable server authentication or a substitute for database tests. Frontend service/page tests also contain exact accepted and rejected response examples.

## Commands and evidence to return

Run commands from the indicated folder. Use Node.js 22.22.2 or newer within the Node 22 line (the server uses 22.23.2). Keep local database credentials and `JWT_SECRET` in the untracked backend environment file; do not put them into commands shared in a PR or screenshot.

### Ready-made requests and isolated regression

Import the [Postman collection and blank local environment](../api/postman/README.md) to use the documented payloads and response assertions. It covers every call in the quick-reference table plus existing authentication/reads and selected negative checks. Set up disposable fixtures first: requests deliberately have no real credentials or record IDs. Each write must be armed separately. Passing an example request is not a substitute for concurrency, permission and database tests.

The repository also includes a [real-backend regression runner](../../infra/real-backend-testing.md). With Docker running, the official `mysql:8` image cached and both folders' dependencies installed, run from `frontend/`:

```sh
npm run test:real-backend
```

It creates a separate temporary MySQL container, applies migrations, runs backend tests and checks real frontend components/services against Express, then removes its own container/uploads. No project database is reused. The suite covers authentication, posting/reads/moderation, owner/admin management, engagement, images and profiles. The new-owner journey uses actual registration/login/profile APIs; older seeded-business fixtures remain separate isolation checks. The frontend integration uses jsdom, not a full browser. Record results, then execute deployed browser/independent tester checks.

### Backend unit and database tests

From `backend/`, install the locked dependencies and run current unit tests:

```sh
npm ci
npm test
```

The unit suite includes authentication, business profiles, campaign submission/reads/moderation, owner/admin management, engagement and images. Unit success alone does not establish database or deployed-browser correctness.

Before integration tests, configure `DB_HOST` as `localhost`, `127.0.0.1` or `::1`, an existing **separate local** `DB_NAME_TEST` ending in `_test`, the matching local MySQL credentials and `JWT_SECRET`. `DB_NAME_TEST` must differ from `DB_NAME`. Apply migrations to that test database from `backend/`:

```sh
npx sequelize-cli db:migrate --env test
npx sequelize-cli db:migrate:status --env test
```

Run the database suite on macOS/Linux:

```sh
RUN_DB_INTEGRATION=1 NODE_ENV=test npm run test:integration
```

Or in Windows PowerShell:

```powershell
$env:RUN_DB_INTEGRATION = "1"
$env:NODE_ENV = "test"
npm run test:integration
Remove-Item Env:RUN_DB_INTEGRATION
Remove-Item Env:NODE_ENV
```

This suite starts temporary local HTTP servers and creates/removes only its own records. It does not need the normal backend server running or a demo seeder. Integration tests under `backend/test/integration/` cover current and additional APIs with guarded, fixture-scoped cleanup. Do not use shared/cloud data, `sync({force:true})`, database resets or broad truncation to make tests pass.

For the real browser check, start the development backend with the usual development database (not the integration-test environment). After checking the configured development target, from `backend/`:

```sh
npx sequelize-cli db:migrate --env development
npm run dev
```

Leave that terminal running. In another terminal, from `frontend/`, use `VITE_DEMO_MODE=false` and `VITE_API_BASE_URL=/api` in the local environment, then:

```sh
npm ci
npm test
npm run build
npm run dev
```

The development frontend proxies `/api` to `http://127.0.0.1:3000`. Restart it after changing environment settings. The recorded AWS release uses a non-demo build and same-origin HTTPS `/api`; later configuration changes need a rebuild/deployment and their own routing checks.

In each API PR/handoff, include the endpoints implemented, exact migration filenames and order, environment **variable names only**, tests run and their results, and any known limit. Provide one saved request/response example with tokens/private contact data removed. Say which real browser journey passed and which still needs integration; do not call a sample-mode walkthrough a database test.

### If the screen reports an error

| Symptom | Check first |
|---|---|
| New page reports unavailable / `404` | Check the served revision, migrations and router order. The current release includes profile GET/PUT; a pre-profile release may still return `404`. A new owner's absent profile correctly returns `200 {business:null}`. |
| Login appears successful but a protected call fails | Use the actual login token; confirm the matching active session and current database role/status. Sample-role tokens are intentionally invalid in the real backend. |
| Admin detail says its version cannot be read | Add `updatedAt` to the admin detail serializer, preserve milliseconds in MySQL/model, and return canonical UTC text. Do not substitute the current time in the response. |
| Save succeeds in the server log but the UI refuses confirmation | Match the exact HTTP status, envelope, numeric IDs and returned status/version. In particular, DELETE is empty `204`; create is `201`; review/unpublish must return an advanced version. Check saved data before retrying. |
| `409` while editing/reviewing | Another change won. Reload the saved content and explicitly confirm again; do not disable the version check. |
| Photo preview works, but the saved photo does not | Browser preview is local only. Verify the upload request, SQL attachment, safe image URL and storage delivery. A private image URL needs a valid signed URL because an image element cannot send the Bearer header. |
| Deployed page cannot contact a working local API | A hosted browser cannot use the developer's local backend as the team API. Supply the hosted HTTPS origin, matching CORS and a fresh non-demo frontend build. |

Resolve a contract mismatch in one agreed place and update its frontend service/tests and API document together. Do not return invented sample data or skip permission checks just to clear an error message.

## Integration acceptance checks

- Login returns the actual backend role; refresh retains the correct account navigation; logout invalidates the session and protected routes reject the old token.
- Public A's submission is saved pending, appears only in A's My campaigns and authorised admin views, and is absent from public list/detail. Public B cannot see it.
- A new business owner gets `business:null`, saves a profile, then submits against that owner's business. Injected business/creator/status fields are rejected. Profile edits clear optional fields and do not create duplicate rows.
- Category IDs, lengths, date validity/order, wrong JSON types and unknown fields return clear `422` field errors. Dates and numeric IDs retain their documented types in responses.
- Invalid image type/size/decoded data is rejected. Upload ownership, expiry, already-attached references and concurrent reuse are enforced. Campaign-save rollback leaves an unused valid reference available for retry.
- Pending/rejected images cannot be fetched through public stable URLs. Owner/admin signed URLs work as image `src` and expire. Approval exposes only that approved campaign image.
- Admin approval publishes the campaign; rejection keeps it private and shows the owner its reason. Concurrent decisions yield one `200`, one `409`, and one review. A write failure rolls back both status and review.
- An owner edit committed before an admin decision/unpublish/delete invalidates the admin's loaded version. All three actions return `409` for that stale version without changing content or history. The admin reloads and deliberately confirms against the new version.
- Owner A can edit/resubmit or soft-delete A's campaign but cannot change B's. Stale `expectedUpdatedAt` values return `409`; editing approved content removes it publicly until reapproval.
- Participation joins/withdrawals/rejoins do not create duplicate records. Existing own records remain readable and withdrawable after campaign unpublishing or soft deletion; new joins/rejoins are rejected. History returns `campaign:null` for unavailable content and never exposes another user's records.
- Enquiries save the submitted contact/message fields and appear only in the owning business's inbox. Invalid, unavailable and uncertain requests do not produce fake success or automatic duplicate sends.
- Admins cannot suspend themselves or any admin account. Suspension revokes all sessions; reactivation requires a new login. Unpublish/delete actions require reasons and retain audit/history records.
- Public list/detail and owner status refresh reflect API changes, stop polling when hidden/offline and clear inaccessible data. Real permissions still come from the backend, not the polling hook.
- Lists paginate and filter correctly, including empty/past-end pages; changing owner never exposes cached private content. No user/session/password/upload-secret fields leak from joins.
- Dropped connections, timeouts and unreadable responses do not cause the frontend to claim a confirmed save or decision. Retest the real browser flow with `VITE_DEMO_MODE=false`.

Backend completion means these checks pass against MySQL and the chosen image storage. Frontend sample-mode success alone is not that evidence.
