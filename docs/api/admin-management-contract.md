# Admin account and campaign management

**Status:** The frontend is implemented against this contract. The endpoints and database changes below are proposed backend work, not completed or database-tested features. The sample preview is not a live admin system.

This extends the [campaign approval contract](admin-campaign-moderation-contract.md). It adds account suspension/reactivation, review history, removal from public view and recoverable campaign deletion. Unice handles the frontend; coordinate the backend implementation with Kim and Rajita. These extra endpoints do not change the agreed dedicated-admin setup: there is no role editor, admin promotion, public admin registration or account-deletion feature.

## Frontend entry points

| Page | What it needs |
|---|---|
| `/admin/users` | Search/filter accounts; suspend or reactivate ordinary users and business owners |
| `/admin/campaigns/:id` | Existing campaign detail; proposed approval API; paginated review history; remove approved content from public view; soft-delete a campaign |

All requests need a valid Bearer token, a matching active session and an active database user whose current role is `admin`. Browser role checks are not permission enforcement. Never rely only on a role saved in local storage or an old JWT claim.

## 1. List accounts

`GET /api/admin/users?page=1&pageSize=10&search=alex&status=active`

- `page`: integer, minimum 1; default 1.
- `pageSize`: integer from 1 to 100; default 10.
- `search`: optional trimmed text, maximum 150 characters; match name or email without case sensitivity.
- `status`: omitted, `active` or `suspended`.
- Sort by `createdAt` descending, then numeric `id` descending. `total` is the number matching the filters before pagination. A page beyond the end returns `200` with an empty `users` array.

Return `200`:

```json
{
  "users": [
    {
      "id": 8,
      "name": "Alex Example",
      "email": "alex@example.test",
      "role": "public",
      "status": "active",
      "createdAt": "2026-10-01T06:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1
}
```

Roles are exactly `public`, `business_owner` or `admin`. Return only these account fields: never include password hashes, tokens, session contents or internal model attributes. The admin account can appear in the list, but its controls are disabled.

## 2. Suspend or reactivate an account

`PATCH /api/admin/users/:id/status`

```json
{ "status": "suspended" }
```

Only `status` is accepted; values are `active` or `suspended`. A request to change the caller's own account or **any** admin account must return `403 FORBIDDEN`, including requests made outside the browser. Do not accept `role`, an actor ID or ownership fields.

Return `200` with `{ "user": ... }`, using the complete account shape from the list response. The returned ID and status must match the requested change. Returning the existing state for an already-applied target status is safe; do not duplicate its audit event.

Suspension must update the user and expire **every active session belonging to that user** in the same transaction. Set each affected session's `status` to `expired` and `logoutAt` to the server time. Login and protected-request middleware must check current account status, so a suspended user cannot receive a new session or reuse an older one. Reactivation allows a new login; it must not restore old sessions. Keep the account, campaigns and other records intact.

Record who changed the status, the target account, previous/new status and server time. Lock and recheck the user inside the transaction so session updates and the audit event match the actual transition. This endpoint sets the requested state; it does not include an optimistic browser-version token. Return `409 ACCOUNT_STATE_CHANGED` if a transition cannot be applied under the server's current rules. The frontend reloads after `409`.

## 3. Campaign review history

`GET /api/campaigns/admin/:id/reviews?page=1&pageSize=10`

Use the same page limits as account lists. Sort by `reviewedAt` descending, then numeric review `id` descending. Return `200`:

```json
{
  "reviews": [
    {
      "id": 14,
      "campaignId": 9,
      "adminId": 1,
      "action": "rejected",
      "comments": "Please add the event location.",
      "reviewedAt": "2026-10-01T06:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 10,
  "total": 1
}
```

`action` is `approved` or `rejected`; `comments` is a string or `null`. Return an empty array and `total: 0` when an existing campaign has no reviews. Missing or soft-deleted campaigns return `404 CAMPAIGN_NOT_FOUND`.

Use the existing `campaign_reviews` table. Preserve earlier review rows when a campaign is unpublished, edited or reviewed again. A campaign may have multiple decisions across separate pending-to-reviewed transitions; do not add a unique constraint on `campaign_id`. The moderation transaction must still prevent two successful decisions on the **same** pending transition.

## 4. Remove an approved campaign from public view

`PATCH /api/campaigns/admin/:id/publication`

```json
{
  "status": "pending",
  "reason": "The published event details need checking.",
  "expectedUpdatedAt": "2026-10-01T05:00:00.000Z"
}
```

Only an approved, non-deleted campaign can make this transition. Require `expectedUpdatedAt` copied from the loaded admin detail as canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`; invalid/missing versions return `422`. Lock the row and compare that version before applying the action; mismatch returns `409 CAMPAIGN_CHANGED`. A pending or rejected campaign returns `409 CAMPAIGN_STATE_CHANGED`. Require a trimmed, non-empty string `reason` of at most 2,000 characters. Reject unsupported body fields.

Return `200`:

```json
{ "campaign": { "id": 9, "status": "pending", "updatedAt": "2026-10-01T06:00:00.000Z" } }
```

Lock/check the campaign, update its status and append the management audit event in one transaction. Return an advanced saved `updatedAt` version so subsequent owner/admin actions cannot overwrite this change using old data; the [owner-management contract](owned-campaign-management-contract.md) defines version precision. Retain all prior approval/rejection history. The campaign is now private and requires a fresh approval before it becomes public again. Public list/detail and participation/enquiry requests must stop treating it as an approved campaign. Its authorised owner/admin reads can still return it.

Stop issuing public image links and invalidate public cached delivery where applicable. Previously issued signed links may remain usable until expiry; use short lifetimes and delivery controls appropriate to the required revocation window. Do not claim immediate image revocation while permanent public object URLs still expose the file.

## 5. Soft-delete a campaign

`DELETE /api/campaigns/admin/:id`

```json
{ "reason": "This campaign was submitted in error.", "expectedUpdatedAt": "2026-10-01T05:00:00.000Z" }
```

Require the same reason and saved-version rules as unpublishing, including a transactional version comparison and `409 CAMPAIGN_CHANGED` on mismatch. Allow deletion of a non-deleted pending, approved or rejected campaign. The frontend confirms the campaign title and ID and explains that it will be removed from browsing while records remain available for controlled recovery/audit.

Return **`204` with no body** only after the transaction commits. Do not call a permanent database destroy or cascade-delete reviews, participations or enquiries. A repeated request for an already-deleted campaign returns `404 CAMPAIGN_NOT_FOUND` without another audit event.

Advance `updatedAt` alongside the deletion metadata. Keep the deletion/audit schema shared with owner deletion. Both routes require a saved-version check; the admin endpoint additionally requires a reason.

All normal campaign reads and actions—including owner/admin lists, public detail, participation, enquiries and image-link issuance—must exclude or reject soft-deleted campaigns. Retain related records for audit; any existing related history read must not expose now-restricted campaign content. Recovery is a controlled backend operation; no restore UI is included in this frontend.

## Database work

The current schema already has user status, sessions and campaign review records. It does **not** implement the proposed deletion metadata or management audit log below. Add migrations and update model mappings rather than creating tables manually.

| API value | Existing model attribute | Existing SQL column |
|---|---|---|
| Account `id`, `name` | `User.userId`, `User.fullName` | `users.user_id`, `users.full_name` |
| `email`, `role`, `status` | `User.email`, `User.role`, `User.status` | Same underscored table columns |
| Session owner/status/end time | `UserSession.userId`, `status`, `logoutAt` | `user_sessions.user_id`, `status`, `logout_at` |
| Review `id`, campaign, admin | `CampaignReview.reviewId`, `campaignId`, `adminId` | `campaign_reviews.review_id`, `campaign_id`, `admin_id` |
| Review action/comment/time | `CampaignReview.action`, `comments`, `reviewedAt` | `campaign_reviews.action`, `comments`, `reviewed_at` |

`UserSession` and `CampaignReview` use `timestamps: false`; do not query non-existent `created_at` or `updated_at` columns on those tables.

Proposed migrations:

1. Add nullable `campaigns.deleted_at` (UTC timestamp), `deleted_by` (actor user ID), and `deletion_reason` (text, API-limited to 2,000 characters). Add matching Sequelize attributes `deletedAt`, `deletedBy`, `deletionReason` and a consistent non-deleted query scope. Coordinate with owner-management work so the deletion columns are created **once**, not in conflicting migrations.
2. Add a `management_audit_events` table with generated ID, actor user ID, target type/ID, action, previous/new state, reason where required, and server UTC time. Actions include `campaign_unpublished`, `campaign_deleted`, `user_suspended` and `user_reactivated`. Do not overload `CampaignReview.action`, which remains `approved|rejected`.
3. Index the relevant target/time and user/session-status queries. Preserve audit rows and referenced user/campaign records; avoid destructive cascade rules. Use transactions for every state change plus its audit/session updates.

Frontend UI provides approval/rejection history, not a general management-audit browser. The broader log is a server accountability requirement, not a new page being claimed as complete.

## Errors and integration checks

Use the [shared error envelope](shared-conventions.md): `401` for invalid sessions, `403` for forbidden/admin-account changes, `404` for unknown/deleted targets, `409` for a changed state, `422` for invalid fields, and generic `500` for unexpected failures. Use `fieldErrors.reason` or `fieldErrors.status` for correctable input errors. A client must not receive success when any required database write failed.

On an unreadable response or uncertain network failure, the frontend does not claim success or offer an immediate repeat. It asks the admin to reload current data first; the original request may have committed.

Before connecting the real API, test:

- Guests, ordinary users, business owners, suspended users and expired sessions cannot access any admin data/action.
- An admin cannot change their own or another admin account, even with a hand-written request; extra role/actor fields are rejected.
- Suspending a user invalidates all of their active sessions. Reactivation requires a fresh login.
- Lists have stable order, correct totals, working filters and empty pages beyond the end; sensitive account fields never leak.
- Review history retains every past decision and returns only rows for the requested campaign.
- Unpublishing/deleting removes public access and blocks new participation/enquiry actions; private image delivery follows the updated visibility.
- A failed transaction leaves neither a partial state change nor a stray audit event. Concurrent review/unpublish/delete actions are locked and rechecked.
- Owner edits or other admin changes after detail loading cause `409` on old-version approval/unpublish/delete, with no mutation or extra audit row. Follow-up actions use the new version from a confirmed response or a fresh GET.
- Deletion is recoverable and does not erase linked reviews, participations or enquiries. Duplicate deletion does not create duplicate audit events.
- All successful bodies/status codes match the examples; the UI reloads safely after conflicts and uncertain saves.
