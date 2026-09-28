# Later campaign posting and image work

**Status: proposal, not implemented by the current submission slice.**

The [current campaign contract](campaign-posting-contract.md) accepts text-only submissions from public users. The following describes possible extensions for business owners and images. Do not send these proposed fields to the current route: they are rejected.

## Business posting

Extend submission to an active `business_owner` only after the profile workflow exists. The server selects the owner's linked business and creator; the client cannot select another owner or business. A missing profile would return `409 BUSINESS_PROFILE_REQUIRED`.

A business-owner account alone does not create the Business record. Registration, profile setup and a newly registered owner's first post need to be tested together. An owner-submissions read endpoint is also needed for later status and rejection-reason views.

The proposed response distinguishes `cause` from `business` by the business association. This type mapping must be consistent across list and detail responses. It does not require a separate type endpoint.

## Upload one campaign image

Proposed endpoint: `POST /api/campaign-images`, authenticated `public` or `business_owner`.

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

The `imageId` would be an opaque server-issued reference, not a URL or a browser preview ID. A later submission request could accept this reference, after the backend implements the following rules:

- Validate the decoded content, extension, declared type and size. Generate the storage name on the server.
- Record upload ownership. Allow only the authenticated user's valid, unattached image to be selected.
- Keep unsubmitted and pending/rejected images restricted to the owner and authorised reviewer.
- Expire unattached uploads after a proposed 24 hours, report `expiresAt`, and clean up orphaned files/records.
- Attach the image consistently with campaign creation. Failed saves must not consume the reference.
- Reject an unknown, expired, already attached or another user's reference without exposing private information.
- Deliver approved images publicly through the agreed storage path. Store a stable reference, not an expiring download URL.

Proposed errors include `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE` and `422 VALIDATION_FAILED`. The proposed [shared error conventions](shared-conventions.md) describe the envelope.

## Database and integration work

The existing nullable `image_url` column is not an upload system. Ownership, expiry, attachment and protected delivery may need additional schema and storage work. Record any changes in migrations and update the ERD.

The original `/draft/campaigns/new` preview demonstrates image selection only. It does not implement this proposal. Test real upload, access boundaries, failed saves and cleanup before describing it as integrated.

Saving drafts, editing approved campaigns and resubmitting rejected campaigns also remain separate workflows. The current database statuses are pending, approved and rejected.
