# Campaign posting and image extension

**Status: implemented frontend contract; backend extension remains proposed.** The browser now sends these requests. Preview responses are sample data, not a backend or database implementation.

The [current backend contract](campaign-posting-contract.md) accepts text-only submissions from public users. Extend that same `POST /api/campaigns` route for the following workflow. Before the extension is implemented, the current backend rejects `imageId` and business-owner submissions; the frontend shows that failure instead of claiming success.

## Business posting

Extend submission to an active `business_owner` after the [profile workflow](business-profile-contract.md) exists. `/business/campaigns/new` first requests `GET /api/business/me`. If the response contains `business: null`, it links to `/business/profile` and blocks submission until a profile exists. The server independently selects the owner's linked business and creator; the client cannot select another owner or business. A missing profile returns `409 BUSINESS_PROFILE_REQUIRED`.

A business-owner account alone does not create the Business record. Registration, profile setup and a newly registered owner's first post must be tested together. The [owner read endpoint](campaign-read-contract.md) returns submission status and review feedback.

The proposed response distinguishes `cause` from `business` by the business association. This type mapping must be consistent across list and detail responses. It does not require a separate type endpoint.

Both public and business forms send the same JSON fields. Retain every validation rule in the current contract and add optional `imageId`, which must be a non-empty string when supplied. The form omits it when no photo is selected. Never accept `type`, `businessId`, `createdBy`, `status` or `role` from these forms.

```json
{
  "title": "Local Repair Afternoon",
  "description": "Bring a small household item for a free repair workshop.",
  "categoryId": 1,
  "targetAudience": "Local residents",
  "startDate": "2026-10-20",
  "endDate": "2026-10-20",
  "imageId": "img_example_reference"
}
```

The server sets `createdBy` from the current user, `businessId` from that user's Business row for `business_owner` (otherwise `null`), and `status: "pending"`. A public account cannot attach a business. An admin cannot use this submission endpoint. Return `201 {"campaign": <campaign object>}`; the frontend requires a positive integer `id`, a non-empty `title` and `status: "pending"`. Use the [shared read object](campaign-read-contract.md#campaign-object) for the remaining response fields.

## Upload one campaign image

`POST /api/campaign-images`, authenticated active `public` or `business_owner`.

Send one `file` using `multipart/form-data`; let the browser set the boundary. Proposed limits are JPEG, PNG or WebP and at most 5 MB (5,000,000 bytes).

Proposed `201` response:

```json
{
  "imageId": "img_example_reference",
  "contentType": "image/jpeg",
  "sizeBytes": 182400,
  "expiresAt": "2026-10-02T04:00:00.000Z"
}
```

The `imageId` is an opaque server-issued reference, not a URL or a browser preview ID. `expiresAt` must be a future ISO UTC timestamp. The frontend uploads first, then submits the campaign only after receiving a valid reference. It retains that reference across ordinary field-validation retries, reuploads once it expires, and clears it when a different image is selected or removed. Implement these backend rules:

- Validate the decoded content, extension, declared type and size. Generate the storage name on the server.
- Record upload ownership. Allow only the authenticated user's valid, unattached image to be selected.
- Keep unsubmitted and pending/rejected images restricted to the owner and authorised reviewer.
- Expire unattached uploads after a proposed 24 hours, report `expiresAt`, and clean up orphaned files/records.
- Attach the image consistently with campaign creation. Failed saves must not consume the reference.
- Reject an unknown, expired, already attached or another user's reference without exposing private information.
- Deliver approved images publicly through the agreed storage path. Store a stable reference, not an expiring download URL.

Use a database transaction and lock the upload row when checking ownership/expiry/attachment and creating the campaign. Two simultaneous submissions cannot consume the same reference. Object storage and SQL do not share a transaction: write the object privately first, then its metadata, and clean up an object if metadata persistence fails. Unattached cleanup must exclude attached uploads even after their original expiry.

An `<img>` request cannot include the API's Bearer header. Owner/admin read responses therefore supply a short-lived signed `imageUrl` for a restricted image; it must work directly as the image `src`. Use a short validity such as five minutes and refresh it when the page is reloaded. Approved public reads supply a stable public delivery URL whose handler checks approval, or another agreed stable approved-only delivery path. Never persist signed URLs in `campaigns.image_url`. URL possession can grant temporary access until expiry, so do not log or index private signed URLs.

Proposed errors include `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE` and `422 VALIDATION_FAILED`. The proposed [shared error conventions](shared-conventions.md) describe the envelope.

## Database and integration work

The existing nullable `campaigns.image_url VARCHAR(500)` column is not an upload system. Add a migration/model for `campaign_images` (suggested name):

| Column | Required purpose |
|---|---|
| `image_id` | Opaque string primary key, generated by server, e.g. `VARCHAR(100)` |
| `owner_id` | Non-null FK to `users.user_id`; upload ownership |
| `storage_key` | Non-null unique private object key, e.g. `VARCHAR(500)`; never a signed URL |
| `content_type` | Validated JPEG/PNG/WebP MIME string |
| `size_bytes` | Positive integer, no more than 5,000,000 |
| `expires_at` | UTC expiry for an unattached upload |
| `campaign_id` | Nullable unique FK to `campaigns.campaign_id`; one image per campaign |
| `created_at`, `updated_at` | Audit timestamps |

Index ownership and the unattached-expiry cleanup query. Define foreign-key and object cleanup behaviour in the migration; avoid silently deleting shared campaign data. Keep existing seeded `image_url` values compatible. New uploads resolve via `campaign_images.storage_key`, with campaign status deciding delivery. Update Sequelize associations and the ERD. These additions are a proposed migration design, not an existing table.

### Replacing or removing an existing photo

The [owner-edit frontend](owned-campaign-management-contract.md) uses the same upload endpoint/reference as creation. Its PATCH body either omits both photo fields (keep the photo), supplies `imageId` (replace it), or supplies `removeImage:true` (remove it). Both fields together are invalid. The current campaign statuses remain pending, approved and rejected; no draft status is being introduced.

For replacement, lock the campaign and check `expectedUpdatedAt` first, then lock and validate the new upload's current owner, expiry and unattached state. Within that same transaction, detach the old `campaign_images.campaign_id` before attaching the new image so the unique campaign association is preserved. Clear the legacy `campaigns.image_url` fallback, save the changed campaign as pending, and advance its version. If any step fails, roll back the association and campaign changes; the new reference must remain available for an ordinary validation retry.

For removal, detach the current upload if one exists **and** set legacy `campaigns.image_url` to `NULL`, so the deleted photo does not reappear through an old fallback. Do not delete the storage object before the database transaction commits. Mark the detached object for the agreed cleanup/retention process; attached uploads must never be deleted simply because their original unattached expiry has passed. Lock related records consistently to avoid a create/replacement race attaching the same reference twice.

After edit/removal/unpublish/soft-delete, public delivery must recheck the new campaign state and relevant association. Expire/invalidate public caches as required. Previously issued signed URLs can remain usable until their short expiry; do not claim an instantaneous revocation that the storage configuration cannot enforce. Set a restrictive referrer policy for pages using private signed URLs and keep those URLs out of analytics/logs.

The sample preview demonstrates these interactions in browser storage. It does not implement SQL ownership, private storage, expiry cleanup or signed delivery. Test those with the real API before describing images as integrated.
