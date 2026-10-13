# Owner campaign editing and removal

This contract supports `/my-campaigns/:id/edit`. Owner reads, edit/resubmit and soft-delete are merged through PR #19 and deployed at [CauseConnect on AWS](https://52.62.2.87). Local regression and scoped production edit/conflict/deletion checks passed. The [release evidence](../evidence/stage-3/additional-apis/README.md#aws-release--14-october-2026) records the exact revision and limits.

Both public users and small-business owners can manage their own campaigns. Admin review stays on the separate [admin endpoints](admin-campaign-moderation-contract.md). See the [campaign read contract](campaign-read-contract.md) for the owner list and the [photo extension](campaign-posting-future-proposal.md) for upload references.

## Routes and access

| Method and path | Purpose | Success |
|---|---|---|
| `GET /api/campaigns/mine/:id` | Load the owner's editable campaign and current version | `200`, campaign object |
| `PATCH /api/campaigns/mine/:id` | Save all editable fields and resubmit for review | `200`, `{ "campaign": ... }` |
| `DELETE /api/campaigns/mine/:id` | Soft-delete the owner's campaign | `204`, no response body |

Every request needs `Authorization: Bearer <token>`. PATCH and DELETE send JSON. Use a positive integer ID and register `/mine/:id` before any generic campaign route that could capture it.

Check the active session, the current account status and its current `public` or `business_owner` role in the database. Require `campaign.created_by` to match the authenticated user; never take an owner or business ID from the request. An admin cannot use these owner-write routes. Another owner's campaign, a missing campaign and an already-deleted campaign all return the same `404` response. A business campaign must remain attached to the owner's existing business; editing does not transfer ownership or change campaign type.

## Owner detail response

Return a bare campaign object for GET. IDs and `categoryId` are JSON integers. `updatedAt` is the exact saved UTC version, including milliseconds.

```json
{
  "id": 42,
  "title": "Neighbourhood garden",
  "description": "Help plant and care for the shared garden.",
  "categoryId": 1,
  "category": "Environment",
  "type": "cause",
  "targetAudience": "Local residents",
  "startDate": "2026-10-10",
  "endDate": "2026-10-11",
  "imageUrl": "https://media.example.com/campaigns/garden.jpg",
  "status": "rejected",
  "createdBy": 3,
  "businessId": null,
  "createdAt": "2026-10-01T04:10:00.000Z",
  "updatedAt": "2026-10-02T02:00:00.000Z",
  "review": { "comments": "Please clarify the dates." }
}
```

`review` may be `null`; any returned `review.comments` must be text. Optional audience/image fields may be `null`. Legacy campaigns can have missing dates, but saving requires valid start and end dates. The form uses the existing public category lookup and submits the selected numeric ID, not its display name.

## Save and resubmit

PATCH sends the complete editable form, not just the changed fields:

```json
{
  "title": "Neighbourhood garden",
  "description": "Help plant and care for the shared garden.",
  "categoryId": 1,
  "targetAudience": "Local residents",
  "startDate": "2026-10-10",
  "endDate": "2026-10-11",
  "expectedUpdatedAt": "2026-10-02T02:00:00.000Z"
}
```

Apply the same title, description, category, audience and real-date validation as [campaign posting](campaign-posting-contract.md). Blank `targetAudience` becomes `null`. Reject unknown fields, including `id`, `createdBy`, `businessId`, `type`, `status`, `role`, `updatedAt`, `deletedAt` and client-selected image URLs.

Photo changes are optional:

- Omit `imageId` and `removeImage` to keep the existing photo.
- Send `imageId` from a successful `POST /api/campaign-images` upload to replace the photo. Verify that the reference is unexpired, belongs to this owner and is eligible for attachment.
- Send `removeImage: true` to remove the current photo.
- Reject both fields together, an empty/non-string image reference, or a `removeImage` value other than `true`.

On success, return `{ "campaign": <updated campaign object> }`. Its ID must match the requested campaign, status must be `pending` and `updatedAt` must advance. The existing public list/detail must stop exposing an approved campaign as soon as the edit is committed. A rejected campaign returns to the pending queue. Preserve previous reviews for history without treating an old approval as approval of the new content.

## Version checks and transactions

`expectedUpdatedAt` is required for PATCH and DELETE. Use canonical UTC `YYYY-MM-DDTHH:mm:ss.sssZ`, copied unchanged from the owner GET response. It is a concurrency token, not a client instruction to set the server clock.

Within one transaction:

1. Lock and recheck the current account, then its active session, then the non-deleted campaign and ownership. This ordering is shared with moderation, engagement and image writes.
2. Compare its exact saved version with `expectedUpdatedAt`. If different, return `409 CAMPAIGN_CHANGED` and make no change.
3. Validate the new data and image reference, then apply the edit or soft deletion.
4. Advance `updatedAt` beyond the previous version, commit, and only then send success.

Persist millisecond precision for this protocol, and make the version advance even when two changes occur in the same millisecond. Do not truncate the saved version to whole seconds or compare only the date. An atomic conditional update with a checked affected-row count is another valid way to enforce the same concurrency rule. Admin decisions must also advance the version so an owner cannot overwrite a newer review unnoticed.

Migration `20261013090000-campaign-updated-at-milliseconds.js` and the Campaign model preserve `updatedAt` with MySQL `DATETIME(3)` / Sequelize `DATE(3)`. Owner and admin APIs use this same version column. The next timestamp is at least the previous saved version plus one millisecond, generated inside the transaction and returned from the saved state. Do not modify the older applied create-table migration or add a second version column.

Approval/rejection, unpublish and admin deletion also send `expectedUpdatedAt`. An owner edit committed first must invalidate an already-open admin review; checking only `status:pending` would let the admin approve content they never saw. Apply the [admin version rules](admin-campaign-moderation-contract.md#proposed-review-action) as well as the owner version check.

## Remove a campaign

The frontend asks the author to type the campaign title before issuing DELETE:

```json
{ "expectedUpdatedAt": "2026-10-02T02:00:00.000Z" }
```

Use `deleted_at`; this is not a permanent database deletion. Removed campaigns are excluded from public browsing, owner active lists and normal review queues, and return `404` from detail/edit routes. New joins/rejoins and enquiries reject removed campaigns. An existing participant can still read or withdraw their own record, without private campaign content. Reviews and engagement history are retained. The title confirmation is a browser safeguard, not a replacement for server authorization/version checks.

Use the shared deletion metadata and audit migration described in [admin management](admin-management-contract.md#database-work), not a separate owner-deletion schema. Set `deleted_by` to the authenticated owner, allow `deletion_reason` to remain `NULL` for this route, and record the owner actor in the deletion audit event.

Return `204` only after the deletion transaction commits. Do not return a success-shaped `200` JSON body. If the browser loses the response, a later owner GET returning `404` confirms the campaign is unavailable; do not automatically repeat the deletion.

## Errors and frontend recovery

Use the shared error envelope: `{ "status": 422, "code": "VALIDATION_FAILED", "message": "Check the campaign details.", "fieldErrors": { "categoryId": "Choose an available category." } }`.

| Status | Expected handling |
|---|---|
| `401` | No active session; prompt for login and stop writes |
| `403` | Account/role cannot perform this operation; stop writes |
| `404` | Missing, deleted or not owned; do not expose another owner's data |
| `409` | `CAMPAIGN_CHANGED`; reload the saved version before editing again |
| `422` | Correct fields; keep the form's values. Use `imageId` or `file` for a rejected image reference |
| `5xx` or interrupted connection | Outcome may be unknown; inspect the saved version before retrying |

The frontend also blocks further edits/removal when a mutation returns an unexpected success status or malformed confirmation, including HTTP `200`/`204` with the wrong shape. It does not assume that an invalid response means the database write failed. Reloading deliberately discards unsaved edits and fetches the saved version. An image-upload failure before PATCH does not imply an unknown campaign save, so the author can retry that upload.

## Backend integration checks

- Public and business owners can read/edit/remove only their own non-deleted records; guests, admins, inactive accounts and other owners cannot.
- Edit pending, approved and rejected campaigns; every successful edit is pending, with the correct owner, business and type preserved.
- Two clients using the same version cannot both modify the row. Admin review racing an edit also causes a conflict for the stale version.
- A stored timestamp retains milliseconds after reload, and two immediate changes still produce strictly increasing versions. An owner edit committed before a stale admin approval does not get approved.
- Omitted photo fields keep the current photo; replacement/removal works; wrong-owner, expired and conflicting references are rejected without partial changes.
- Approved content disappears from public routes after an edit or removal, and remains unavailable until the edited campaign is approved again.
- Soft deletion preserves history, excludes the record from active lists and blocks new joins/rejoins and enquiries; existing own participation remains withdrawable.
- Validation failures do not mutate data. Return the exact success status and body only after commit.
- Test browser recovery after a lost response: no duplicate save/delete is sent until the author reloads.

This checklist defines the acceptance scope; use the dated release evidence for what was actually run locally and in production. Do not infer that every checklist case was repeated on the deployed API.
