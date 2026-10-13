# Campaign posting and image extension

**Status, 13 October 2026:** Image upload, attachment/replacement/removal and controlled delivery are implemented in `feature/stage3-additional-apis` under AWT-175. They still need merge, deployment and cloud verification. This filename is retained so existing links keep working. Sample-preview responses remain separate from real API evidence.

The [current backend contract](campaign-posting-contract.md) accepts public submissions and business submissions linked to the authenticated owner's existing Business row. This branch adds optional `imageId` on that same `POST /api/campaigns` route. GET/PUT business profile remains missing; a new business owner's full browser journey is not yet complete.

## Business posting

Submission already supports an active `business_owner` with an existing profile. The remaining [profile workflow](business-profile-contract.md) is Kim's work: `/business/campaigns/new` first requests `GET /api/business/me`. Once implemented, a `business: null` response links to `/business/profile` and blocks submission until a profile exists. The server independently selects the owner's linked business and creator; the client cannot select another owner or business. A missing profile on POST returns `409 BUSINESS_PROFILE_REQUIRED`.

A business-owner account alone does not create the Business record. Registration, profile setup and a newly registered owner's first post must be tested together. The [owner read endpoint](campaign-read-contract.md) returns submission status and review feedback.

The response distinguishes `cause` from `business` by the business association, consistently across list and detail responses. It does not require a separate type endpoint.

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

Send one `file` using `multipart/form-data`; let the browser set the boundary. Limits are non-animated JPEG, PNG or WebP, at most 5 MB (5,000,000 bytes) and 16 million decoded pixels. The server decodes and re-encodes accepted images, strips metadata and rejects invalid or mismatched content. Each account may hold at most 20 unexpired, unattached uploads; the server accepts at most two uploads in flight at once.

`201` response:

```json
{
  "imageId": "img_example_reference",
  "contentType": "image/jpeg",
  "sizeBytes": 182400,
  "expiresAt": "2026-10-02T04:00:00.000Z"
}
```

The `imageId` is an opaque server-issued reference, not a URL or a browser preview ID. `expiresAt` is a future ISO UTC timestamp. The frontend uploads first, then submits the campaign only after receiving a valid reference. It retains that reference across ordinary field-validation retries, reuploads once it expires, and clears it when a different image is selected or removed. The backend enforces:

- Validate the decoded content, extension, declared type and size. Generate the storage name on the server.
- Record upload ownership. Allow only the authenticated user's valid, unattached image to be selected.
- Keep unsubmitted and pending/rejected images restricted to the owner and authorised reviewer.
- Expire unattached uploads after 24 hours, report `expiresAt`, and clean up expired unattached files/records in bounded batches.
- Attach the image consistently with campaign creation. Failed saves must not consume the reference.
- Reject an unknown, expired, already attached or another user's reference without exposing private information.
- Deliver approved images publicly through the agreed storage path. Store a stable reference, not an expiring download URL.

Account/session and campaign/upload locks protect ownership, expiry and attachment inside the transaction. Two simultaneous submissions cannot consume the same reference. Filesystem storage and SQL do not share a transaction: a file is written privately, then metadata is saved, with file cleanup if persistence fails. Unattached cleanup excludes attached uploads even after their original expiry.

An `<img>` request cannot include the API's Bearer header. Owner/admin reads supply a five-minute signed-ticket `imageUrl` usable directly as `src`. Delivery rechecks the matching active session, current account/role, image association and campaign visibility; logout/suspension or image replacement cannot be bypassed with an old ticket. Approved public reads supply `/api/campaign-images/:imageId/content`; its handler checks approval and non-deletion on every request. Never persist signed URLs in `campaigns.image_url`, log them or put them in analytics.

Errors include `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE`, `422 VALIDATION_FAILED`, `429 IMAGE_UPLOAD_LIMIT` and `503 IMAGE_STORAGE_FULL`/`UPLOAD_BUSY`. The [shared error conventions](shared-conventions.md) describe the envelope.

### Storage on the existing server

Files stay in a private, persistent directory on the existing EC2 server, outside the application checkout and web root. Production requires an absolute `CAMPAIGN_UPLOAD_DIR`. The default total upload limit is **512 MiB**, and writes preserve at least **2 GiB** of free disk. `CAMPAIGN_UPLOAD_MAX_BYTES` and `CAMPAIGN_UPLOAD_MIN_FREE_BYTES` control these limits. Storage exhaustion returns an error instead of filling the server disk.

This implementation needs no new S3 bucket or other cloud resource. The directory still needs backup, permissions and deployment configuration; local implementation does not prove those cloud settings are in place. See [deployment preparation](../../infra/README.md). Cleanup removes only expired, unattached generated images; attached images are retained.

## Database and integration work

The existing nullable `campaigns.image_url VARCHAR(500)` remains a legacy fallback. This branch adds `campaign_images` through `20261013221000-create-campaign-images.js` and its model:

| Column | Required purpose |
|---|---|
| `image_id` | Opaque string primary key, generated by server, `VARCHAR(64)` |
| `owner_id` | Non-null FK to `users.user_id`; upload ownership |
| `storage_key` | Non-null unique private file key, `VARCHAR(100)`; never a signed URL |
| `content_type` | Validated JPEG/PNG/WebP MIME string |
| `size_bytes` | Positive integer, no more than 5,000,000 |
| `expires_at` | UTC expiry for an unattached upload |
| `campaign_id` | Nullable unique FK to `campaigns.campaign_id`; one image per campaign |
| `created_at`, `updated_at` | Audit timestamps |

The migration indexes ownership and unattached expiry and preserves existing campaigns. Seeded `image_url` values remain compatible. New uploads resolve through `campaign_images.storage_key`, with campaign status deciding delivery. Apply this migration with the repository workflow; do not create another image table. The database/ERD documentation must include this schema before submission.

### Replacing or removing an existing photo

The [owner-edit frontend](owned-campaign-management-contract.md) uses the same upload endpoint/reference as creation. Its PATCH body either omits both photo fields (keep the photo), supplies `imageId` (replace it), or supplies `removeImage:true` (remove it). Both fields together are invalid. The current campaign statuses remain pending, approved and rejected; no draft status is being introduced.

For replacement, lock the campaign and check `expectedUpdatedAt` first, then lock and validate the new upload's current owner, expiry and unattached state. Within that same transaction, detach the old `campaign_images.campaign_id` before attaching the new image so the unique campaign association is preserved. Clear the legacy `campaigns.image_url` fallback, save the changed campaign as pending, and advance its version. If any step fails, roll back the association and campaign changes; the new reference must remain available for an ordinary validation retry.

For removal, detach the current upload if one exists **and** set legacy `campaigns.image_url` to `NULL`, so the deleted photo does not reappear through an old fallback. Do not delete the storage object before the database transaction commits. Mark the detached object for the agreed cleanup/retention process; attached uploads must never be deleted simply because their original unattached expiry has passed. Lock related records consistently to avoid a create/replacement race attaching the same reference twice.

After edit/removal/unpublish/soft-delete, delivery rechecks campaign state and association. Responses use no-store caching. Signed tickets are short-lived and checked against current account/session state; already downloaded bytes cannot be recalled. Keep private URLs out of analytics/logs and use a restrictive referrer policy.

The sample preview demonstrates these interactions in browser storage. Real storage/SQL tests belong to the isolated regression suite; cloud delivery and backup checks must be recorded separately after deployment.
