# Campaign posting and image extension

**Status, 14 October 2026:** AWT-175 image upload, attachment/replacement/removal and controlled delivery, including the review fixes, are deployed at [CauseConnect on AWS](https://52.62.2.87), application commit `fc9f9594b9f27e70ad5dc0b2d8f1ee1d754e0949`. The [current release evidence](../evidence/stage-3/signup-minimum-six/README.md) records exact release identity, local checks and eight fresh hosted API groups. The [PR #21 review-fix receipt](../evidence/stage-3/review-hardening/README.md) and earlier [PR #19 receipt](../evidence/stage-3/additional-apis/README.md) remain historical, including their browser/backup checks. This filename is retained so existing links keep working. Sample-preview responses remain separate from real API evidence.

The [current backend contract](campaign-posting-contract.md) accepts public submissions and business submissions linked to the authenticated owner's existing Business row. The same `POST /api/campaigns` route accepts optional `imageId`. GET/PUT business profile is not merged/deployed: open, conflicting [PR #22](https://github.com/acs-wil-wd-team1/social-awareness-web-app/pull/22) provides an implementation awaiting resolution/review. Live profile routes still return `404`; browser business submission is blocked for both new and existing owners because its form first requests the profile. Direct existing-profile API posting is not evidence of a completed hosted business journey.

## Business posting

Direct API submission already supports an active `business_owner` with an existing profile. The remaining [profile workflow](business-profile-contract.md) is Kim's work: `/business/campaigns/new` first requests `GET /api/business/me` and is currently blocked for every owner. Once implemented, a `business: null` response links to `/business/profile` and blocks submission until a profile exists. The server independently selects the owner's linked business and creator; the client cannot select another owner or business. A missing profile on POST returns `409 BUSINESS_PROFILE_REQUIRED`.

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

Send one `file` using `multipart/form-data`; let the browser set the boundary. Limits are non-animated JPEG, PNG or WebP, at most 5 MB (5,000,000 bytes) and 16 million decoded pixels. The server decodes and re-encodes accepted images, strips metadata and rejects invalid or mismatched content. The server accepts at most two uploads in flight at once.

**Current retained-storage limit:** each owner may
retain at most **20 photos and 50 MiB of encoded photo files** by default. All their
image rows count until the bounded cleanup actually removes the files and rows:
attached photos (including soft-deleted campaigns), unattached uploads, and expired
or detached images awaiting cleanup. Expiry alone does not free the quota.
Replacement/removal may therefore require waiting for scheduled cleanup; deleting
a whole campaign retains its attached image rather than silently purging data.
The account lock makes concurrent upload checks share the same quota.

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

Errors include `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE`,
`422 VALIDATION_FAILED`, `429 IMAGE_UPLOAD_LIMIT` and
`503 IMAGE_STORAGE_FULL`/`UPLOAD_BUSY`. The current source also returns
`429 IMAGE_OWNER_QUOTA_REACHED` for the retained account limit and an explicit
`422 IMAGE_DIMENSIONS_TOO_LARGE` above 16 million pixels, with resize guidance.
Unsupported HEIC/HEIF photos must be exported as JPEG/PNG/WebP; reducing file bytes
alone does not reduce pixel dimensions. The [shared error conventions](shared-conventions.md)
describe the envelope. The dated release receipt, not this contract alone,
establishes which changes are live.

### Storage on the existing server

Files stay in a private, persistent directory on the existing EC2 server, outside the application checkout and web root. Production requires an absolute `CAMPAIGN_UPLOAD_DIR`. The default total upload limit is **512 MiB**, and writes preserve at least **2 GiB** of free disk. `CAMPAIGN_UPLOAD_MAX_BYTES` and `CAMPAIGN_UPLOAD_MIN_FREE_BYTES` control these limits. Storage exhaustion returns an error instead of filling the server disk.

`CAMPAIGN_UPLOAD_OWNER_MAX_PHOTOS` accepts 1–100
(default 20) and `CAMPAIGN_UPLOAD_OWNER_MAX_BYTES` accepts 1–268,435,456 bytes
(default 52,428,800 = 50 MiB). These are server-only limits; invalid values must be
rejected rather than silently disabling the safeguard. Raising quotas does not
increase disk capacity or remove the global cap/free-space reserve.

This implementation needs no new S3 bucket or other cloud resource. The deployed release uses the existing server's private persistent directory. Keep its permissions, limits and paired database/file backups in place; backup/restart evidence is a separate check from successful HTTP image delivery. See [deployment preparation](../../infra/README.md) and [current release evidence](../evidence/stage-3/signup-minimum-six/README.md). Cleanup removes only expired, unattached generated images; attached images are retained.

## Database and integration work

The existing nullable `campaigns.image_url VARCHAR(500)` remains a legacy fallback. Migration `20261013221000-create-campaign-images.js` and its model add `campaign_images`:

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

The sample preview demonstrates these interactions in browser storage. Real storage/SQL regression, production photo delivery, hosted-browser and backup/restart checks are recorded separately in the release evidence. Successful backup integrity and restart persistence do not establish full restoration or offsite recovery.
