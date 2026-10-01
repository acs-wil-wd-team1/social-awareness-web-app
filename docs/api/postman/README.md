# API request checks for Kim and Rajita

Import `CauseConnect-Stage3.postman_collection.json` and the blank `CauseConnect-local.postman_environment.json` into Postman Desktop. This gives you 41 requests covering all 19 calls in the [handoff](../../handoff/stage3-api-handoff.md), existing authentication/public reads, and selected failure cases.

These are requests and response checks, **not a backend implementation**. Pending endpoints should fail until you implement them. The collection has been checked offline; it has not been run against your API or used to claim that your database, storage or security works.

## Before sending anything

1. Point your backend at a **separate disposable test database**. Apply the repository migrations and create the fixture accounts described in the handoff. Do not use a shared development database, production data or another person's account. The collection cannot inspect or verify your backend's database connection.
2. Select the imported environment. Set its local `baseUrl` to your actual backend port, for example `http://127.0.0.1:3000`. There is no default destination. Only `localhost` and `127.0.0.1` over HTTP with an explicit port are allowed. Do not point that port at a tunnel/proxy to a shared service. Redirects are disabled for every request.
3. Use a current Postman Desktop version that supports [`pm.execution.skipRequest()`](https://learning.postman.com/latest-v-12/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution). The safety scripts use that method to cancel requests. Do not strip the scripts or run this through an older runtime that cannot cancel requests.
4. Enter fixture emails/passwords and any tokens only in your **private local values**. Do not share/sync populated values or export them into GitHub. Password/token variables are marked secret, but masking is not a guarantee that an export is safe.

## Reads first, then one write at a time

`allowWrites` starts as `false`. Public category/list reads can run without credentials. All logins, uploads, creates, edits, participation changes, moderation and logouts count as writes.

To deliberately send one write:

1. Confirm again that the server uses your disposable fixture database.
2. Set `isolatedFixtureAcknowledgement` to exactly `I created a disposable local database` and `allowWrites` to `true`.
3. Copy that request's **complete name** into `armedWriteRequest`.
4. Select the request and send it. The arm is consumed before sending, including failed requests. Rearm separately for the next write.

Do not run the whole collection expecting a setup/cleanup sequence. Unarmed writes are skipped, not passes. Approval/rejection, deletion and suspension must be chosen deliberately. Finish by setting `allowWrites` back to `false` and clearing credentials/tokens. There is no automatic destructive cleanup.

## Fixture values and login

- Provision one active public user, one business owner and the dedicated admin in the disposable database. Fill the matching `publicEmail`/`publicPassword`, `businessEmail`/`businessPassword` and `adminEmail`/`adminPassword` only as needed.
- Login checks the expected role and captures its token/user ID in **run-local variables only**. It never saves a token to the environment or collection. In a selected Collection Runner run, login and subsequent reads can use those values. A standalone Send does not preserve that run-local capture for a later Send; for individual requests, copy the returned token and user ID into the corresponding private local environment values yourself.
- Use real category and campaign IDs from your fixture responses. `categoryId` is captured from the category response within the same run. No campaign/user IDs are hardcoded.
- Set `ownerCampaignId` to the public fixture user's campaign; `adminCampaignId` to the campaign being reviewed; `approvedCauseId` and `approvedBusinessId` to approved fixtures of those types. `pendingCampaignId` must be a real pending row, and `otherOwnerCampaignId` a real row belonging to another account. Using random missing IDs does not prove visibility/ownership checks.
- `targetUserId` is a separate disposable **non-admin** account to suspend/reactivate. Never use your current admin or another teammate's account.
- Owner/admin detail requests capture the exact `updatedAt` into run-local `ownerVersion`/`adminVersion`. For individual Sends, copy it unchanged into the private environment value. Never invent a version. For the stale-edit probe, keep a genuinely older value in `staleVersion`, make a successful change, then send the stale request.
- The dates default to seven/eight days after the run date. Set run/environment `startDate` and `endDate` if a different valid fixture is needed.
- Upload has **no file selected**. Choose one disposable local JPEG, PNG or WebP (at most 5,000,000 bytes). Capture the returned `imageId`; it is an opaque string, not a numeric ID. Never put a personal image, signed download URL or machine-specific file path into the committed collection.

## Suggested implementation checks

1. Keep current login/logout, categories and text-only public submission passing. Existing-core reads are separate from the stricter Stage 3 read targets.
2. Implement profile GET/PUT and business posting. Verify server-selected ownership and a pending creation response.
3. Implement owner reads/editing and admin decisions. Load a current version before each change; check returned versions advance. Reread the public detail to confirm pending content is hidden and approved content is public.
4. Implement image upload/attachment, participation, enquiries and admin management using the linked contracts. Choose those requests individually as each endpoint becomes available.
5. Run selected negative probes. Their shared error format is the **Stage 3 target**; older middleware may fail until normalised. A green HTTP response is not enough: the tests check status, JSON envelope, field types, IDs, state and versions.

The tests deliberately do not treat a missing endpoint, wrong wrapper, mismatched ID, HTML response or malformed successful response as success. Responses are captured only after their assertions pass. Follow up logout/suspension with a protected request using the old token and verify rejection; reactivation must require a fresh login.

## What still needs real backend/browser tests

This is not exhaustive. SQL persistence/rollback, concurrent writes, all-session revocation, cross-account visibility, private image access/expiry/cleanup, CORS, browser state, refresh, uploads and final AWS integration must be tested with the real implementation. Postman is not a browser and cannot prove CORS works. An empty successful list cannot prove that row-level permissions are correct. Record failures honestly and rerun with meaningful fixtures.

Offline collection checks (no server or database calls):

```sh
node docs/api/postman/validate-collection.mjs
```

For payload limits, migrations, transactions and the implementation order, use the [full handoff](../../handoff/stage3-api-handoff.md) and the contracts in the parent folder. Do not replace those acceptance tests with this collection alone.
