# Stage 3 API integration guide

The frontend covers public/business campaign posting, photos, owner editing, participation, business enquiries, admin campaign/account management and automatic campaign refresh. This guide maps those screens to backend routes, validation, database changes and integration checks. The labelled sample preview uses browser data; live mode calls the real endpoints and reports errors when they are unavailable.

The reviewed `main` baseline, `4e24bae`, includes PR #12 through `48aa32a`: authentication, category lookup, text-only public submission and the frontend/API contracts. The additional endpoints below remain backend work. Extensions must preserve the existing authentication and submission flows.

The tables provide a starting point for each API group. Linked contracts define the payloads and rules, and `frontend/src/services/` contains the corresponding callers. Integration proceeds one complete journey at a time.

## Agreed responsibilities

| Work | Owner |
|---|---|
| All remaining frontend, including user/business posting and admin approval | Unice |
| Frontend and backend cloud deployment using Unice's AWS account | Unice |
| User campaign-posting API | Rajita |
| Business campaign-posting API | Kim |
| Admin campaign-approval API | Kim and Rajita |

**Target: 20 October 2026.** Supporting APIs—images, profiles, owner management, participation, enquiries and admin account management—need coordinated ownership. The table records the agreed assignments; additional endpoint ownership remains to be agreed.

The [AWS frontend preview](https://d10e86f5qx46up.cloudfront.net) uses sample data. **Preview as** switches between roles. The preview does not call a development API, save real accounts or share sample changes between testers. The remaining backend APIs, database/image storage and final cloud integration still need implementation and testing. Local interface changes require a separate deployment before they appear in the hosted preview. See [verification evidence](../evidence/stage-3/frontend-preview/README.md).

The application uses one dedicated admin account with role `admin`. Its primary navigation includes **Review campaigns**, with **Manage users** under **Account**. Public registration and account screens do not create or promote administrators; the backend enforces admin access independently.

## What connects to what

| Frontend page | API calls | Current backend position |
|---|---|---|
| `/campaigns/new` | GET categories, optional POST image, POST campaign | Categories and text-only public POST are merged into `main`; image support pending |
| `/business/profile` | GET/PUT `/api/business/me` | Routes pending; Business table already exists |
| `/business/campaigns/new` | GET profile + categories, optional POST image, POST campaign | Profile and business posting extension pending |
| `/my-campaigns` | GET `/api/campaigns/mine?page=1&pageSize=10&status=pending` | Owner read pending; status parameter omitted for all statuses |
| `/my-campaigns/:id/edit` | GET/PATCH/DELETE `/api/campaigns/mine/:id` | Owner detail, edit/resubmit and soft-delete pending |
| Approved cause detail; `/my-participation` | GET/PUT `/api/campaigns/:id/participation`; GET `/api/participations/mine` | Endpoints pending; join/rejoin require approval, while existing own records remain readable and withdrawable after the campaign becomes unavailable |
| Approved business detail; `/business/enquiries` | POST `/api/campaigns/:id/enquiries`; GET `/api/business/me/enquiries` | Enquiry endpoints pending; existing Lead fields already cover the contract |
| `/admin/campaigns` | GET `/api/campaigns/admin` with page/pageSize/status/search | Existing read; expand its response fields |
| `/admin/campaigns/:id` | GET admin detail/reviews; PATCH status/publication; DELETE `/api/campaigns/admin/:id` | Existing detail; decision/history/unpublish/soft-delete endpoints pending |
| `/admin/users` | GET `/api/admin/users`; PATCH `/api/admin/users/:id/status` | Account list/status changes and session revocation pending |
| Home, public detail and My campaigns updates | Repeat their read endpoints while visible/online | No push endpoint required; reads must return current state and respect visibility on every request |

## Build order

1. **Keep existing authentication and public submission passing.** The roles are exactly `public`, `business_owner`, `admin`. Registration's `accountType: "business"` maps to `business_owner`. Protected routes must load the current active user as well as checking JWT/session. Reuse the current submission checks; do not grant permission from a frontend role or stale JWT alone.
2. **Add business profile GET/PUT.** Query the unique `businesses.owner_id` using the signed-in user. GET missing profile is `200 {"business":null}`. PUT returns `200` for creation and update. Full fields, validation and table mapping: [profile contract](../api/business-profile-contract.md).
3. **Extend campaign POST for business owners.** Reuse the existing text fields and validation. The server selects creator and linked business; derive type from business association. Missing business profile is `409 BUSINESS_PROFILE_REQUIRED`. Both account types create pending rows. [Posting extension](../api/campaign-posting-future-proposal.md#business-posting).
4. **Add My campaigns and update read projections.** Scope owner reads by current user, include all three statuses and latest feedback, and add filtered `total`. Return dates, audience, business summary and type from database fields. Use one serializer with public/owner/admin visibility rules. [Read contract](../api/campaign-read-contract.md).
5. **Add admin decisions.** Admin detail must include canonical ISO-millisecond `updatedAt`. Every decision sends it as `expectedUpdatedAt`; lock and compare it before saving status plus one review. An owner edit after the admin loaded the page must also cause `409`, even if the row is still pending. Return the advanced version with the confirmed status. Rejection needs comments. [Admin contract](../api/admin-campaign-moderation-contract.md).
6. **Add image storage and attachment.** Add the documented upload metadata migration. Upload one multipart `file` privately, return an opaque reference and expiry, then attach it in the campaign-create transaction. Owner/admin image URLs are signed; public delivery requires approval. [Image contract and migration design](../api/campaign-posting-future-proposal.md#upload-one-campaign-image).
7. **Add owner editing/resubmission and soft deletion.** Use the authenticated owner and saved `updatedAt` value, not a client creator ID. An edit returns the campaign to pending; preserve previous reviews. Share deletion metadata with admin management rather than adding duplicate columns. [Owner-management contract](../api/owned-campaign-management-contract.md).
8. **Add participation and business enquiries.** Participation is scoped to the signed-in account. Join/rejoin require an approved cause campaign. An existing own participation record remains readable and withdrawable when its campaign is no longer approved or is soft-deleted; private history returns `campaign:null` for unavailable content. Enquiries target approved business campaigns; only the linked business owner can read the inbox. The existing Participation/Lead tables contain the required fields and participation uniqueness constraint. [Engagement contract](../api/engagement-contract.md).
9. **Add admin account/content management.** Account suspension must revoke active sessions; no changes to any admin account or account roles. Return approval history and record unpublish/soft-delete events without destroying campaign records. These campaign actions also require `expectedUpdatedAt`, checked inside the transaction; unpublish returns the advanced version. [Admin management contract](../api/admin-management-contract.md).
10. **Test the complete journey against the real API, then connect cloud settings.** The frontend API base and CORS origin must match the hosted backend/frontend. Test with sample mode disabled. Record the endpoints/migrations and test evidence in the PR so frontend integration can be checked directly. Exercise the 30-second campaign refresh as well as button-triggered reads; public removal and account suspension must take effect on subsequent requests.

Use the agreed responsibilities above and coordinate ownership of each shared endpoint/model change before implementation, so the user, business and admin flows use the same schema and do not introduce duplicate controllers or migrations.

## Request/response examples to use

- Categories: [current implemented contract](../api/campaign-posting-contract.md#category-choices).
- Campaign text fields: [current validation and request](../api/campaign-posting-contract.md#submit-a-public-user-campaign). Add only optional `imageId` for the extension; never require a client `businessId`, creator, type or status.
- Profile getter/upsert: [complete examples](../api/business-profile-contract.md).
- Uploaded reference: [201 upload response](../api/campaign-posting-future-proposal.md#upload-one-campaign-image).
- List/detail shape: [campaign object](../api/campaign-read-contract.md#campaign-object). `campaigns` is the list key. Direct detail object, wrapped creation response, numeric IDs, ISO UTC timestamps and `YYYY-MM-DD` dates.
- Decision body/result: [review action](../api/admin-campaign-moderation-contract.md#proposed-review-action).
- Owner editing and version conflicts: [owner management](../api/owned-campaign-management-contract.md).
- Participation and enquiry payloads: [engagement](../api/engagement-contract.md).
- Account status, review history and content removal: [admin management](../api/admin-management-contract.md).
- Errors, exact success codes and hosted origins: [shared conventions](../api/shared-conventions.md).

The examples use illustrative IDs. Fetch real categories and use IDs returned by setup/login/creation. Do not hardcode sample IDs or use category names as `categoryId`.

### Request and success-response quick reference

For all protected calls, send `Authorization: Bearer <login token>`. JSON bodies use `Content-Type: application/json`; image upload uses browser-built multipart. IDs are JSON integers, not numeric strings. Every route must still enforce its role/ownership rules on the server.

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

| Area | Current source | Work needed |
|---|---|---|
| Campaign text creation | `backend/src/services/campaignSubmission.js`; `controllers/campaigns.js`; `router/campaignRoutes.js` | Preserve validation; allow current business owner + optional image reference; transaction for attachment |
| Campaign read projection | `backend/src/services/campaignServices.js` | Shared expanded serialization, owner scope, latest review, total, safe image URL |
| Business profile | `database/models/business.js`; migration `20260830103020-create-businesses.js` | Existing unique owner and columns; add service/controller/routes, no duplicate table |
| Campaign decision | `database/models/campaignReview.js`; migration `20260830103050-create-campaign-reviews.js` | Existing decision columns; implement transaction and conflict handling; model has no automatic timestamps |
| Campaign images | Existing `campaigns.image_url`, migration `20260912062417-add-image-url-to-campaigns.js` | Add ownership/expiry/storage/attachment metadata migration; private object storage and cleanup |
| Categories | `database/models/category.js` | Existing ID/name mapping; GET returns `{categories:[{id,name}]}` |
| Owner editing | `database/models/campaign.js` | Owner-only detail/update, optimistic version check, photo replacement/removal and shared soft-deletion metadata |
| Participation | `database/models/participation.js` | Authenticated account/campaign reads and state changes; enforce one participation record per user/campaign |
| Business enquiries | `database/models/lead.js` | Use existing contact/message fields; require complete validated API writes and add owner-only inbox |
| Admin accounts | `database/models/user.js`, `userSession.js` | Safe account projection, suspension/reactivation and all-session revocation |
| Content management audit | No existing management-audit model | Shared soft-deletion migration and audit-event table; retain review history |

Paths above are relative to `backend/src/` where abbreviated. Create migrations through the repository's Sequelize workflow. Never ask testers to manually create tables or edit campaign statuses. Keep existing seeded campaign image URLs compatible.

Register literal `/categories`, `/mine`, `/mine/:id` and `/admin` routes, including admin action/history routes, before public `/:id`. Register participation/enquiry subroutes explicitly. Return JSON errors for unknown `/api` paths before any SPA fallback.

### Shared changes to coordinate first

1. **Current-account authentication.** `campaignAuthorAuthentication.js` already verifies token + matching active session + current database account, but currently permits only `public`. Adapt/reuse that pattern for the allowed roles. Older `authentication.js` only finds an active token and older `adminAuthentication.js` checks the JWT role; that pair does not yet enforce the current database account's role/status or the matching session user ID. Upgrade the shared guards for all protected reads/writes before relying on suspension or admin restrictions. Use the [shared conventions](../api/shared-conventions.md), not a copy of sample-mode authentication.
2. **One serializer and pagination policy.** Public returns approved/non-deleted content, owner returns only their own content, admin returns authorised non-deleted content. Add category/type, business summary, dates, audience, latest private review and safe image URL. Include `updatedAt` on owner/admin detail. Apply filters before count/limit and avoid counting a campaign multiple times when joining review history. Current read services omit these fields and `total`.
3. **One version migration.** Existing `campaigns.updated_at` is declared as `Sequelize.DATE` without fractional precision. Add a new migration to preserve milliseconds (`DATETIME(3)` / Sequelize `DATE(3)`) and matching model configuration; do not edit an already-applied migration. Every owner/admin content change must monotonically advance that version. Compare the exact loaded value inside the same locked transaction. See [version rules](../api/owned-campaign-management-contract.md#version-checks-and-transactions).
4. **One soft-delete/audit schema.** Share `deleted_at`, `deleted_by` and `deletion_reason` between owner/admin removal and use one audit table migration. Owner removal does not submit a reason; keep that column nullable. Update all read/action scopes, and retain reviews/participations/enquiries. See [admin database work](../api/admin-management-contract.md#database-work).
5. **One upload/attachment design.** Share `campaign_images`, storage keys, expiry and ownership checks across public/business create and owner photo replacement. Attach/detach under the campaign transaction, including clearing any legacy image fallback when a photo is removed. Never store signed URLs as permanent campaign fields. See [image storage and replacement](../api/campaign-posting-future-proposal.md#replacing-or-removing-an-existing-photo).

Profiles, categories, participations, leads, users, sessions and review tables already exist. The new schema work is version precision, upload metadata, soft-deletion metadata and management audit—not recreating the database. Keep these shared migrations in one coordinated change sequence so parallel API work can apply them safely.

## Small fixture set

Use an isolated test database with two active public users (A/B), two business owners (one with a profile, one without), an admin, a suspended account and at least two categories. Create pending/approved/rejected campaigns belonging to different owners. Include a rejected campaign with feedback, one valid unattached image, one expired image and an image belonging to the other user.

`frontend/src/demo/demoApi.js` is a convenient frontend response fixture. It is not reusable server authentication or a substitute for database tests. Frontend service/page tests also contain exact accepted and rejected response examples.

## Commands and evidence to return

Run commands from the indicated folder. Node.js 22.12+ is required. Keep local database credentials and `JWT_SECRET` in the untracked backend environment file; do not put them into commands shared in a PR or screenshot.

### Ready-made requests and isolated regression

Import the [Postman collection and blank local environment](../api/postman/README.md) to use the documented payloads and response assertions. It covers every call in the quick-reference table plus existing authentication/reads and selected negative checks. Set up disposable fixtures first: requests deliberately have no real credentials or record IDs. Each write must be armed separately. Passing an example request is not a substitute for concurrency, permission and database tests.

The repository also includes a [real-backend regression runner](../../infra/real-backend-testing.md). With Docker running, the official `mysql:8` image cached and both folders' dependencies installed, run from `frontend/`:

```sh
npm run test:real-backend
```

It creates a separate temporary MySQL container, applies migrations, runs backend tests and checks actual frontend components/services against Express, then removes only its own container. No project database is reused. The current run covers registration, login/logout, categories, public reads and text-only pending submission. It uses jsdom rather than a browser and does not test the unfinished business, image, owner, engagement or moderation APIs. Extend the isolated suite as those endpoints are implemented, then run the real browser journeys below.

### Backend unit and database tests

From `backend/`, install the locked dependencies and run current unit tests:

```sh
npm ci
npm test
```

The current unit suite covers campaign submission validation and the campaign-author guard. Add unit tests for each new service/guard; passing this existing suite alone does not test the new endpoints.

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

This suite starts its own temporary local HTTP server and creates/removes only its test records. It does not need the normal backend server running, and no demo seeder is required for it. Its current tests cover text-only public submission, not all Stage 3 features. Add the new integration tests under `backend/test/integration/`; retain the isolated-database guard and fixture-scoped cleanup. Do not use shared/cloud data, `sync({force:true})`, database resets or broad truncation to make the tests pass.

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

The development frontend proxies `/api` to `http://127.0.0.1:3000`. Restart it after changing environment settings. Connecting the hosted frontend requires a separate non-demo build and deployment with the agreed HTTPS API origin and CORS configuration.

In each API PR/handoff, include the endpoints implemented, exact migration filenames and order, environment **variable names only**, tests run and their results, and any known limit. Provide one saved request/response example with tokens/private contact data removed. Say which real browser journey passed and which still needs integration; do not call a sample-mode walkthrough a database test.

### If the screen reports an error

| Symptom | Check first |
|---|---|
| New page reports unavailable / `404` | Is the exact proposed route registered? An existing `/api/campaigns` response does not prove `/mine`, images or account-management routes exist. Check router order. |
| Login appears successful but a protected call fails | Use the actual login token; confirm the matching active session and current database role/status. Sample-role tokens are intentionally invalid in the real backend. |
| Admin detail says its version cannot be read | Add `updatedAt` to the admin detail serializer, preserve milliseconds in MySQL/model, and return canonical UTC text. Do not substitute the current time in the response. |
| Save succeeds in the server log but the UI refuses confirmation | Match the exact HTTP status, envelope, numeric IDs and returned status/version. In particular, DELETE is empty `204`; create is `201`; review/unpublish must return an advanced version. Check saved data before retrying. |
| `409` while editing/reviewing | Another change won. Reload the saved content and explicitly confirm again; do not disable the version check. |
| Photo preview works, but the saved photo does not | Browser preview is local only. Verify the upload request, SQL attachment, safe image URL and storage delivery. A private image URL needs a valid signed URL because an image element cannot send the Bearer header. |
| Deployed page cannot contact a working local API | A hosted browser cannot use the developer's local backend as the team API. Supply the hosted HTTPS origin, matching CORS and a fresh non-demo frontend build. |

Resolve a contract mismatch in one agreed place and update its frontend service/tests and API document together. Do not return invented sample data or skip permission checks just to clear an error message.

## Ready-to-connect checks

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
