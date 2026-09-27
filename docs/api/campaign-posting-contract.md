# Campaign posting and image API proposal

**Status:** Proposed for review; not implemented on main or verified against a real database.

The frontend prototype selects and previews an image and demonstrates form validation. It does not upload files or save campaigns.

## Category choices

`GET /api/campaigns/categories` — public

Proposed `200` response:

```json
{
  "categories": [
    { "id": 1, "name": "Environment" },
    { "id": 4, "name": "Education" }
  ]
}
```

Use these IDs in the campaign form. Category is the campaign's topic. Type distinguishes `cause` from `business` and is derived by the backend from the business association; it is not a separate user-selectable category or API.

## Upload one campaign image

`POST /api/campaign-images` — authenticated `public` or `business_owner`

Send `multipart/form-data` with one file in the `file` field. Let the browser set the multipart boundary. Proposed limits: JPEG, PNG or WebP, at most **5 MB (5,000,000 bytes)** per file.

Proposed `201` response:

```json
{
  "imageId": "img_example_reference",
  "contentType": "image/jpeg",
  "sizeBytes": 182400,
  "expiresAt": "2026-10-02T04:00:00.000Z"
}
```

The `imageId` is an opaque upload reference. It is not a public URL, AWS credential or client-generated preview ID. The API owns the storage configuration.

Proposed rules:

- Validate file content and decoding as well as extension, declared type and size. Generate the storage name on the server.
- Record upload ownership and allow a user to attach only their own valid, unattached image.
- Keep unsubmitted images private. Allow authorised owner/reviewer access through controlled delivery.
- Expire unattached uploads after 24 hours, reported by `expiresAt`. Clean up expired/unattached files and records; attaching an image removes the temporary expiry.
- On submission, attach the image and create the pending campaign consistently. A failed submission must not consume the image reference.
- Do not fetch arbitrary image URLs supplied by the user or expose permanent public links for pending/rejected images.

Errors follow [shared conventions](shared-conventions.md): `401`/`403` for access, `413 IMAGE_TOO_LARGE`, `415 UNSUPPORTED_IMAGE_TYPE`, or `422 VALIDATION_FAILED` with a `file` error for missing/multiple/corrupt files.

## Submit a campaign

`POST /api/campaigns` — authenticated `public` or `business_owner`

Proposed JSON request:

```json
{
  "title": "Community Garden Day",
  "description": "Help prepare a shared neighbourhood garden.",
  "categoryId": 1,
  "targetAudience": "Local residents",
  "startDate": "2026-10-10",
  "endDate": "2026-10-11",
  "imageId": "img_example_reference"
}
```

`targetAudience` and `imageId` may be `null` or omitted. All other fields are required. Without an image, the frontend displays a neutral placeholder.

| Field | Proposed rule |
|---|---|
| `title` | Trimmed, non-empty string; maximum 150 characters |
| `description` | Trimmed, non-empty string; maximum 5,000 characters |
| `categoryId` | Positive integer identifying an existing category |
| `targetAudience` | Optional string; maximum 255 characters after trimming; blank becomes `null` |
| `startDate` | Valid date string in `YYYY-MM-DD` format |
| `endDate` | Valid date string in `YYYY-MM-DD` format; on or after `startDate` |
| `imageId` | Optional non-empty string identifying the user's valid, unattached upload |

Reject unsupported fields, including `imageUrl`, `createdBy`, `businessId`, `type`, `status` and privilege fields. The server sets the signed-in creator, their linked business when applicable, and initial `pending` status.

Proposed `201` response:

```json
{
  "campaign": {
    "id": 9,
    "title": "Community Garden Day",
    "description": "Help prepare a shared neighbourhood garden.",
    "categoryId": 1,
    "category": "Environment",
    "type": "cause",
    "imageUrl": "/api/campaign-images/img_example_reference/content",
    "targetAudience": "Local residents",
    "startDate": "2026-10-10",
    "endDate": "2026-10-11",
    "createdBy": 3,
    "businessId": null,
    "status": "pending",
    "createdAt": "2026-10-01T04:10:00.000Z"
  }
}
```

`imageUrl` is server-produced delivery information or `null`, never the submission input. The example content route is proposed: pending/rejected images require owner/admin authentication, so the frontend must fetch protected content with its Bearer token before previewing it. Approved campaign images may be delivered publicly. Storage can instead use a short-lived authorised delivery URL; do not persist an expiring URL as the campaign's permanent storage reference.

A business campaign has the owner's `businessId` and `type: "business"`. A cause campaign has `businessId: null` and `type: "cause"`. Public list and detail responses should return the same type and category values.

Additional errors:

- `409 BUSINESS_PROFILE_REQUIRED` when a business owner has no linked profile.
- `422 VALIDATION_FAILED` with `imageId` when the reference is unknown, expired, already attached or belongs to another user. Do not reveal another user's image information.
- `422 VALIDATION_FAILED` with the relevant fields for invalid campaign data.

## Dependencies and database review

Registration currently creates a business-owner user without a Business record. A business-profile setup flow is required for new owners; a seeded account does not prove that journey. An authenticated own-submissions endpoint is also needed to display pending/approved/rejected outcomes. These supporting contracts remain to be defined.

The current schema has campaign creator, business, category, title, description, dates, audience and status fields. It also has a nullable `image_url`, but no upload-reference ownership/expiry model. The upload proposal needs database and storage design review, migrations where required, and updates to models and the ERD. Do not treat the existing URL column as proof that upload is implemented.

## Acceptance checks for implementation

- Guest/admin submissions are rejected under this proposed creation policy.
- A public user and a newly registered business owner with a completed profile each create a pending campaign.
- Incorrect field types, nonexistent categories and client-chosen ownership/status are rejected.
- Valid images upload and display; oversized, unsupported and corrupt files fail safely.
- Another user's image, an expired image or a used reference cannot be attached.
- Pending campaigns and images remain private; approval makes the permitted public content available.
- Failed saves leave no half-attached image; expired orphan uploads are removed.
- The same forms work with the real API/database, including errors, before integration is marked complete.
